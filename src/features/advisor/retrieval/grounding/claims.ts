import type { Language } from "../../../../shared/i18n";
import type { Material, Verdict } from "./contracts";
import { NOTE_COPY_OVERLAP, overlap } from "./text";

/** 숫자가 섞인 문장. 로마 숫자나 슬롯 문자는 숫자가 아니다. */
const HAS_NUMBER = /\d/;

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
  if (m.noteSentences.some((note) => overlap(sentence, note) >= NOTE_COPY_OVERLAP)) return "note";
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
