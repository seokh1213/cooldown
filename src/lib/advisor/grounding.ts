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
 *
 * `strict` 를 켜면 근거 없는 문장까지 지운다. 작은 모델을 붙이게 되면 그쪽에 쓴다.
 * 큰 모델에는 켜지 않는다 — 멀쩡한 문장을 너무 많이 잃는다.
 *
 * 스트리밍 중에도 돌아야 하므로 **끝난 문장만** 본다. 마지막 조각은 아직 자라는 중이라
 * 손대지 않고 그대로 둔다. 다 쓰고 나면 그 조각도 문장이 되어 한 번 더 걸린다.
 */
import type { AdvisorAnswer } from "./answer";

/** 문장 경계. 한국어 종결과 마침표를 본다. 끝나지 않은 꼬리는 따로 돌려준다. */
function splitDone(text: string): { done: string[]; tail: string } {
  const parts = text.split(/(?<=[.!?。])\s*/);
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
  /** 이 챔피언 스킬들의 효과 태그 전체 */
  allTags: string[];
  /** 노트 문장. 여기서 온 말은 정의상 옳다. */
  noteSentences: string[];
}

function material(answer: AdvisorAnswer): Material | undefined {
  if (answer.kind !== "champion") return undefined;
  const effectsBySlot = new Map<string, Set<string>>();
  const slotByName = new Map<string, string>();
  for (const spell of answer.card.spells) {
    effectsBySlot.set(spell.slot, new Set(spell.effects ?? []));
    slotByName.set(spell.name, spell.slot);
  }
  const allTags = [...new Set(answer.card.spells.flatMap((spell) => spell.effects ?? []))];
  const noteSentences = [...(answer.notes?.playing ?? []), ...(answer.notes?.against ?? [])]
    .flatMap((note) => note.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10);
  return { effectsBySlot, slotByName, allTags, noteSentences };
}

/** 두 문장이 사실상 같은 말인가. 어절이 얼마나 겹치는지로 본다. */
function overlap(a: string, b: string): number {
  const words = a.split(/\s+/).filter((word) => word.length > 1);
  const other = new Set(b.split(/\s+/).filter((word) => word.length > 1));
  if (words.length === 0) return 0;
  return words.filter((word) => other.has(word)).length / words.length;
}

export type Verdict = "note" | "card-ok" | "card-wrong" | "unsupported" | "number";

/**
 * 문장 하나를 가른다.
 *
 * 효과 태그가 어느 스킬 것인지는 **문장 안의 자리**로 정한다. 태그 앞에 가장 가까이
 * 있는 스킬 이름이 임자다. "R 로 띄운 뒤 Q 로 둔화를 겁니다" 에서 둔화는 Q 것이다.
 */
export function classify(sentence: string, m: Material): Verdict {
  if (m.noteSentences.some((note) => overlap(sentence, note) >= 0.7)) return "note";
  if (HAS_NUMBER.test(sentence)) return "number";

  const marks: Array<{ at: number; slot: string }> = [];
  for (const [name, slot] of m.slotByName) {
    const at = sentence.indexOf(name);
    if (at >= 0) marks.push({ at, slot });
  }
  marks.sort((a, b) => a.at - b.at);
  if (marks.length === 0) return "unsupported";

  let checked = false;
  for (const tag of m.allTags) {
    const at = sentence.indexOf(tag);
    if (at < 0) continue;
    checked = true;
    const owner = [...marks].reverse().find((mark) => mark.at < at) ?? marks[0];
    if (!m.effectsBySlot.get(owner.slot)?.has(tag)) return "card-wrong";
  }
  return checked ? "card-ok" : "unsupported";
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
  options: { strict?: boolean } = {},
): GroundResult {
  const m = answer ? material(answer) : undefined;
  if (!m) return { text, dropped: [] };

  const { done, tail } = splitDone(text);
  const dropped: GroundResult["dropped"] = [];
  const kept: string[] = [];
  for (const raw of done) {
    const sentence = raw.trim();
    // 굵은 글씨 한 줄은 소제목이다. 사실을 주장하지 않으므로 대조하지 않는다.
    if (sentence.length < 8 || /^\*\*[^*]+\*\*$/.test(sentence)) {
      kept.push(raw);
      continue;
    }
    const verdict = classify(sentence.replace(/\*\*/g, ""), m);
    const drop = verdict === "card-wrong" || verdict === "number" || (options.strict && verdict === "unsupported");
    if (drop) dropped.push({ sentence, verdict });
    else kept.push(raw);
  }
  return { text: (kept.join("") + tail).trim(), dropped };
}
