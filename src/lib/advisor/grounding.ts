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
 * 한때 "근거 없는 문장까지 지우는" 엄격 모드를 두었다. 지어내는 모델을 붙이려 했을
 * 때의 안전장치인데, 지금 쓰는 두 모델 모두 틀린 짝이 0건이라 지울 것이 없었다.
 * 쓰지 않는 장치를 남겨 두면 다음 사람이 켜 볼 뿐이라 걷어냈다.
 *
 * 스트리밍 중에도 돌아야 하므로 **끝난 문장만** 본다. 마지막 조각은 아직 자라는 중이라
 * 손대지 않고 그대로 둔다. 다 쓰고 나면 그 조각도 문장이 되어 한 번 더 걸린다.
 */
import type { AdvisorAnswer } from "./answer";
import type { Language } from "@/i18n";
import { promptWords } from "./promptLocale";

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
  const parts = text.split(/(?<=[.!?。])(?=\s|$)/).filter((part) => part.length > 0);
  const tail = /[.!?。]\s*$/.test(text) ? "" : (parts.pop() ?? "");
  return { done: parts, tail };
}

/** 숫자가 섞인 문장. 로마 숫자나 슬롯 문자는 숫자가 아니다. */
const HAS_NUMBER = /\d/;

interface Material {
  /** 슬롯 → 그 스킬이 실제로 가진 효과 태그 */
  effectsBySlot: Map<string, Set<string>>;
  /** 스킬 이름 → 슬롯 */
  slotByName: Map<string, string>;
  /** 슬롯 → 툴팁 본문. 태그가 비어도 본문에는 적혀 있는 효과가 많다. */
  textBySlot: Map<string, string>;
  /** 이 챔피언 스킬들의 효과 태그 전체 */
  allTags: string[];
  /** 노트 문장. 여기서 온 말은 정의상 옳다. */
  noteSentences: string[];
}

function material(answer: AdvisorAnswer): Material | undefined {
  if (answer.kind !== "champion") return undefined;
  const effectsBySlot = new Map<string, Set<string>>();
  const slotByName = new Map<string, string>();
  const textBySlot = new Map<string, string>();
  for (const spell of answer.card.spells) {
    effectsBySlot.set(spell.slot, new Set(spell.effects ?? []));
    slotByName.set(spell.name, spell.slot);
    textBySlot.set(spell.slot, `${spell.summary ?? ""} ${spell.text ?? ""}`);
  }
  const allTags = [...new Set(answer.card.spells.flatMap((spell) => spell.effects ?? []))];
  const noteSentences = [...(answer.notes?.playing ?? []), ...(answer.notes?.against ?? [])]
    .flatMap((note) => note.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10);
  return { effectsBySlot, slotByName, textBySlot, allTags, noteSentences };
}

/** 두 문장이 사실상 같은 말인가. 어절이 얼마나 겹치는지로 본다. */
function overlap(a: string, b: string): number {
  const words = a.split(/\s+/).filter((word) => word.length > 1);
  const other = new Set(b.split(/\s+/).filter((word) => word.length > 1));
  if (words.length === 0) return 0;
  return words.filter((word) => other.has(word)).length / words.length;
}

export type Verdict = "note" | "card-ok" | "card-wrong" | "unsupported" | "number" | "duplicate";

/**
 * 문장 하나를 가른다.
 *
 * 효과 태그가 어느 스킬 것인지는 **문장 안의 자리**로 정한다. 태그 앞에 가장 가까이
 * 있는 스킬 이름이 임자다. "R 로 띄운 뒤 Q 로 둔화를 겁니다" 에서 둔화는 Q 것이다.
 */
export function classify(sentence: string, m: Material): Verdict {
  if (m.noteSentences.some((note) => overlap(sentence, note) >= 0.7)) return "note";
  if (HAS_NUMBER.test(sentence)) return "number";

  /*
   * 임자는 **스킬 이름**으로만 찾는다.
   *
   * 슬롯 문자도 임자로 세워 봤더니 헛짚음이 17건에서 88건으로 늘었다. 한 문장에
   * 슬롯 문자가 여럿 나오고 효과는 뒤에 오는 스킬 것인 경우가 흔하다 —
   * "R을 먼저 쓰고 나중에 E를 넣어야 기절 시간을 온전히" 에서 기절은 R 것이다.
   */
  const marks: Array<{ at: number; slot: string }> = [];
  for (const [name, slot] of m.slotByName) {
    const at = sentence.indexOf(name);
    if (at >= 0) marks.push({ at, slot });
  }
  marks.sort((a, b) => a.at - b.at);
  if (marks.length === 0) return "unsupported";

  /*
   * 짝이 하나라도 맞으면 그 문장은 맞다고 본다.
   *
   * 예전에는 태그 하나라도 임자와 어긋나면 틀렸다고 했다. 카드의 효과 태그가 성글어서
   * 그것이 헛짚는다 — 스킬 865개 중 196개(23%)가 태그가 비어 있고, 애쉬 W 는 툴팁에
   * 둔화가 있는데 태그는 `[]` 다. 그 규칙으로 사람이 검증한 노트 9,357문장을 돌렸더니
   * 36문장을 "틀렸다" 고 버렸다. 전부 맞는 문장이었다.
   *
   *   R 슬픈 미라의 저주는 아무무 주변에 즉시 터지는 광역 기절이라 반드시 붙어야 합니다.
   *
   * R 은 기절을 실제로 가진다. 함께 쓰인 "광역" 이 카드에서 E 것으로만 적혀 있어서
   * 걸렸다. "광역 기절" 은 한 덩어리 표현이지 두 주장이 아니다.
   *
   * 그래서 **맞는 짝이 하나도 없을 때만** 틀렸다고 한다. 지어낸 짝은 그대로 걸린다 —
   * "Q 지진의 파편으로 에어본" 은 Q 가 어떤 태그와도 안 맞아 여전히 잡힌다.
   */
  let seen = 0;
  let matched = 0;
  for (const tag of m.allTags) {
    const at = sentence.indexOf(tag);
    if (at < 0) continue;
    seen += 1;
    const owner = [...marks].reverse().find((mark) => mark.at < at) ?? marks[0];
    if (m.effectsBySlot.get(owner.slot)?.has(tag)) matched += 1;
  }
  if (seen === 0) return "unsupported";
  if (matched > 0) return "card-ok";
  // 임자의 태그가 비어 있으면 아무것도 모른다. 모르는 것을 틀렸다고 하지 않는다.
  const owner = marks[marks.length - 1];
  const known = m.effectsBySlot.get(owner.slot);
  if (!known || known.size === 0) return "unsupported";
  /*
   * 태그에 없더라도 **툴팁 본문에 적혀 있으면** 맞는 말이다.
   *
   * 태그는 성글다. 브랜드 Q 는 불길이 걸린 적만 기절시키는데 그 조건이 태그로 안
   * 적히고, 브라움 Q 는 둔화가 본문에만 있다. 본문을 한 번 더 보면 이런 것들이
   * 걸러진다. 지어낸 짝은 본문에도 없으므로 그대로 잡힌다.
   */
  const text = m.textBySlot.get(owner.slot) ?? "";
  for (const tag of m.allTags) {
    if (sentence.includes(tag) && text.includes(tag)) return "card-ok";
  }
  return "card-wrong";
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
function keepAskedPerspective(text: string, answer: AdvisorAnswer | undefined, lang: Language): string {
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

export interface GroundResult {
  text: string;
  /** 걷어낸 문장. 화면에는 안 쓰고 평가에만 쓴다. */
  dropped: Array<{ sentence: string; verdict: Verdict }>;
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
): GroundResult {
  const m = answer ? material(answer) : undefined;
  if (!m) return { text, dropped: [] };

  const { done, tail } = splitDone(keepAskedPerspective(text, answer, lang));
  const dropped: GroundResult["dropped"] = [];
  const kept: string[] = [];
  /** 이미 내보낸 말. 되풀이를 가리는 데 쓴다. */
  const said: string[] = [];
  for (const raw of done) {
    const sentence = raw.trim();
    const plain = sentence.replace(/\*\*/g, "");
    if (sentence.length < 8) {
      kept.push(raw);
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
    const drop = verdict === "card-wrong" || verdict === "number";
    if (drop) dropped.push({ sentence, verdict });
    else kept.push(raw);
  }
  return { text: (kept.join("") + tail).trim(), dropped };
}
