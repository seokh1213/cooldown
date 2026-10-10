/**
 * 모델이 쓴 해설에서 **틀렸다고 증명되는 문장**을 걷어낸다
 *
 * 평가 하네스에서는 문장마다 근거를 셋으로 갈라 점수만 냈다. 노트에서 온 문장, 카드로
 * 대조되는 문장, 아무 근거도 없는 문장. 재기만 하고 화면에는 전부 내보내고 있었다.
 *
 * 여기서는 그 분류를 실제 동작으로 옮긴다. 다만 **못 미더운 것을 다 지우지는 않는다.**
 * 근거 없는 문장에는 "한타에서는 진입 순서가 중요합니다" 같은 멀쩡한 이음말이 많아서,
 * 그것까지 지우면 해설이 토막 난다. 지우는 것은 코드가 틀렸다고 말할 수 있는 것뿐이다.
 *
 *   짝이 틀림    "Q 지진의 파편으로 에어본" — 에어본은 R 의 효과다. 카드가 증명한다.
 *   없는 스킬    카드에 없는 이름을 슬롯과 함께 불렀다.
 *   숫자         해설에 숫자를 쓰지 말라고 일러 두었다. 새어 나온 값은 카드와 어긋날 수
 *                있고 대조할 방법이 없다.
 *   되풀이       앞에서 한 말을 그대로 다시 한다. "오공 상대법" 에 같은 문단이 머리말만
 *                바꿔 두 번 나왔다. 틀린 말은 아니지만 읽는 사람의 시간을 버린다.
 *
 * "근거 없는 문장까지 지우는" 엄격 모드(`strict`)는 모델을 고르던 때 카드 위 해설만 맡긴 모델(`writes: "card"`)에만 걸었다.
 * 모델이 하나로 준 지금은 거는 곳이 없다.
 *
 * 스트리밍 중에도 돌아야 하므로 **끝난 문장만** 본다. 마지막 조각은 아직 자라는 중이라
 * 손대지 않고 그대로 둔다. 다 쓰고 나면 그 조각도 문장이 되어 한 번 더 걸린다.
 */
import { toPoliteSentence } from "../../../../domain/knowledge/text/politeStyle";
import type { AdvisorAnswer } from "../../answers/answer";
import { labelSlots } from "../../answers/presentation/slotLabels";
import type { Language } from "../../../../shared/i18n";
import { classify } from "./claims";
import type { GroundResult } from "./contracts";
import { material } from "./material";
import { directives, isBoilerplate, keepAskedPerspective } from "./presentation";
import { overlap } from "./text";

/**
 * 문장 경계. 끝나지 않은 꼬리는 따로 돌려준다.
 *
 * 마침표만 보면 안 된다. 쿨타임이 "8/7.5/7/6.5/6초" 라 소수점마다 문장이 끊겼고,
 * 그렇게 쪼개진 "5/7/6." 같은 토막이 숫자 규칙에 걸려 통째로 사라졌다. 답이
 * "오공의 스킬별 재사용 대기시간입니다.5/7/6.25/8.5/7." 로 남았다.
 *
 * 그래서 **뒤에 공백이나 끝이 오는 마침표**만 경계로 본다. 소수점 뒤에는 숫자가 온다.
 */
function splitDone(text: string): { done: string[]; tail: string } {
  /*
   * 줄바꿈도 경계로 본다.
   *
   * 마침표만 보았더니 마침표 없이 끝나는 줄이 다음 문장과 한 덩어리가 되었다.
   * 모델이 "**[스킬 이름] 오공 P 바위 피부 (회복, 분신)**" 처럼 카드를 옮겨 적고
   * 줄을 바꾼 뒤 본문을 쓰는데, 둘이 붙어 버려 베낀 줄만 걷어낼 수가 없었다.
   */
  const parts = text.split(/(?<=[.!?。])(?=\s|$)|(?<=\n)/).filter((part) => part.length > 0);
  const tail = /([.!?。]|\n)\s*$/.test(text) ? "" : (parts.pop() ?? "");
  return { done: parts, tail };
}

/**
 * 해설에서 틀린 문장을 걷어낸다.
 *
 * 카드가 챔피언 답이 아니면(스킬 하나, 아이템, 규칙) 대조할 자료가 없으므로 그대로 둔다.
 * 없는 자료로 지우는 것이 지우지 않는 것보다 위험하다.
 */
export function groundCommentary(
  text: string,
  answer: AdvisorAnswer | undefined,
  lang: Language = "ko_KR",
  /**
   * 근거 없는 문장(노트와도 카드와도 닿지 않는 것)까지 지운다. 모델을 고르던 때 카드 위 해설만 맡긴 모델(`writes: "card"`)에 걸었다.
   * 멀쩡한 이음말도 함께 지워지므로 자유롭게 쓰는 모델에는 걸지 않는다.
   */
  strict = false,
): GroundResult {
  const m = answer ? material(answer, lang) : undefined;
  if (!m) return { text, dropped: [] };

  const { done, tail } = splitDone(keepAskedPerspective(text, answer, lang));
  const directiveStems = directives(lang, answer);
  /*
   * 한다체로 끝난 문장을 합니다체로 돌린다.
   *
   * 노트를 합니다체로 옮길 때 쓴 변환기를 그대로 쓴다. 그때는 재료를 고쳐 모델이
   * 따라 하게 만드는 것이 목적이었는데, 4B 는 재료가 전부 합니다체인데도 문장 넷
   * 중 하나를 한다체로 끝냈다(열네 쌍에서 47 문장 중 12). 노트에는 한 건도 없으니
   * 모델이 스스로 내는 것이고, 페르소나와 규칙이 이미 두 번 이르는데도 안 되었다.
   * 지시로 이길 수 없으면 나온 글을 고친다.
   *
   * 다 쓴 문장만 바꾼다 — 자라는 중인 꼬리를 건드리면 글자가 튄다.
   */
  const polite = (line: string) => (lang === "ko_KR" ? toPoliteSentence(line) : line);
  const dropped: GroundResult["dropped"] = [];
  const kept: string[] = [];
  /** 이미 내보낸 말. 되풀이를 가리는 데 쓴다. */
  const said: string[] = [];
  for (const raw of done) {
    const sentence = raw.trim();
    const plain = sentence.replace(/\*\*/g, "");
    // 길이 문턱보다 먼저 본다. "물론이죠." 는 여섯 자라 문턱을 그냥 지나쳤다.
    if (isBoilerplate(sentence, directiveStems, m.cardLines)) {
      dropped.push({ sentence, verdict: "boilerplate" });
      continue;
    }
    if (sentence.length < 8) {
      kept.push(polite(raw));
      continue;
    }
    // 앞에서 한 말을 다시 하면 버린다. 소제목도 본다 — 같은 문단이 머리말만 바꿔
    // 두 번 나온 적이 있다.
    if (said.some((prev) => overlap(plain, prev) >= 0.7 && overlap(prev, plain) >= 0.7)) {
      dropped.push({ sentence, verdict: "duplicate" });
      continue;
    }
    said.push(plain);
    // 굵은 글씨 한 줄은 소제목이다. 사실을 주장하지 않으므로 대조하지 않는다.
    if (/^\*\*[^*]+\*\*$/.test(sentence)) {
      kept.push(raw);
      continue;
    }
    const verdict = classify(plain, m);
    const drop = verdict === "card-wrong" || verdict === "number" || (strict && verdict === "unsupported");
    if (drop) dropped.push({ sentence, verdict });
    else kept.push(polite(raw));
  }
  const cards = answer?.kind === "champion" ? [answer.card] : answer?.kind === "compare" ? answer.cards : [];
  return { text: labelSlots((kept.join("") + tail).trim(), cards), dropped };
}
