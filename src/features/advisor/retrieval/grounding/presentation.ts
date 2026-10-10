import type { AdvisorAnswer } from "../../answers/answer";
import { advisorSystemPrompt } from "../../answers/presentation/persona";
import { promptWords } from "../../answers/presentation/promptLocale";
import type { Language } from "../../../../shared/i18n";
import { overlap } from "./text";

/**
 * 내용이 없는 문장. 인사말과, 모델이 지시문을 그대로 베낀 것.
 *
 * 페르소나는 인사말을 붙이지 말라고 이르고, 프롬프트도 한 번 더 이른다. 0.8B 는
 * 그래도 문단마다 "물론이죠." 를 달았다. 여덟 자가 안 되어 길이 문턱을 그냥
 * 지나쳤다. 규칙으로 못 막는 것은 코드가 지운다.
 *
 * 지시문 베끼기는 더 노골적이었다. "따라서 오공 시점으로 쓰십시오." 가 답 한복판에
 * 나왔다 — 프롬프트 머리말을 그대로 옮긴 것이다. 노트 3,723 건을 훑어보니
 * `십시오` 로 끝나는 문장은 **한 건도 없다.** 앱이 쓰는 말투가 아니므로, 그 꼴에
 * 프롬프트에만 있는 낱말이 함께 있으면 베낀 것으로 본다.
 */
const GREETING = /^(물론(이죠|입니다)|네|예|알겠습니다|좋은 질문(입니다|이네요)|다음과 같습니다)[.!,]?$/;

/**
 * 프롬프트가 모델에게 지시한 문장들. 답에 나오면 베낀 것이다.
 *
 * 낱말 목록을 손으로 적어 두는 대신 **프롬프트 원문과 대조한다.** 규칙이 바뀌면
 * 검사도 같이 바뀌므로 둘이 어긋날 일이 없다. 모델이 어미만 바꿔 옮기는 일이
 * 잦아서("...말하십시오" → "...설명합니다") 어미는 떼고 견준다.
 */
export function directives(lang: Language, answer: AdvisorAnswer | undefined): string[] {
  const w = promptWords(lang);
  /*
   * 페르소나도 함께 본다.
   *
   * 0.8B 가 "이 앱에 내장된 도우미이고 기기 안에서 동작합니다" 로 답을 시작했다.
   * 정체를 물었을 때 **그렇게 답하라**고 일러 둔 문장인데, 묻지도 않았는데 옮겨
   * 적은 것이다. 프롬프트 규칙과 같은 성격이므로 같은 자리에서 걸러 낸다.
   */
  const lines = [
    ...advisorSystemPrompt(lang).split("\n"),
    w.notesHeader,
    ...w.rules,
    w.closing.champion,
    w.closing.championWithNotes,
    w.closing.skills,
    w.closing.spell,
    w.closing.compare,
  ];
  // 상성 지시문은 두 이름이 박혀 있어 카드를 봐야 지을 수 있다.
  if (answer?.kind === "compare" && answer.matchup && answer.cards.length === 2) {
    const [me, enemy] = answer.cards;
    lines.push(w.matchup(me.name, enemy.name), w.closing.matchup(me.name, enemy.name));
  }
  return lines.flatMap((line) => line.split("\n")).map(strip);
}

/**
 * 어미와 기호를 떼어 견줄 수 있는 꼴로 만든다.
 *
 * 구두점도 뗀다. 모델이 카드를 옮길 때 "**[스킬 이름] 오공 P 바위 피부 (회복,
 * 분신)**" 처럼 괄호와 쉼표를 달고 오는데, 그것이 어절에 붙어 있으면 "회복," 과
 * "회복" 이 다른 낱말로 세어져 겹침이 0.55 로 떨어졌다. 원문과 같은 말인데도
 * 그대로 통과했다.
 */
function strip(line: string): string {
  return line
    .replace(/[*\-·()[\]{}<>,.:;!?"'`|/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(십시오|습니다|합니다|입니다)$/, "");
}

/**
 * 명령형으로 끝나는 문장. 앱의 말투가 아니다.
 *
 * 페르소나가 합니다체를 이르고, 사람이 검증한 노트 3,723 건(10,441 문장)에
 * `십시오` 로 끝나는 것이 **한 건도 없다.** 그러니 답에 나온 것은 프롬프트에서
 * 새어 나온 것이다. 실제로 0.8B 가 문단마다 "…를 오공 시점으로 쓰십시오" 를
 * 달았는데, 규칙 원문과 어절이 덜 겹쳐 대조로는 안 걸렸다.
 */
const IMPERATIVE = /십시오[.!]?$/;

export function isBoilerplate(sentence: string, directiveStems: string[], cardLines: string[] = []): boolean {
  const plain = sentence.replace(/\*\*/g, "").trim();
  if (GREETING.test(plain)) return true;
  if (IMPERATIVE.test(plain)) return true;
  const stem = strip(sentence);
  if (stem.length < 10) return false;
  if (directiveStems.some((other) => other.length >= 10 && overlap(stem, other) >= 0.6)) return true;
  // 카드를 그대로 옮겨 적은 줄. 조사가 없어 어절이 통째로 겹친다.
  return cardLines.some((line) => overlap(strip(line), stem) >= 0.7 && overlap(stem, strip(line)) >= 0.7);
}

/**
 * 묻지 않은 관점의 문단을 버린다.
 *
 * "오공 상대법" 을 물었는데 답이 **상대할 때** 와 **플레이할 때** 둘 다 나왔다.
 * 프롬프트는 이미 어느 쪽을 물었는지 못 박아 두는데(4B 는 11/11 로 따른다) 작은
 * 모델은 그 지시를 흘린다. 지시를 더 적는 대신 코드가 자른다 — 모델이 무엇을 쓰든
 * 묻지 않은 쪽은 화면에 안 나간다.
 *
 * 머리말이 없는 앞머리는 남긴다. 어느 쪽인지 밝히지 않은 글은 물은 쪽에 대한 말이다.
 */
export function keepAskedPerspective(text: string, answer: AdvisorAnswer | undefined, lang: Language): string {
  if (answer?.kind !== "champion") return text;
  const perspective = answer.notes?.perspective;
  if (!perspective || perspective === "both") return text;
  const w = promptWords(lang);
  const drop = perspective === "against" ? w.playing : w.against;
  const lines = text.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const heading = /^\s*\*\*(.+?)\*\*\s*$/.exec(line);
    if (heading) {
      skipping = heading[1].trim() === drop;
      if (skipping) continue;
    }
    if (!skipping) out.push(line);
  }
  const kept = out.join("\n").trim();
  // 다 잘라 내면 원문을 그대로 둔다. 빈 해설보다는 관점이 섞인 해설이 낫다.
  return kept.length > 0 ? kept : text;
}
