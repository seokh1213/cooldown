/**
 * 답변을 글이 아니라 **타입 있는 결과**로 만든다
 *
 * 지금까지 모든 경로가 문서를 통째로 글로 던졌다. "말파 W 쿨타임" 에 툴팁 전체,
 * "정복자에 점화 들어가?" 에 규칙 9문장과 이웃 규칙까지. 묻는 사람은 사실 하나를
 * 원했는데 받은 것은 그 사실이 들어 있는 상자였다.
 *
 * 여기서는 질문이 가리키는 사실을 코드가 골라내고, 결과를 종류별 구조로 돌려준다.
 * 화면은 종류에 맞는 카드를 그리고, 모델은 이 구조를 받아 해설만 쓴다.
 * 모델이 수치를 입에 담을 일이 없어진다.
 */
import type { ChampionCard, SpellFact, StatName } from "../../../scripts/llm/lib/facts";
import type { RuleNotes } from "../../../scripts/llm/lib/rules";
import type { Language } from "@/i18n";
import type { SelectedNotes } from "./noteSelect";
import {
  cardLabels,
  promptWords,
  translateDamage,
  translateGrade,
  translateRatioStat,
  translateScaling,
  translateStat,
  translateTag,
} from "./promptLocale";

/** 카드에 한 줄로 놓을 사실. */
export interface Fact {
  label: string;
  value: string;
}

export type SpellFocus =
  | "cooldown"
  | "cost"
  | "ratio"
  | "damage"
  /** 툴팁 본문에서 찾아야 하는 효과 수치 (마저 감소, 둔화율 …) */
  | "effect";

export type AdvisorAnswer =
  | {
      kind: "spell";
      championId: string;
      championName: string;
      spell: SpellFact;
      focus?: SpellFocus;
      /** 질문이 가리킨 사실. 카드 맨 위에 크게 놓는다. */
      headline?: Fact;
      /** 나머지 구조화된 사실. 접거나 흐리게 놓는다. */
      facts: Fact[];
      /** 본문 중 질문과 닿는 문장. headline 이 없을 때의 근거이기도 하다. */
      highlighted: string[];
    }
  | {
      kind: "champion";
      card: ChampionCard;
      /** "말파이트 스킬 쿨타임" 처럼 슬롯 없이 사실 하나를 물으면 스킬 다섯 개의 그 사실만 */
      focus?: SpellFocus;
      /** "스킬 설명해줘": 능력치 대신 스킬 다섯 개의 요약 */
      view?: "skills";
      /**
       * 사람이 검증한 운용 노트. 플레이할 때 / 상대할 때.
       * `perspective` 는 질문이 어느 쪽을 물었는지로, 카드가 그쪽을 먼저 보인다.
       */
      notes?: SelectedNotes;
    }
  | {
      kind: "rule";
      rule: RuleNotes;
      /** 질문에 답하는 문장. 먼저, 굵게. */
      highlighted: string[];
      /** 그 밖의 문장. 접는다. */
      rest: string[];
    }
  | {
      kind: "suggestion";
      /** 사용자가 쓴, 챔피언으로 보이지만 못 찾은 말 */
      original: string;
      candidates: ChampionCard[];
      /** typo: 이름을 잘못 썼다 / ambiguous: 화면에 둘이 있는데 누구 것인지 모른다 */
      reason?: "typo" | "ambiguous";
    }
  | {
      /**
       * 둘 이상을 견주는 답. 열이 챔피언, 행이 사실이다.
       * 예전에는 모델이 도구로 수치를 두 번 꺼내 글로 견줬는데, 30초 걸리고 8토큰에서
       * 끊기기도 했다. 견주는 일은 코드가 0초에 한다.
       */
      kind: "compare";
      cards: ChampionCard[];
      /** 능력치 비교면 어느 레벨 값인지 */
      level?: 1 | 6 | 11 | 18;
      /** 스킬 비교면 슬롯 */
      slot?: string;
      rows: CompareRow[];
      /** 질문이 가리킨 행의 결론. "체력 (1레벨)" → "말파이트 665 > 럼블 640" */
      headline?: Fact;
      /** 상성 질문. cards[0] 이 내 챔피언, cards[1] 이 상대다. 해설이 그 시점으로 쓴다. */
      matchup?: boolean;
      /** 상성 노트. 내 챔피언을 플레이할 때(이 상대 한정 우선) / 상대를 상대할 때. 사람이 검증. */
      notes?: { mine: string[]; enemy: string[] };
    }
  | {
      /**
       * 아이템. 설명문을 통째로 던지지 않고 능력치·효과로 갈라 둔다.
       * 카드는 자료 패널이 그리고, 대화에는 효과 이름과 설명만 나간다.
       */
      kind: "item";
      itemId: string;
      itemName: string;
      /** 총 가격 */
      price?: number;
      /** 공격력 45, 체력 450 … */
      stats: Fact[];
      effects: ItemEffect[];
      /** "둔화 있어?" 처럼 효과 낱말을 물었을 때의 예/아니오. 있으면 이것이 곧 답이다. */
      verdicts: ItemVerdict[];
    }
  | { kind: "text"; text: string };

export interface ItemEffect {
  name: string;
  /** 사용 시 효과인가. 기본 지속과 운용이 다르므로 갈라 보인다. */
  active: boolean;
  text: string;
}

export interface ItemVerdict {
  tag: string;
  yes: boolean;
  /** 설명문에서 그 낱말이 나온 문장. 근거 없이 예/아니오만 내지 않는다. */
  evidence?: string;
}

export interface CompareRow {
  label: string;
  /** cards 와 같은 순서. 없는 값은 빈 문자열. */
  values: string[];
  /** 질문이 가리킨 행 */
  hit?: boolean;
  /** 굵게 그릴 열. 동률이거나 크기 비교가 뜻이 없는 행이면 비운다. */
  winner?: number;
}

/**
 * 질문이 스킬의 어느 사실을 묻는지.
 *
 * 사람 말은 다양하지만 겨냥하는 칸은 몇 개 안 된다. 이 표는 **데이터가 아니라 의도 어휘**라
 * `detectSlot` 의 "궁·궁극기" 와 같은 성격이다.
 */
const FOCUS_LEXICON: Array<[SpellFocus, RegExp]> = [
  ["cooldown", /쿨(타임|다운)?|재사용|\bcd\b/i],
  ["cost", /마나|소모|코스트|기력|분노|비용/],
  ["ratio", /계수|주문력\s*계수|공격력\s*계수|\bap\b|\bad\b/i],
  ["damage", /피해|데미지|딜(량)?|대미지/],
];

/**
 * 본문에서 찾을 효과 낱말. 줄임말을 툴팁이 실제로 쓰는 말로 편다.
 * "마저" 라고 물으면 툴팁의 "마법 저항력" 문장을 찾아야 한다.
 */
const EFFECT_ALIASES: Array<[RegExp, string[]]> = [
  [/마저|마법\s*저항/, ["마법 저항력"]],
  [/방깎|방어력\s*감소|방어력/, ["방어력"]],
  [/둔화|슬로우/, ["둔화"]],
  [/기절|스턴/, ["기절"]],
  [/보호막|실드/, ["보호막"]],
  [/회복|힐/, ["회복"]],
  [/사거리|거리|범위/, ["사거리", "범위"]],
  [/지속(시간)?|초\s*동안/, ["초 동안", "초간"]],
  [/침묵/, ["침묵"]],
  [/에어본|띄우|공중/, ["공중", "띄"]],
];

export function detectSpellFocus(question: string): { focus: SpellFocus; keywords: string[] } | undefined {
  for (const [alias, words] of EFFECT_ALIASES) {
    if (alias.test(question)) return { focus: "effect", keywords: words };
  }
  for (const [focus, pattern] of FOCUS_LEXICON) {
    if (pattern.test(question)) return { focus, keywords: [] };
  }
  return undefined;
}

/** 툴팁 평문을 문장으로 가른다. 한국어 종결 "다." 와 마침표를 경계로 본다. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.다]\.)\s+|(?<=습니다\.)|(?<=입니다\.)|(?<=됩니다\.)|(?<=합니다\.)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 문장 중 낱말이 들어 있는 것만. 순서는 원문대로. */
function sentencesWith(text: string, keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  return splitSentences(text).filter((sentence) => keywords.some((word) => sentence.includes(word)));
}

/**
 * 계수 목록을 글로. "주문력 105%" 의 능력치 이름은 툴팁에서 읽어 낸 한국어라 옮긴다.
 *
 * 한 줄 요약·표·헤드라인이 저마다 같은 식을 적고 있었다. 옮길 자리가 늘자 한 곳을
 * 빠뜨려 영어 카드에 "Ratios 주문력 50%" 가 나왔다. 식을 한 곳에 모은다.
 */
function ratioText(ratios: Array<[string, number]>, lang: Language): string {
  return ratios.map(([stat, value]) => `${translateRatioStat(stat, lang)} ${value}%`).join(", ");
}

/**
 * 쿨타임 행. 충전형 스킬(럼블 E, 아칼리 R…)은 쿨타임 필드가 연속 시전 간격 0.5초여서
 * 그대로 내면 틀린 답이 된다. 쿨타임 표와 같은 관례로 재충전 시간을 앞세운다.
 */
export function cooldownFact(spell: SpellFact, lang: Language = "ko_KR"): Fact | undefined {
  const w = cardLabels(lang);
  if (spell.recharge) {
    const charges = spell.maxCharges ? ` · ${w.charges(spell.maxCharges)}` : "";
    const gap = spell.cooldown ? ` · ${w.recast(spell.cooldown)}` : "";
    return { label: w.recharge, value: `${w.seconds(spell.recharge)}${charges}${gap}` };
  }
  if (spell.cooldown) return { label: w.cooldown, value: w.seconds(spell.cooldown) };
  return undefined;
}

/**
 * 스킬 답. 질문이 가리키는 사실을 앞에 놓는다.
 *
 * 구조 필드(쿨·소모·계수)는 값이 바로 있으니 headline 으로 올린다.
 * 효과 수치는 본문 문장에만 있으니 그 문장을 골라 highlighted 로 올린다.
 */
export function buildSpellAnswer(
  card: ChampionCard,
  spell: SpellFact,
  question: string,
  lang: Language = "ko_KR",
): AdvisorAnswer {
  const w = cardLabels(lang);
  const detected = detectSpellFocus(question);
  const facts: Fact[] = [];
  const cooldown = cooldownFact(spell, lang);
  if (cooldown) facts.push(cooldown);
  if (spell.cost) facts.push({ label: w.cost, value: spell.cost });
  if (spell.damageTypes.length) {
    facts.push({ label: w.damageType, value: spell.damageTypes.map((type) => translateDamage(type, lang)).join("·") });
  }
  if (spell.effects.length) {
    facts.push({ label: w.effects, value: spell.effects.map((tag) => translateTag(tag, lang)).join(", ") });
  }
  const ratios = Object.entries(spell.ratios ?? {});
  if (ratios.length) facts.push({ label: w.ratios, value: ratioText(ratios, lang) });

  let headline: Fact | undefined;
  let highlighted: string[] = [];
  if (detected?.focus === "cooldown" && cooldown) {
    headline = cooldown;
  } else if (detected?.focus === "cost" && spell.cost) {
    headline = { label: w.cost, value: spell.cost };
  } else if (detected?.focus === "ratio" && ratios.length) {
    headline = { label: w.ratios, value: ratioText(ratios, lang) };
  } else if (detected?.focus === "effect") {
    highlighted = sentencesWith(spell.text, detected.keywords);
  } else if (detected?.focus === "damage") {
    highlighted = sentencesWith(spell.text, ["피해"]);
  }

  return {
    kind: "spell",
    championId: card.id,
    championName: card.name,
    spell,
    focus: detected?.focus,
    headline,
    // headline 을 이미 올렸으면 같은 사실을 facts 에 되풀이하지 않는다.
    facts: headline ? facts.filter((fact) => fact.label !== headline?.label) : facts,
    highlighted,
  };
}

/**
 * 규칙 답. 질문에 함께 나온 **다른 이름**을 담은 문장을 앞에 놓는다.
 *
 * "정복자에 점화 들어가?" 는 점화 규칙 9문장 중 "정복자" 가 든 한 문장이 답이다.
 * 이름을 담은 문장이 없으면 전부 rest 로 두고 카드가 원문을 보인다.
 */
export function buildRuleAnswer(rule: RuleNotes, mentionedNames: string[]): AdvisorAnswer {
  const lines = rule.notesKo?.length === rule.notes.length ? rule.notesKo : rule.notes;
  const others = mentionedNames.filter((name) => name !== rule.name);
  const highlighted = others.length ? lines.filter((line) => others.some((name) => line.includes(name))) : [];
  const rest = lines.filter((line) => !highlighted.includes(line));
  return { kind: "rule", rule, highlighted, rest };
}

/**
 * 두 낱말이 몇 글자 다른지. 한글 음절 하나가 한 글자다.
 * 짧은 이름끼리 쓰는 것이라 단순 동적 계획법으로 충분하다.
 */
const HANGUL_BASE = 0xac00;
const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNGSEONG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONGSEONG = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

/**
 * 한글을 자모로 푼다. "럼블" → "ㄹㅓㅁㅂㅡㄹ"
 *
 * 한글 한 글자는 자모 두세 개가 합쳐진 것이라, 자음 하나만 틀려도 음절로는 통째로
 * 다른 글자가 된다. 자모로 풀면 그 차이가 1 로 보인다. "제이스 → 재이스" 가
 * 음절로는 첫 글자부터 어긋나지만 자모로는 ㅔ↔ㅐ 하나다.
 */
export function toJamo(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < HANGUL_BASE || code > 0xd7a3) {
      out += ch;
      continue;
    }
    const offset = code - HANGUL_BASE;
    out += CHOSEONG[Math.floor(offset / 588)];
    out += JUNGSEONG[Math.floor((offset % 588) / 28)];
    const jong = JONGSEONG[offset % 28];
    if (jong !== " ") out += jong;
  }
  return out;
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    let previous = dp[0];
    dp[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return dp[cols - 1];
}

/** 질문에서 챔피언 이름으로 보일 만한 한글 덩어리. */
function hangulTokens(text: string): string[] {
  return [...new Set(text.match(/[가-힣]{2,7}/g) ?? [])];
}

/**
 * 질문에 흔히 나오는 두 음절 기능어. 이름 오타로 보지 않는다.
 * "누가 더 높아" 의 "누가" 는 누누와 거리 1 이지만 챔피언이 아니다. 첫 음절 규칙만으로는
 * 두 음절 이름(누누·나미·자야…)과 두 음절 기능어의 충돌을 다 못 막는다.
 */
/** 게임 어휘. 챔피언 이름 오타 후보에서 뺀다. 데이터가 아니라 질문에 쓰이는 낱말이다. */
const INTENT_WORD =
  /^(스킬|스탯|능력치?|효과|계수|사거리|궁극기?|패시브|기본|공격|방어|체력|마나|이속|공속|아이템|템트리|소환사|주문|라인전?|정글|미드|탑|바텀|봇|원딜|서폿|서포터|상대|카운터|챔피언|챔프|레벨|설명|비교)/;

const FUNCTION_WORDS = new Set([
  "누가", "누구", "누군", "뭐야", "뭐가", "뭔데", "뭐냐", "뭐지", "어디", "언제", "얼마", "어떤", "어느",
  "제일", "가장", "설명", "비교", "차이", "상대", "대비", "대해", "해줘", "알려", "정도", "이랑", "하고",
  "그리고", "중에", "레벨", "쿨감", "쿨은", "쿨이", "얼마나", "몇초",
]);

/**
 * 챔피언을 하나도 못 찾았을 때, 한 글자 틀린 이름이 있는지 본다.
 *
 * "럼미 E 마저" 는 럼블이다. 지금은 못 찾으면 검색 폴백으로 흘러가 헛답을 냈다.
 * 거리 1 까지만 본다. 2 부터는 "애쉬" 가 "애니" 도 되고 "아리" 도 되어 못 믿는다.
 *
 * **첫 음절이 어떤 이름의 첫 음절과 같아야 한다.** 이 조건이 없으면 "뭐야" 가 "자야" 로
 * 잡힌다 — 두 음절 일반어와 두 음절 이름은 거리 1 로 자주 부딪힌다. 오타는 첫 글자에서
 * 잘 나지 않으므로 이 하나로 충돌 공간이 크게 준다(뭐·쿨·점·정·쇼·와 로 시작하는
 * 챔피언은 없다).
 *
 * 이미 찾은 챔피언(`known`)은 후보에서 뺀다. "말파이트랑 럼베" 에서 "말파이트랑" 은
 * 말파이트와 거리 1 이지만 오타가 아니라 조사가 붙은 것이고, 진짜 오타는 "럼베" 다.
 *
 * 후보를 돌려주고, 하나만 남을 때 바로 갈지 물을지는 화면이 정한다.
 */
export function suggestChampions(
  question: string,
  cards: ChampionCard[],
  nicknames: Map<string, ChampionCard>,
  known: ReadonlySet<string> = new Set(),
): { original: string; candidates: ChampionCard[] } | undefined {
  const names: Array<[string, ChampionCard]> = [];
  for (const card of cards) {
    names.push([card.name, card]);
    const compact = card.name.replace(/\s+/g, "");
    if (compact !== card.name) names.push([compact, card]);
  }
  for (const [nick, card] of nicknames) names.push([nick, card]);
  const initials = new Set(names.map(([name]) => name[0]));

  for (const token of hangulTokens(question)) {
    // 첫 글자가 어느 이름과도 안 맞아도 버리지 않는다. 그 첫 글자 자체가 오타일 수
    // 있다("재이스" 의 재). 대신 음절 단계에서만 첫 글자를 맞추고, 자모 단계는 푼다.
    const initialKnown = initials.has(token[0]);
    if (FUNCTION_WORDS.has(token)) continue;
    // 두 글자 아래는 아무 이름과도 가까워서 첫 글자마저 틀리면 짚을 근거가 없다.
    if (!initialKnown && token.length < 3) continue;
    // 의도 어휘("스킬", "쿨타임", "체력"…)는 이름이 아니다. "스킬" 이 줄임말 "스카"(스카너) 와
    // 거리 1 이라 후보로 잡혔다.
    // 효과 낱말도 이름이 아니다. "럼블 E 마저" 의 "마저" 가 마오카이·마스터 이 후보로
    // 잡혀 "'마저' 챔피언을 찾지 못했습니다" 라고 되물었다. 표를 새로 만들지 않고
    // 이미 있는 별칭표를 그대로 본다.
    if (
      INTENT_WORD.test(token) ||
      FOCUS_LEXICON.some(([, pattern]) => pattern.test(token)) ||
      EFFECT_ALIASES.some(([alias]) => alias.test(token))
    ) {
      continue;
    }
    // 그 자체가 이름이면 오타가 아니다. "오공 Q 쿨타임" 의 오공이 오른·오리아나 후보로 잡혔다.
    if (names.some(([name]) => name === token)) continue;
    /*
     * 후보를 두 갈래로 모아 **자모 거리로 함께 줄 세운다.**
     *
     *   음절 갈래  첫 글자를 고정하고 거리 1. 촘촘하고 헛짚음이 적다.
     *   자모 갈래  첫 글자를 풀고 길이 대비 비율로 자른다. 첫 글자가 틀린 오타를 잡는다.
     *
     * 음절 갈래를 먼저 찾았다고 바로 내보내면 안 된다. "갈렌" 이 별칭 "갈리"(갈리오)와
     * 음절 거리 1 이라 먼저 걸리는데, 정답 "가렌" 은 자모 거리 1 로 더 가깝다.
     * 둘을 합쳐 자모 거리로 줄 세우면 가까운 쪽이 앞에 온다.
     */
    const tokenJamo = toJamo(token);
    const scored = new Map<string, { card: ChampionCard; distance: number }>();
    const consider = (card: ChampionCard, nameJamo: string) => {
      const distance = editDistance(tokenJamo, nameJamo);
      const prev = scored.get(card.id);
      if (!prev || distance < prev.distance) scored.set(card.id, { card, distance });
    };

    for (const [name, card] of names) {
      if (known.has(card.id)) continue;
      const nameJamo = toJamo(name);

      // 음절 갈래
      if (
        initialKnown &&
        name[0] === token[0] &&
        !(token.length <= 2 && name.length !== token.length) &&
        Math.abs(name.length - token.length) <= 1 &&
        editDistance(token, name) === 1
      ) {
        consider(card, nameJamo);
        continue;
      }

      // 자모 갈래
      if (Math.abs(nameJamo.length - tokenJamo.length) > 3) continue;
      const distance = editDistance(tokenJamo, nameJamo);
      if (distance === 0) continue;
      if (distance / Math.max(nameJamo.length, tokenJamo.length) > 0.25) continue;
      consider(card, nameJamo);
    }

    if (scored.size > 0) {
      const ranked = [...scored.values()].sort((a, b) => a.distance - b.distance);
      return { original: token, candidates: ranked.map((entry) => entry.card) };
    }
  }
  return undefined;
}

/** 카드에 쓰는 능력치 이름. 순서가 곧 표의 행 순서다. */
export const CARD_STATS: StatName[] = ["health", "armor", "magicResist", "attackDamage", "moveSpeed"];

// ── 비교 ──────────────────────────────────────────────────────────────

/** 둘 이상을 견주는 질문인가. "누가 더 높아", "어느 쪽이", "비교", "중에". */
const COMPARISON = /더\s*(높|많|센|강|단단|긴|짧|빠|느|좋)|누가|어느\s*쪽|비교|중에|\bvs\b/i;

export function asksComparison(question: string, championCount: number): boolean {
  return championCount >= 2 && COMPARISON.test(question);
}

/**
 * 상성을 묻는가. "제이스랑 상대한다 생각하면", "럼블 만나면 어떻게 해?".
 * 대화에서 방금 다룬 챔피언이 있으면 그가 내 챔피언, 새로 나온 이름이 상대다.
 */
const MATCHUP = /상대|맞상대|맞붙|라인전|만나면|만났을|만날\s*때|카운터|어떻게\s*(해야|하지|해\b|되|풀)|이길|이겨|이기|싸우|붙으면|붙었|유리|불리|\bvs\b/i;

export function asksMatchup(question: string): boolean {
  return MATCHUP.test(question);
}

/**
 * 둘 중 누가 **내 챔피언**인지 가린다.
 *
 * 예전에는 문장에 먼저 나온 쪽을 내 챔피언으로 삼았다. "오공으로 럼블" 은 맞지만
 * 상대를 먼저 말하면 통째로 뒤집힌다. 열 문장으로 재 보니 넷만 맞았다.
 *
 *   럼블 상대로 오공 하는데 어려워       → 럼블이 내 챔피언이 됐다
 *   야스오 상대로 말파이트 괜찮아?       → 야스오가 내 챔피언이 됐다
 *   제드 상대하는 럭스 공략              → 제드가 내 챔피언이 됐다
 *
 * 한국어는 그 자리를 **조사가** 표시한다. `-으로/로` 는 내가 잡은 쪽이고,
 * 이름 뒤의 `상대`·`전`·`vs`·`카운터` 는 맞은편이다. 어순은 마지막에만 본다.
 *
 * `상대로` 는 `-로` 로 끝나지만 내 쪽이 아니다. 앞이 `상대` 면 세지 않는다.
 */
const PLAYS = /(?<!상대)(으로|로)(\s|$)/;
const FACES = /^\s*(을|를|이|가|은|는|와|과|랑|이랑)?\s*(상대|전에서|전\s|vs|카운터|맞상대)/i;
/*
 * 이름 **앞**의 표지는 주격일 때만 센다.
 *
 * "상대가 럼블인데" 는 럼블이 맞은편이라는 뜻이다. 그런데 `로` 까지 세었더니
 * "럼블 상대로 오공" 에서 오공 앞의 "상대로" 가 걸려 오공도 맞은편이 되었다.
 * 그 "상대로" 는 앞에 있는 럼블의 표지이지 오공의 것이 아니다. 둘 다 -2 가 되어
 * 차이가 0 이 되고 어순으로 떨어졌다.
 */
const FACED_BEFORE = /(상대|맞상대)\s*(가|는|이)\s*$/;

export interface MatchupSides<T> {
  sides: [T, T];
  /**
   * 조사가 실제로 갈라 주었는가.
   *
   * 거짓이면 어순으로 떨어진 것이라 믿을 것이 못 된다. 스무 문항으로 재 보니 규칙이
   * 틀린 넷이 모두 이 자리였다("럼블 만났는데 나 오공", "상대 제드, 나 럭스").
   * 부르는 쪽은 이 값을 보고 모델에게 넘길지 정한다.
   */
  confident: boolean;
}

export function matchupSides<T extends { name: string }>(question: string, found: T[]): [T, T] {
  return matchupSidesDetailed(question, found).sides;
}

export function matchupSidesDetailed<T extends { name: string }>(question: string, found: T[]): MatchupSides<T> {
  const [first, second] = found;
  if (found.length < 2) return { sides: [first, second], confident: false };
  const score = (card: T): number => {
    const at = question.indexOf(card.name);
    if (at < 0) return 0;
    const after = question.slice(at + card.name.length);
    const before = question.slice(0, at);
    let value = 0;
    if (PLAYS.test(after.slice(0, 4))) value += 2;
    if (FACES.test(after)) value -= 2;
    if (FACED_BEFORE.test(before)) value -= 2;
    return value;
  };
  const gap = score(first) - score(second);
  // 조사가 갈라 주지 않으면 어순으로 간다. 그 편이 맞는 경우가 더 많았다.
  if (gap < 0) return { sides: [second, first], confident: true };
  return { sides: [first, second], confident: gap > 0 };
}

/**
 * "말파이트 상대법" 처럼 **한 챔피언의 공략을 통째로** 묻는가.
 *
 * `asksMatchup` 은 "상대" 만 보고 참이 되므로 이것까지 상성으로 끌고 갔다. 앞 대화에
 * 오공이 있었다는 이유로 "말파이트 상대법" 이 "오공 vs 말파이트" 가 됐다. 사용자는
 * 내 챔피언을 말한 적이 없다.
 *
 * 가르는 것은 **명사인가 서술인가** 다. "만나면", "붙으면", "어떻게 해" 는 마주친
 * 상황을 말하므로 상대가 누구인지 맥락이 채워 주는 것이 맞다. "상대법" 은 그 챔피언
 * 자체의 공략을 달라는 말이라 짝지을 상대가 없다.
 */
const GUIDE_ASK = /(상대|공략|카운터|대처|파훼)\s*법|(상대|공략)\s*하는\s*법/;

export function asksGuide(question: string): boolean {
  return GUIDE_ASK.test(question);
}

/** 스킬 전체를 설명해 달라는가. "스킬 설명해줘", "스킬 뭐 있어", "스킬 알려줘". */
const SKILLS_OVERVIEW = /스킬\s*(셋|세트|구성|킷)|스킬(들|은|이|도)?\s*(설명|알려|소개|정리|뭐|무엇|어떤|있|어떻)/;

export function asksSkillsOverview(question: string): boolean {
  return SKILLS_OVERVIEW.test(question);
}

/** 스킬 한 줄 요약. 요약이 없으면 본문 첫 문장. */
export function spellSummary(spell: SpellFact): string {
  return spell.summary ?? splitSentences(spell.text)[0] ?? "";
}

/**
 * 아이템 답의 머리글. 효과 이름을 잇고, 없으면 능력치를 잇는다.
 * "쇼진의 창 효과" 에 대화가 먼저 내놓는 한 줄이다.
 */
export function itemHeadline(answer: Extract<AdvisorAnswer, { kind: "item" }>): string {
  if (answer.effects.length) return answer.effects.map((effect) => effect.name).join(" · ");
  return answer.stats.map((stat) => `${stat.label} ${stat.value}`).join(" · ");
}

/**
 * 챔피언을 겨냥한 질문으로 보이는가. 이름은 없지만 "W 쿨타임", "설명해줘", "스킬 계수" 처럼
 * 챔피언이 있어야 답이 되는 질문. 대화·화면 맥락의 챔피언을 붙여도 되는지 가른다.
 * "쇼진의 창 효과" 는 여기 걸리면 안 되므로 아이템·규칙 판정 뒤에 쓴다.
 */
const CHAMPION_DIRECTED = /설명|스킬|능력치|스탯|상대|어때|어떤|세[?요]?$|강해|약해|쿨|계수|사거리|체력|방어|마저|이속|공격력/;

export function looksChampionDirected(question: string, slot?: string): boolean {
  return Boolean(slot) || CHAMPION_DIRECTED.test(question);
}

/**
 * 답에서 바로 갈 수 있는 화면.
 *
 * 링크는 모델이 아니라 코드가 만든다. 코드는 답의 개체(챔피언 id·규칙 종류)를 이미 알고
 * 있고, 모델에게 맡기면 없는 id 를 지어낸다. 상성·비교 답은 VS 화면, 룬·소환사 주문 규칙과
 * 아이템은 백과사전의 그 탭이다. 챔피언·스킬 답은 자료 카드 꼬리의 링크만 쓴다.
 */
export type AnswerLink =
  | { kind: "vs"; to: string; names: [string, string] }
  | { kind: "runes" | "summoner"; to: string }
  | { kind: "item"; to: string; name: string };

export function answerLinks(answer: AdvisorAnswer): AnswerLink[] {
  switch (answer.kind) {
    case "compare": {
      const [a, b] = answer.cards;
      if (!b) return [];
      return [{ kind: "vs", to: `/vs?a=${a.id}&t=${b.id}`, names: [a.name, b.name] }];
    }
    // 챔피언 하나·스킬 하나의 답에는 대화 안에 링크를 붙이지 않는다. "오공 Q 쿨", "W는?" 마다
    // "오공 VS 화면으로 이동" 이 따라붙어 대화가 버튼으로 어지러웠다. 그 챔피언의 VS 화면은
    // 자료 카드 꼬리("VS 화면에서 보기") 한 곳에서 간다. 대화 링크는 답이 곧 다음 행동인 것만 —
    // 상성·비교(둘을 VS 에서 보기), 규칙·아이템(백과사전에서 보기).
    case "champion":
    case "spell":
      return [];
    case "rule":
      if (answer.rule.subject === "rune") return [{ kind: "runes", to: "/encyclopedia?tab=runes" }];
      if (answer.rule.subject === "summoner") return [{ kind: "summoner", to: "/encyclopedia?tab=summoner" }];
      return [];
    case "item":
      return [{ kind: "item", to: `/encyclopedia?tab=items&item=${encodeURIComponent(answer.itemId)}`, name: answer.itemName }];
    default:
      return [];
  }
}

/**
 * 답의 자료가 같은지 가리는 열쇠. 같은 열쇠의 카드가 직전 답에 있으면 다시 그리지 않는다.
 * "오공 Q 쿨, W 쿨, E 쿨" 은 카드 세 장이 아니라 헤드라인 세 줄이어야 한다.
 */
export function answerKey(answer: AdvisorAnswer): string {
  switch (answer.kind) {
    case "spell":
      return `spell:${answer.championId}:${answer.spell.slot}`;
    case "champion":
      return `champion:${answer.card.id}:${answer.view ?? ""}:${answer.focus ?? ""}`;
    case "compare":
      return `compare:${answer.cards.map((card) => card.id).join(",")}:${answer.slot ?? ""}:${answer.matchup ? "m" : ""}`;
    case "rule":
      return `rule:${answer.rule.name}`;
    case "item":
      return `item:${answer.itemId}`;
    default:
      return answer.kind;
  }
}

/** 답이 다룬 챔피언. 다음 질문이 이름을 생략하면 이들이 맥락이다. */
export function answerChampionIds(answer: AdvisorAnswer): string[] {
  if (answer.kind === "spell") return [answer.championId];
  if (answer.kind === "champion") return [answer.card.id];
  if (answer.kind === "compare") return answer.cards.map((card) => card.id);
  return [];
}

export function focusLabel(focus: SpellFocus, lang: Language = "ko_KR"): string {
  const w = cardLabels(lang);
  return { cooldown: w.cooldown, cost: w.cost, ratio: w.ratios, damage: w.damageType, effect: w.effects }[focus];
}

/** 스킬 하나에서 사실 하나를 글로. 스킬 표(챔피언 카드의 focus)와 비교 표가 같이 쓴다. */
export function spellFocusValue(spell: SpellFact, focus: SpellFocus, lang: Language = "ko_KR"): string {
  switch (focus) {
    case "cooldown":
      return cooldownFact(spell, lang)?.value ?? "";
    case "cost":
      return spell.cost ?? "";
    case "ratio":
      return ratioText(Object.entries(spell.ratios ?? {}), lang);
    case "damage":
      return spell.damageTypes.map((type) => translateDamage(type, lang)).join("·");
    case "effect":
      return spell.effects.map((tag) => translateTag(tag, lang)).join(", ");
  }
}

/** 능력치를 가리키는 말. FOCUS_LEXICON 과 같은 성격의 의도 어휘다. */
const STAT_LEXICON: Array<[StatName, RegExp]> = [
  ["magicResist", /마법\s*저항|마저|마방/],
  ["attackSpeed", /공격\s*속도|공속/],
  ["moveSpeed", /이동\s*속도|이속|무빙/],
  ["attackDamage", /공격력|깡뎀|\bad\b/i],
  ["armor", /방어력|방어|아머/],
  ["health", /체력|피통|\bhp\b/i],
  ["healthRegen", /체력\s*재생|체젠/],
];

export function detectStat(question: string): StatName | undefined {
  // 체력 재생이 체력보다, 마법 저항이 방어보다 먼저 잡혀야 하므로 긴 것부터 순서대로.
  if (/체력\s*재생|체젠/.test(question)) return "healthRegen";
  return STAT_LEXICON.find(([, pattern]) => pattern.test(question))?.[0];
}

/** 질문이 가리킨 레벨. 없으면 1레벨. 자료가 1·6·11·18 만 있다. */
export function detectLevel(question: string): 1 | 6 | 11 | 18 {
  if (/18\s*레벨|18\s*렙|만렙|풀\s*레벨|후반/.test(question)) return 18;
  if (/11\s*레벨|11\s*렙/.test(question)) return 11;
  if (/6\s*레벨|6\s*렙/.test(question)) return 6;
  return 1;
}

function levelKey(level: 1 | 6 | 11 | 18): "lv1" | "lv6" | "lv11" | "lv18" {
  return `lv${level}` as "lv1" | "lv6" | "lv11" | "lv18";
}

/** 가장 큰 값의 열. 동률이면 undefined. */
function argmax(values: Array<number | undefined>): number | undefined {
  let best: number | undefined;
  let tie = false;
  values.forEach((value, index) => {
    if (value === undefined) return;
    const current = best === undefined ? undefined : values[best];
    if (current === undefined || value > current) {
      best = index;
      tie = false;
    } else if (value === current) {
      tie = true;
    }
  });
  return tie ? undefined : best;
}

/**
 * 챔피언 둘 이상을 견준다.
 *
 * 슬롯이 있으면 그 스킬의 사실을 나란히 놓고, 없으면 능력치를 놓는다.
 * 능력치는 높을수록 좋다고 보고 큰 쪽을 굵게 한다. 스킬 행은 크기 비교가 뜻이 없어
 * (쿨은 짧을수록, 소모는 적을수록, 계수는 클수록) 굵게 하지 않고 묻은 행만 강조한다.
 */
export function buildCompareAnswer(
  cards: ChampionCard[],
  question: string,
  slot?: string,
  options: { matchup?: boolean; notes?: { mine: string[]; enemy: string[] }; lang?: Language } = {},
): AdvisorAnswer {
  const lang = options.lang ?? "ko_KR";
  const w = cardLabels(lang);
  if (options.matchup) {
    // 상성은 능력치 표 + 상성 노트 위에 해설. 사실 하나를 짚은 헤드라인은 두지 않는다.
    const base = buildCompareAnswer(cards, question, undefined, { lang });
    return base.kind === "compare"
      ? { ...base, headline: undefined, rows: base.rows.map((row) => ({ ...row, hit: false })), matchup: true, notes: options.notes }
      : base;
  }
  if (slot) {
    const spells = cards.map((card) => card.spells.find((spell) => spell.slot === slot));
    const focus = detectSpellFocus(question)?.focus;
    const rows: CompareRow[] = [];
    const push = (label: string, pick: (spell: SpellFact) => string | undefined, hit: boolean) => {
      const values = spells.map((spell) => (spell ? pick(spell) ?? "" : ""));
      if (values.some(Boolean)) rows.push({ label, values, hit });
    };
    push(w.spell, (spell) => spell.name, false);
    push(
      spells.some((spell) => spell?.recharge) ? w.recharge : w.cooldown,
      (spell) => cooldownFact(spell, lang)?.value,
      focus === "cooldown",
    );
    push(w.cost, (spell) => spell.cost, focus === "cost");
    push(w.damageType, (spell) => spell.damageTypes.map((type) => translateDamage(type, lang)).join("·"), focus === "damage");
    push(w.effects, (spell) => spell.effects.map((tag) => translateTag(tag, lang)).join(", "), focus === "effect");
    push(
      w.ratios,
      (spell) => ratioText(Object.entries(spell.ratios ?? {}), lang),
      focus === "ratio",
    );
    const hit = rows.find((row) => row.hit);
    const headline = hit
      ? { label: `${slot} ${hit.label}`, value: cards.map((card, i) => `${card.name} ${hit.values[i] || "—"}`).join(" · ") }
      : undefined;
    return { kind: "compare", cards, slot, rows, headline };
  }

  const level = detectLevel(question);
  const asked = detectStat(question);
  const key = levelKey(level);
  const stats: StatName[] = asked && !CARD_STATS.includes(asked) ? [...CARD_STATS, asked] : CARD_STATS;
  const rows: CompareRow[] = stats.map((stat) => {
    const numbers = cards.map((card) => card.stats[stat]?.[key]);
    return {
      label: translateStat(stat, lang),
      values: numbers.map((n) => (n === undefined ? "" : String(n))),
      hit: stat === asked,
      winner: argmax(numbers),
    };
  });
  const hit = rows.find((row) => row.hit);
  let headline: Fact | undefined;
  if (hit) {
    // 큰 쪽부터. "말파이트 665 > 럼블 640", 동률은 "=".
    const order = cards
      .map((card, i) => ({ name: card.name, value: Number(hit.values[i]) }))
      .filter((entry) => Number.isFinite(entry.value))
      .sort((a, b) => b.value - a.value);
    const value = order
      .map((entry, i) => (i === 0 ? `${entry.name} ${entry.value}` : `${entry.value === order[i - 1].value ? "=" : ">"} ${entry.name} ${entry.value}`))
      .join(" ");
    headline = { label: `${hit.label} (${w.level(level)})`, value };
  }
  return { kind: "compare", cards, level, rows, headline };
}

/**
 * 백분위를 "상위 n%" 나 "하위 n%" 로 바꾼다.
 * 카드의 percentile 은 0(최저)~100(최고) 이다. 69.5 는 위에서 31% 자리다.
 */
export function percentileLabel(percentile: number): { side: "top" | "bottom"; value: number } {
  return percentile >= 50
    ? { side: "top", value: Math.max(1, Math.round(100 - percentile)) }
    : { side: "bottom", value: Math.max(1, Math.round(percentile)) };
}

/** 매우 높음·매우 낮음처럼 눈에 띄어야 하는 등급인지. 표에서 그 행만 굵게 한다. */
export function isExtremeGrade(grade: string): boolean {
  return grade === "매우 높음" || grade === "매우 낮음";
}

/**
 * 스킬 한 줄 요약. 손으로 적지 않고 데이터에서 조립한다.
 *   Q 화염방사기   쿨 10/9/8/7/6 · 최대 체력 비례 피해 · 주문력 105%
 * 챔피언 카드에서 스킬 다섯 개를 한 줄씩 보여 줄 때 쓴다.
 */
export function spellOneLiner(spell: SpellFact, lang: Language = "ko_KR"): string {
  const w = cardLabels(lang);
  const parts: string[] = [];
  if (spell.recharge) parts.push(w.briefRecharge(spell.recharge));
  else if (spell.cooldown) parts.push(w.briefCooldown(spell.cooldown));
  if (spell.effects.length) parts.push(spell.effects.slice(0, 3).map((tag) => translateTag(tag, lang)).join(" · "));
  const [top] = Object.entries(spell.ratios ?? {}).sort((a, b) => b[1] - a[1]);
  if (top) parts.push(ratioText([top], lang));
  if (parts.length) return parts.join(" · ");
  // 구조 필드가 하나도 없는 스킬(순수 패시브 등)은 요약 첫 절을 쓴다.
  return (spell.summary ?? spell.text).split(/[.。]/)[0].slice(0, 60);
}

/** 부정. 이것이 있으면 "아니오" 쪽이다. */
const NEGATION = /않|없|못\s|못합|불가|아니|제외|무시|적용되지|발동하지|주지\s*않/;
/** 조건이 갈리는 문장. 한쪽은 되고 한쪽은 안 되면 배지 하나로 답할 수 없다. */
const CONTRAST = /지만|반면|다만|경우에만|때만|에는\s*[^.]*에는/;
/** 긍정. 무엇이 일어난다는 뜻의 서술. */
const AFFIRM = /줍니다|적용|발동|증가|얻|추가|가능|받|쌓|들어|간주/;

/**
 * 예/아니오 배지를 달 수 있는지.
 *
 * 근거 문장이 **하나**일 때만 부르고, 그 문장의 극성이 분명할 때만 답을 낸다.
 * "…에는 적용되지만 …에는 않습니다" 처럼 조건이 갈리면 undefined 를 돌려주고
 * 카드는 배지 없이 문장만 보인다. 틀린 배지보다 배지 없는 편이 낫다.
 */
export function ruleVerdict(sentence: string): "yes" | "no" | undefined {
  if (CONTRAST.test(sentence)) return undefined;
  if (NEGATION.test(sentence)) return "no";
  if (AFFIRM.test(sentence)) return "yes";
  return undefined;
}

/**
 * 모델에게 넘길 해설 재료.
 *
 * 카드가 이미 수치를 그렸으므로 모델은 **수치를 되풀이하지 않고 뜻만 잇는다.**
 * 재료는 코드가 계산한 것(백분위 극단, 주 피해 유형, 계수 성향, 태그)이다.
 * 이번 세션에서 모델이 스스로 판단하면 틀리는 것을 봤다(럼블 E 가 마저를 안 깎는다고 답함).
 * 그래서 판단할 재료를 전부 주고 문장만 만들게 한다.
 */
/**
 * 해설 재료를 만든다.
 *
 * `lang` 은 **답이 나올 언어**다. 자료의 챔피언·스킬 이름은 카드가 그 로케일로
 * 실려 오지만, 효과 태그와 능력치 등급은 파이프라인이 한국어 리터럴로 타입을
 * 잡고 있어 여기서 옮긴다(promptLocale).
 *
 * 지시문까지 옮기지 않으면 모델이 지시문의 언어를 따라간다. 영어로 물어도
 * 한국어 답이 나왔던 원인이 이것이다.
 */
export function buildCommentaryPrompt(
  answer: AdvisorAnswer,
  patch: string,
  lang: Language = "ko_KR",
): string | undefined {
  const w = promptWords(lang);
  const rules = w.rules;
  const tags = (list: string[]): string => list.map((tag) => translateTag(tag, lang)).join(", ");

  if (answer.kind === "champion") {
    // 스킬 표(쿨·소모·계수…)는 조회다. 카드가 곧 답.
    if (answer.focus) return undefined;
    const card = answer.card;
    const lines = [`[${w.patch}] ${patch}`, `[${w.champion}] ${card.name}`];
    if (card.wiki?.subclass) lines.push(`- ${w.subclassLine(card.wiki.subclass, card.wiki.positions?.[0])}`);
    lines.push(`- ${w.damageLine(translateDamage(card.damageProfile.primary, lang), translateScaling(card.scalingProfile.primary, lang))}`);
    for (const stat of CARD_STATS) {
      const snap = card.stats[stat];
      if (!snap || !isExtremeGrade(snap.gradeLv1)) continue;
      const { side } = percentileLabel(snap.percentileLv1);
      lines.push(`- ${w.percentile(translateStat(stat, lang), side, translateGrade(snap.gradeLv1, lang))}`);
    }
    if (answer.view === "skills") {
      lines.push(`[${w.skills}]`);
      for (const spell of card.spells) lines.push(`- ${spell.slot} ${spell.name}: ${spellSummary(spell)}`);
    } else {
      // 스킬 이름과 그 스킬의 효과를 **붙여서** 준다.
      //
      // 처음에는 이름만 줬다. 지어내기는 멈췄지만 이번엔 짝을 틀리게 붙였다.
      // 야스오 P 낭인의 길에 에어본·투사체 차단·돌진을 몰아 주고, 말파이트 Q
      // 지진의 파편에 에어본을 붙였다. 이름 목록과 태그 뭉치를 따로 주면 어느
      // 태그가 어느 스킬 것인지는 모델이 찍는 수밖에 없다. 카드에 스킬마다
      // effects 가 이미 붙어 있으므로 그대로 옮긴다.
      lines.push(`[${w.abilities}]`);
      for (const spell of card.spells) {
        const effects = spell.effects.length ? `: ${tags(spell.effects)}` : "";
        lines.push(`- ${spell.slot} ${spell.name}${effects}`);
      }
    }
    // 운용 노트는 한국어로만 있다(플레이북이 한국어다). 영어·중국어 프롬프트에
    // 한국어 문단을 섞으면 모델이 그 언어를 따라가 답까지 한국어가 된다.
    // 그래서 한국어일 때만 싣는다. 노트가 빠져도 태그와 능력치로 답은 나온다.
    const notes = lang === "ko_KR" ? answer.notes : undefined;
    if (notes && (notes.playing.length || notes.against.length)) {
      lines.push(w.notesHeader);
      // 물은 쪽을 먼저 싣는다. 재료 순서가 곧 글 순서가 된다.
      const blocks = notes.perspective === "against"
        ? ([[w.against, notes.against], [w.playing, notes.playing]] as const)
        : ([[w.playing, notes.playing], [w.against, notes.against]] as const);
      for (const [label, list] of blocks) for (const note of list) lines.push(`- ${label}: ${note}`);
    }
    const hasNotes = Boolean(notes && (notes.playing.length || notes.against.length));
    lines.push("", ...rules);
    if (answer.view === "skills") {
      // "스킬셋이 어떻게 되어 있지" 는 스킬 다섯 개가 어떻게 맞물리는지를 묻는 것이다.
      // 스킬 하나하나의 설명은 카드에 있으니, 모델은 그 사이의 관계를 말한다.
      lines.push(w.closing.skills);
    } else if (hasNotes) {
      lines.push(w.closing.championWithNotes);
      // 어느 쪽을 물었는지는 조사로 이미 갈라 두었다. 모델에게 다시 가리게 하지 않는다.
      if (notes && notes.perspective !== "both") {
        lines.push(w.perspectiveOnly(notes.perspective === "against" ? w.against : w.playing));
      }
    } else {
      lines.push(w.closing.champion);
    }
    return lines.join("\n");
  }

  if (answer.kind === "spell") {
    // 쿨·소모·계수 하나를 물은 질문에는 해설을 붙이지 않는다. 재료가 숫자 하나뿐이라
    // 모델이 할 말이 없고, 실제로 10초 쿨을 "매우 짧다" 고 지어냈다. 카드가 곧 답이다.
    if (answer.highlighted.length === 0) return undefined;
    const lines = [
      `[${w.patch}] ${patch}`,
      `[${w.spell}] ${answer.championName} ${answer.spell.slot} ${answer.spell.name}`,
    ];
    if (answer.headline) lines.push(`- ${answer.headline.label}: ${answer.headline.value}`);
    for (const sentence of answer.highlighted) lines.push(`- ${sentence}`);
    if (answer.spell.effects.length) lines.push(`- ${w.effects}: ${tags(answer.spell.effects)}`);
    lines.push("", ...rules, w.closing.spell);
    return lines.join("\n");
  }

  if (answer.kind === "compare") {
    // 한 능력치·한 스킬 사실을 물은 비교는 헤드라인이 곧 답이다. 해설은 열린 비교
    // ("둘 중 누가 더 세?") 와 상성 질문에만 붙인다. 재료는 각자의 극단 능력치와 피해·계수 성향.
    if (!answer.matchup && (answer.headline || answer.slot)) return undefined;
    const [me, enemy] = answer.cards;
    const lines = [
      `[${w.patch}] ${patch}`,
      answer.matchup && enemy
        ? w.matchup(me.name, enemy.name)
        : `[${w.compare}] ${answer.cards.map((card) => card.name).join(" vs ")}`,
    ];
    for (const card of answer.cards) {
      const traits: string[] = [];
      if (card.wiki?.subclass) traits.push(card.wiki.subclass);
      traits.push(w.damageLine(translateDamage(card.damageProfile.primary, lang), translateScaling(card.scalingProfile.primary, lang)));
      for (const stat of CARD_STATS) {
        const snap = card.stats[stat];
        if (!snap || !isExtremeGrade(snap.gradeLv1)) continue;
        const { side } = percentileLabel(snap.percentileLv1);
        traits.push(w.percentile(translateStat(stat, lang), side, translateGrade(snap.gradeLv1, lang)));
      }
      /*
       * 비교에서도 스킬과 효과를 붙여서 준다. 따로 주면 짝을 틀리게 붙인다.
       *
       * 여기서는 이름 앞에 임자까지 붙인다. 줄머리에 `- 럼블:` 이 있어도 0.8B 는
       * 스킬 다섯 개를 읽는 사이에 그것을 놓치고 "오공은 P 고철장 거인" 을 썼다.
       * 이름마다 임자를 달아 두면 놓칠 자리가 없다.
       *
       * 열네 쌍을 두 번 돌려 쟀다. 근거 검사가 걷어낸 문장이 118 → 53 으로 줄고
       * 무한 반복이 5 → 2 로 줄었다. 두 번 다 같은 방향이었다.
       */
      traits.push(
        `${w.abilities}: ${card.spells
          .map((spell) => `${card.name} ${spell.slot} ${spell.name}${spell.effects.length ? `(${tags(spell.effects)})` : ""}`)
          .join(" · ")}`,
      );
      lines.push(`- ${card.name}: ${traits.join(" · ")}`);
    }
    /*
     * 상성 노트를 싣는다.
     *
     * 여기에만 노트가 빠져 있었다. 그래서 상성 질문에서는 모델이 카드 두 장만 보고
     * 글을 지어야 했고, 실제로 "오공은 마법으로 주 피해를 받습니다" 처럼 카드를
     * 거꾸로 읽은 글이 나왔다. 챔피언 하나를 묻는 자리에는 진작 노트가 들어가고
     * 있었는데 조합을 묻는 자리만 비어 있었던 것이다.
     *
     * 재료에는 두 가지가 들어간다. 두 카드에서 그 자리에서 도출한 문장과, 사람이
     * 검증해 둔 플레이북 문장이다. 도출한 쪽이 이 조합을 직접 말하므로 앞에 온다.
     */
    /*
     * 언어를 가리지 않는다.
     *
     * 예전에는 한국어일 때만 실었다. 노트가 한국어뿐이라 섞으면 모델이 한국어로
     * 답해 버렸기 때문이다. 그런데 그 바람에 영어·중국어 사용자는 상성 지식을
     * 하나도 못 받았다 — 카드만 보고 글을 지어야 했다.
     *
     * 이제 `matchupNotes` 가 언어별로 도출 문장을 짓고, 손으로 쓴 한국어 노트는
     * 한국어일 때만 붙인다. 여기까지 온 글은 그 화면의 언어로 쓰여 있다.
     */
    const matchupNotes = answer.notes;
    if (matchupNotes && (matchupNotes.mine.length || matchupNotes.enemy.length)) {
      lines.push(w.notesHeader);
      for (const note of matchupNotes.mine) lines.push(`- ${me.name}: ${note}`);
      for (const note of matchupNotes.enemy) lines.push(`- ${enemy?.name ?? ""}: ${note}`);
    }
    lines.push(
      "",
      ...rules,
      answer.matchup && enemy ? w.closing.matchup(me.name, enemy.name) : w.closing.compare,
    );
    return lines.join("\n");
  }

  // 규칙 답에는 해설을 붙이지 않는다. 배지와 근거 문장이 곧 답이라, 모델은 그 문장을
  // 되풀이할 뿐이었다("점화 스킬을 사용하면 정복자 중첩이 두 개 추가로 적용됩니다").
  // 되풀이는 분석이 아니고, 기다리게만 한다.
  return undefined;
}
