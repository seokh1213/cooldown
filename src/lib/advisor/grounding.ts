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
import type { ChampionCard } from "../../../scripts/llm/lib/facts";
import type { AdvisorAnswer } from "./answer";
import type { Language } from "@/i18n";
import { promptWords, translateDamage, translateScaling, translateTag } from "./promptLocale";
import { advisorSystemPrompt } from "./persona";
import { toPoliteSentence } from "../../../scripts/llm/lib/politeStyle";

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

/** 숫자가 섞인 문장. 로마 숫자나 슬롯 문자는 숫자가 아니다. */
const HAS_NUMBER = /\d/;

interface Material {
  /** 이 해설이 쓰인 언어. 말을 찾는 규칙이 언어마다 다르다. */
  lang: Language;
  /** 슬롯 → 그 스킬이 실제로 가진 효과 태그 */
  effectsBySlot: Map<string, Set<string>>;
  /** 스킬 이름 → 슬롯 */
  slotByName: Map<string, string>;
  /** 슬롯 → 툴팁 본문. 태그가 비어도 본문에는 적혀 있는 효과가 많다. */
  textBySlot: Map<string, string>;
  /**
   * 이 챔피언 스킬들의 효과 태그 전체.
   *
   * `key` 는 카드에 적힌 한국어, `surface` 는 모델이 실제로 쓸 그 언어의 말이다.
   * 둘을 갈라 두지 않았을 때는 영어·중국어 해설에서 태그가 **하나도** 안 잡혔다.
   * 카드에는 "둔화" 라고 적혀 있는데 모델은 "slow" 라고 쓰기 때문이다. 짝이 안
   * 맞는 문장이 걸리지 않고 그대로 나갔다.
   */
  allTags: Array<{ key: string; surface: string }>;
  /** 노트 문장. 여기서 온 말은 정의상 옳다. */
  noteSentences: string[];
  /** 카드 첫 줄이 적어 둔 피해 유형과 계수. 여기와 어긋나면 큰 거짓말이다. */
  profiles: Array<{ name: string; damage: string; scaling: string }>;
  /** 스킬 이름 → 그 스킬을 가진 챔피언 이름 */
  ownerByName: Map<string, string>;
  /**
   * 프롬프트가 재료로 실어 준 카드 줄들.
   *
   * 모델이 이것을 답에 그대로 옮겨 적는다. "오공 P 바위 피부: 회복, 분신" 처럼
   * 줄줄이 늘어놓고 마지막에 두 문장을 붙이는 꼴이다. 틀린 말이 아니라서 어느
   * 규칙에도 안 걸렸는데, 카드가 화면에 이미 있으므로 값이 0 이다.
   *
   * 베낀 것과 제대로 쓴 글은 조사로 갈린다. 베끼면 "오공 P 바위 피부: 회복" 처럼
   * 원문 그대로라 어절이 다 겹치고, 제 말로 쓰면 "바위 피부는 회복을 줍니다" 처럼
   * 조사가 붙어 안 겹친다.
   */
  cardLines: string[];
}

function material(answer: AdvisorAnswer, lang: Language): Material | undefined {
  /*
   * 상성 답에도 돌려야 한다.
   *
   * 예전에는 `kind !== "champion"` 이면 그냥 나갔다. 그래서 **상성 질문의 해설은
   * 아무 검사도 받지 않았다.** 실제로 "오공은 마법으로 주 피해를 받습니다"(카드에는
   * 물리라고 적혀 있다) 가 그대로 화면에 나갔다. 챔피언이 둘이라 재료가 두 벌일 뿐
   * 검사할 것은 같다.
   */
  const cards: ChampionCard[] =
    answer.kind === "champion" ? [answer.card] : answer.kind === "compare" ? answer.cards : [];
  if (cards.length === 0) return undefined;

  const effectsBySlot = new Map<string, Set<string>>();
  const slotByName = new Map<string, string>();
  const textBySlot = new Map<string, string>();
  for (const card of cards) {
    for (const spell of card.spells) {
      // 챔피언이 둘이면 슬롯이 겹친다. 효과는 합쳐서 본다. 어느 쪽 Q 인지까지
      // 가리려다 멀쩡한 문장을 버리는 편이 더 나쁘다.
      const seen = effectsBySlot.get(spell.slot) ?? new Set<string>();
      for (const tag of spell.effects ?? []) seen.add(tag);
      effectsBySlot.set(spell.slot, seen);
      slotByName.set(spell.name, spell.slot);
      textBySlot.set(spell.slot, `${textBySlot.get(spell.slot) ?? ""} ${spell.summary ?? ""} ${spell.text ?? ""}`);
    }
  }
  const allTags = [...new Set(cards.flatMap((card) => card.spells.flatMap((spell) => spell.effects ?? [])))].map(
    (key) => ({ key, surface: translateTag(key, lang) }),
  );

  const notes =
    answer.kind === "champion"
      ? [...(answer.notes?.playing ?? []), ...(answer.notes?.against ?? [])]
      : answer.kind === "compare"
        ? [...(answer.notes?.mine ?? []), ...(answer.notes?.enemy ?? [])]
        : [];
  const noteSentences = notes
    .flatMap((note) => note.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10);

  // 누구 스킬인지 적어 둔다. 챔피언이 둘일 때 모델이 남의 스킬을 내 것이라고
  // 쓰는 일이 잦은데, 이것 없이는 잡을 수가 없다.
  const ownerByName = new Map<string, string>();
  for (const card of cards) for (const spell of card.spells) ownerByName.set(spell.name, card.name);

  const profiles = cards.map((card) => ({
    name: card.name,
    damage: card.damageProfile.primary,
    scaling: card.scalingProfile.primary,
  }));
  const cardLines = cards.flatMap((card) => [
    `${card.name} ${translateDamage(card.damageProfile.primary, lang)} ${translateScaling(card.scalingProfile.primary, lang)} ${card.wiki?.subclass ?? ""}`,
    ...card.spells.map(
      (spell) => `${card.name} ${spell.slot} ${spell.name} ${(spell.effects ?? []).map((tag) => translateTag(tag, lang)).join(" ")}`,
    ),
  ]);
  return { lang, effectsBySlot, slotByName, textBySlot, allTags, noteSentences, profiles, ownerByName, cardLines };
}

/**
 * 카드가 적어 둔 피해 유형·계수를 뒤집어 말하는가.
 *
 * 스킬과 효과의 짝만 보다 보니 더 큰 거짓말을 놓쳤다. "오공은 마법으로 주 피해를
 * 받습니다" 는 어느 스킬도 짚지 않아 아무 규칙에도 안 걸렸는데, 카드 첫 줄과
 * 정면으로 어긋난다. 상성 해설에서 특히 잦다.
 */
const DAMAGE_WORDS: Record<Language, Array<[string, RegExp]>> = {
  ko_KR: [
    ["물리", /물리/],
    ["마법", /마법/],
  ],
  en_US: [
    ["물리", /\bphysical\b/i],
    ["마법", /\bmagic(al)?\b/i],
  ],
  zh_CN: [
    ["물리", /物理/],
    ["마법", /魔法|法术/],
  ],
};

/**
 * **주는** 피해를 말하는 자리인가.
 *
 * 이 두 표가 한국어뿐이던 동안 영어·중국어 해설은 이 검사를 통째로 건너뛰었다.
 * 카드에 물리라고 적힌 챔피언을 두고 "deals mostly magic damage" 라고 써도
 * 아무 데도 안 걸렸다는 뜻이다. 태그와 달리 여기는 말 자체를 찾아야 하므로
 * 카드 어휘표로는 안 되고 언어마다 적는다.
 */
const DAMAGE_CLAIM: Record<Language, RegExp> = {
  ko_KR: /주 피해|피해 유형|피해를 (주|입)/,
  en_US: /\b(primary|main|mostly|primarily|largely)\b[^.]{0,20}damage|damage (type|profile)|deals?\b[^.]{0,20}damage/i,
  zh_CN: /主要伤害|伤害类型|造成[^。]{0,12}伤害/,
};

/**
 * 남의 스킬을 내 것이라고 말하는가.
 *
 * 상성 해설에서 가장 잦은 거짓말이다. "오공은 P 고철장 거인 스킬을 사용합니다" —
 * 고철장 거인은 럼블 것이다.
 *
 * 임자는 **바로 앞에 붙은 이름**으로만 본다. 처음에는 앞에서 가장 가까운 이름을
 * 임자로 삼았는데, 그러면 한 문장 안에서 상대를 한 번 부르는 순간 그 뒤의 모든
 * 스킬이 상대 것이 되었다. "제드는 럭스의 Q 를 피하고 W 살아있는 그림자로
 * 빠집니다" 에서 살아있는 그림자가 럭스 것으로 읽혀 맞는 문장이 잘렸다. 4B 가
 * 걷어낸 열두 문장 중 절반이 이 꼴이었다.
 *
 * 그래서 이름과 스킬 사이에 조사와 슬롯 문자밖에 없을 때만 임자로 친다. 잡는
 * 것이 줄지만 잡은 것은 확실하다.
 */
const POSSESSIVE = /^(의|'s|’s|的)\s*[PQWER]?\s*$/;
/**
 * 주격·주제격은 소유를 뜻하지 않는다. 슬롯 문자가 함께 있을 때만 임자로 친다.
 *
 * "리븐은 응수가 살아 있는 동안에는" 에서 응수는 피오라 것이지만 이 문장은
 * 리븐이 그것을 피한다는 맞는 말이다. `은` 은 주제 표시일 뿐이다. 반면
 * "오공은 P 고철장 거인으로 시작합니다" 처럼 슬롯을 달아 부르면 제 것이라는
 * 뜻이라, 그때만 잡는다.
 *
 * 조사가 아예 없는 꼴도 잡는다. 0.8B 가 소제목처럼 "**오공 P 고철장 거인**" 을
 * 줄줄이 적었는데(고철장 거인은 럼블 것이다) 조사를 요구하는 바람에 그대로
 * 통과했다. 슬롯 문자가 붙어 있으면 조사 없이도 제 것이라는 뜻이다.
 */
const SUBJECT = /^(은|는|이|가|도|을|를)?\s*[PQWER]\s*$/;

function misattributes(sentence: string, m: Material): boolean {
  const names = m.profiles.map((p) => p.name);
  if (names.length < 2) return false;
  for (const [skill, owner] of m.ownerByName) {
    const at = sentence.indexOf(skill);
    if (at < 0) continue;
    for (const name of names) {
      if (name === owner) continue;
      const found = sentence.lastIndexOf(name, at);
      if (found < 0) continue;
      const gap = sentence.slice(found + name.length, at);
      if (POSSESSIVE.test(gap) || SUBJECT.test(gap)) return true;
    }
  }
  return false;
}

function contradictsProfile(sentence: string, profiles: Material["profiles"], lang: Language): boolean {
  for (const profile of profiles) {
    const at = sentence.indexOf(profile.name);
    if (at < 0) continue;
    // 이름 뒤 30 자 안에서 "주 피해" 를 말하는 자리만 본다. 스킬 하나의 피해 유형을
    // 말하는 문장까지 걸면 맞는 말이 잘린다.
    const near = sentence.slice(at, at + 60);
    /*
     * **주는** 피해만 본다.
     *
     * `피해를 받` 까지 걸었더니 "럼블의 방어력은 매우 높으므로 물리 피해를 받기
     * 어렵고" 가 걸렸다. 럼블이 주는 피해는 마법이 맞지만 이 문장은 받는 쪽
     * 이야기다. 카드에 적힌 것은 주는 쪽이므로 대조할 근거가 없다.
     */
    if (!(DAMAGE_CLAIM[lang] ?? DAMAGE_CLAIM.ko_KR).test(near)) continue;
    if (profile.damage === "혼합") continue;
    const words = DAMAGE_WORDS[lang] ?? DAMAGE_WORDS.ko_KR;
    const mine = words.find(([key]) => key === profile.damage)?.[1];
    for (const [key, re] of words) {
      if (key !== profile.damage && re.test(near) && !(mine && mine.test(near))) return true;
    }
  }
  return false;
}

/** 두 문장이 사실상 같은 말인가. 어절이 얼마나 겹치는지로 본다. */
function overlap(a: string, b: string): number {
  const words = a.split(/\s+/).filter((word) => word.length > 1);
  const other = new Set(b.split(/\s+/).filter((word) => word.length > 1));
  if (words.length === 0) return 0;
  return words.filter((word) => other.has(word)).length / words.length;
}

export type Verdict = "note" | "card-ok" | "card-wrong" | "unsupported" | "number" | "duplicate" | "boilerplate";

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
function directives(lang: Language, answer: AdvisorAnswer | undefined): string[] {
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

function isBoilerplate(sentence: string, directiveStems: string[], cardLines: string[] = []): boolean {
  const plain = sentence.replace(/\*\*/g, "").trim();
  if (GREETING.test(plain)) return true;
  if (IMPERATIVE.test(plain)) return true;
  const stem = strip(sentence);
  if (stem.length < 10) return false;
  if (directiveStems.some((other) => other.length >= 10 && overlap(stem, other) >= 0.6)) return true;
  // 카드를 그대로 옮겨 적은 줄. 조사가 없어 어절이 통째로 겹친다.
  return cardLines.some((line) => overlap(strip(line), stem) >= 0.7 && overlap(stem, strip(line)) >= 0.7);
}

/** 뒤에 오는 부정(한국어) */
const NEGATED_AFTER = /없|않|못\s|아니/;
/** 앞에 오는 부정(영어·중국어) */
const NEGATED_BEFORE = /(\b(no|not|without|lacks?|lacking|cannot|can't|never)\b|没有|不|无|缺)[^.。]{0,12}$/i;

function negated(sentence: string, at: number, length: number): boolean {
  return (
    NEGATED_AFTER.test(sentence.slice(at + length, at + length + 16)) ||
    NEGATED_BEFORE.test(sentence.slice(Math.max(0, at - 24), at))
  );
}

/**
 * 문장 하나를 가른다.
 *
 * 효과 태그가 어느 스킬 것인지는 **문장 안의 자리**로 정한다. 태그 앞에 가장 가까이
 * 있는 스킬 이름이 임자다. "R 로 띄운 뒤 Q 로 둔화를 겁니다" 에서 둔화는 Q 것이다.
 */
export function classify(sentence: string, m: Material): Verdict {
  /*
   * 틀린 것을 **먼저** 가린다.
   *
   * 노트 판정이 앞에 있었더니, 노트를 베끼면서 스킬 이름만 남의 것으로 바꾼 문장이
   * 보호받았다. 실제로 럼블 노트를 그대로 옮기고 임자만 오공으로 바꾼 문단이 그대로
   * 화면에 나갔다. 노트와 닮았다는 것이 맞다는 뜻은 아니다.
   */
  if (contradictsProfile(sentence, m.profiles, m.lang)) return "card-wrong";
  if (misattributes(sentence, m)) return "card-wrong";
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
  for (const { key, surface } of m.allTags) {
    const at = sentence.indexOf(surface);
    if (at < 0) continue;
    /*
     * **없다고 말하는 효과**는 짝을 따지지 않는다.
     *
     * "럼블의 주력기인 화염방사기는 근접 사거리의 원뿔이며, 이동기가 없으므로" 가
     * 걸렸다. 사람이 검증한 노트 그대로인데, `이동기` 를 화염방사기의 효과라고
     * 읽고 카드와 어긋난다고 본 것이다. 없다는 말은 그 스킬이 그것을 가졌다는
     * 주장이 아니다.
     *
     * 부정이 붙는 자리가 언어마다 다르다. 한국어는 뒤에("이동기가 없으므로"),
     * 영어와 중국어는 앞에 온다("no mobility", "没有位移"). 그래서 양쪽을 다 본다.
     */
    if (negated(sentence, at, surface.length)) continue;
    seen += 1;
    const owner = [...marks].reverse().find((mark) => mark.at < at) ?? marks[0];
    if (m.effectsBySlot.get(owner.slot)?.has(key)) matched += 1;
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
  // 본문은 그 언어의 툴팁이므로 카드의 한국어 열쇠가 아니라 그 언어의 말로 찾는다.
  for (const { surface } of m.allTags) {
    if (sentence.includes(surface) && text.includes(surface)) return "card-ok";
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

/**
 * 스킬 이름 앞에 슬롯 문자를 붙인다.
 *
 * 재료에는 `오공 Q 파쇄격(…)` 처럼 슬롯이 붙어 들어가고 페르소나도 "슬롯 문자와
 * 이름을 함께 쓰라" 고 이른다. 그래도 0.8B 는 산문으로 옮기면서 슬롯을 떨군다 —
 * "럼블의 화염방사기나 고철장 거인의 피해가". 이름만으로는 어느 키인지 모르니 읽는
 * 사람이 스킬 표를 다시 뒤져야 한다. 지시로 이길 수 없으면 나온 글을 고친다.
 *
 * 붙이지 않는 것
 *   이미 붙은 것      "Q 화염방사기", "Q스킬 화염방사기", "화염방사기(Q)"
 *   두 글자 이하 이름 공포·도약·반격 같은 낱말은 스킬이 아닌 뜻으로도 흔히 쓴다.
 *                     카드 865개 스킬 중 90개가 이 길이다.
 *   효과 태그와 같은 이름  "매혹" 은 스킬 이름이면서 효과 이름이다.
 *
 * "교활한 휩쓸기 / 파멸의 일격" 처럼 형태가 둘인 이름은 한쪽만 써도 알아본다.
 * 긴 이름을 먼저 맞춰, "파멸의 궤적" 이 "심판의 궤적 | 파멸의 궤적" 안에서 따로
 * 걸리지 않게 한다.
 */
export function labelSlots(text: string, cards: ChampionCard[]): string {
  const tags = new Set(cards.flatMap((card) => card.spells.flatMap((spell) => spell.effects ?? [])));
  const names: Array<{ name: string; slot: string }> = [];
  for (const card of cards) {
    for (const spell of card.spells) {
      const forms = [spell.name, ...spell.name.split(/\s*[/|]\s*/)];
      for (const form of new Set(forms)) {
        if (form.replace(/\s/g, "").length < 3 || tags.has(form)) continue;
        names.push({ name: form, slot: spell.slot });
      }
    }
  }
  if (names.length === 0) return text;
  names.sort((a, b) => b.name.length - a.name.length);
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const slotOf = new Map(names.map((entry) => [entry.name, entry.slot]));
  /*
   * 이름 앞에 붙은 글자 하나까지 함께 잡는다. 없으면 붙이고, 틀렸으면 바로잡는다.
   *
   * 0.8B 는 슬롯을 빼먹기만 하는 것이 아니라 틀리게도 붙인다. 피오라 스킬 다섯 개를
   * 전부 "P 치명적인 검무 · P 찌르기 · P 응수 …" 로 적었고, 아트록스에는 슬롯에 없는
   * 글자를 붙였다("A 다르킨의 검"). 이름은 카드에 있으니 어느 키인지는 코드가 안다.
   *
   * 앞 글자는 영문 대문자 하나만 본다. "IQ" 나 "AD" 처럼 낱말의 끝 글자는 건드리지
   * 않도록 그 앞이 영문자가 아니어야 한다.
   */
  const pattern = new RegExp(
    `(?<![A-Za-z])(?:([A-Z])(\\s*스킬\\S?)?([\\s'"‘“*(（]*))?(${names.map((entry) => escape(entry.name)).join("|")})`,
    "g",
  );
  return text.replace(pattern, (whole, letter: string | undefined, skill = "", gap = "", name: string, offset: number) => {
    const slot = slotOf.get(name) ?? "";
    if (letter) return letter === slot ? whole : `${slot}${skill}${gap}${name}`;
    const after = text.slice(offset + whole.length, offset + whole.length + 4);
    // "회전격(R)" 처럼 뒤에 붙은 표기는 두고, 틀렸으면 아래에서 고친다
    if (/^\s*[(（][PQWER][)）]/.test(after)) return whole;
    return `${slot} ${name}`;
  }).replace(
    new RegExp(`(${names.map((entry) => escape(entry.name)).join("|")})(\\s*[(（])([PQWER])([)）])`, "g"),
    (whole, name: string, open: string, letter: string, close: string) => {
      const slot = slotOf.get(name);
      return slot && slot !== letter ? `${name}${open}${slot}${close}` : whole;
    },
  );
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
    const drop = verdict === "card-wrong" || verdict === "number";
    if (drop) dropped.push({ sentence, verdict });
    else kept.push(polite(raw));
  }
  const cards = answer?.kind === "champion" ? [answer.card] : answer?.kind === "compare" ? answer.cards : [];
  return { text: labelSlots((kept.join("") + tail).trim(), cards), dropped };
}
