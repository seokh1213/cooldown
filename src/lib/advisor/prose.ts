/**
 * 코드가 쓰는 답문
 *
 * 카드만 만들고 대화에는 칩 하나만 남겨 두었다. 모델이 있을 때는 그 위에 해설이 붙으니
 * 말이 되는데, 모델이 없으면 대화가 이렇게 보인다.
 *
 *   사용자  오공 스킬 쿨타임
 *   도우미  [오공 · 스킬 · 재사용 대기시간 →]
 *
 * 물어본 사람 입장에서는 답을 못 받은 화면이다. 값은 옆 패널에 있지만 좁은 화면에서는
 * 그 패널조차 없다. 그래서 **답을 글로도 적는다.** 모델이 쓰는 것이 아니라 카드에 이미
 * 들어 있는 값을 문장으로 옮기는 것이라, 틀릴 자리가 없고 0초에 나온다.
 *
 * 카드와 겹치지 않느냐 — 겹친다. 다만 카드는 표이고 이것은 답이다. 표는 훑어보는
 * 것이고 답은 읽는 것이라 하는 일이 다르다. 카드 쪽은 대신 노트까지 얹어 더 준다.
 */
import type { Language } from "@/i18n";
import type { AdvisorAnswer } from "./answer";
import type { ChampionCard, SpellFact } from "../../../scripts/llm/lib/facts";
import { cooldownFact, focusLabel as cardFocusLabel, spellOneLiner } from "./answer";
import { translateRatioStat, translateTag } from "./promptLocale";
import { labelSlots } from "./grounding";

interface ProseWords {
  /** "{champion}의 {label}입니다." 처럼 값 하나를 알리는 말 */
  is: (subject: string, value: string) => string;
  /** 스킬 목록을 여는 말 */
  perSkill: (champion: string, label: string) => string;
  skillset: (champion: string) => string;
  effects: (subject: string, list: string) => string;
  none: (subject: string) => string;
  joiner: string;
  /** 두 번째 문장의 주어. 앞 문장에서 이미 이름을 댔으므로 되풀이하지 않는다. */
  it: string;
}

const WORDS: Record<Language, ProseWords> = {
  ko_KR: {
    is: (subject, value) => `${subject}은 ${value}입니다.`,
    perSkill: (champion, label) => `${champion}의 스킬별 ${label}입니다.`,
    skillset: (champion) => `${champion}의 스킬 구성입니다.`,
    effects: (subject, list) => `${subject}의 효과는 ${list}입니다.`,
    none: (subject) => `${subject}은 자료에 없습니다.`,
    joiner: ", ",
    it: "이 스킬",
  },
  en_US: {
    is: (subject, value) => `${subject} is ${value}.`,
    perSkill: (champion, label) => `${label} for each of ${champion}'s abilities:`,
    skillset: (champion) => `${champion}'s abilities:`,
    effects: (subject, list) => `${subject} applies ${list}.`,
    none: (subject) => `${subject} is not in the data.`,
    joiner: ", ",
    it: "It",
  },
  zh_CN: {
    is: (subject, value) => `${subject}为 ${value}。`,
    perSkill: (champion, label) => `${champion} 各技能的${label}：`,
    skillset: (champion) => `${champion} 的技能构成：`,
    effects: (subject, list) => `${subject}的效果为${list}。`,
    none: (subject) => `资料中没有${subject}。`,
    joiner: "，",
    it: "该技能",
  },
};

/** 스킬 하나에서 질문이 가리킨 값을 꺼낸다. 카드가 쓰는 것과 같은 규칙이다. */
function focusValue(spell: SpellFact, focus: string, lang: Language): string | undefined {
  if (focus === "cooldown") return cooldownFact(spell, lang)?.value;
  if (focus === "cost") return spell.cost || undefined;
  if (focus === "ratio") {
    const ratios = Object.entries(spell.ratios ?? {});
    return ratios.length ? ratios.map(([stat, value]) => `${translateRatioStat(stat, lang)} ${value}%`).join(", ") : undefined;
  }
  return undefined;
}

/**
 * 질문이 가리킨 사실의 이름.
 *
 * 카드가 쓰는 말을 그대로 가져온다. 표의 머리와 글의 말이 다르면 같은 값을 두 이름으로
 * 부르는 꼴이 된다. 충전형 스킬이 섞이면 "재충전 대기시간" 이 되는 것도 카드와 같다.
 */
function focusLabel(answer: Extract<AdvisorAnswer, { kind: "champion" }>, lang: Language): string {
  if (answer.focus === "cooldown") {
    for (const spell of answer.card.spells) {
      const fact = cooldownFact(spell, lang);
      if (fact) return fact.label;
    }
  }
  return answer.focus ? cardFocusLabel(answer.focus, lang) : "";
}

/**
 * 대화에 실을 답문을 만든다. 만들 수 없으면 비운다(카드만 나간다).
 *
 * 규칙 답은 이미 문장이 대화에 실리므로 건드리지 않는다.
 */
export function answerProse(answer: AdvisorAnswer, lang: Language = "ko_KR"): string {
  const w = WORDS[lang] ?? WORDS.ko_KR;

  if (answer.kind === "spell") {
    const title = `${answer.championName} ${answer.spell.slot} ${answer.spell.name}`;
    const lines: string[] = [];
    if (answer.headline) lines.push(w.is(`${title} ${answer.headline.label}`, answer.headline.value));
    else if (answer.highlighted.length) lines.push(answer.highlighted.join(" "));
    else lines.push(spellOneLiner(answer.spell, lang));
    // 두 번째 문장에서 이름을 다시 대면 "말파이트 R 멈출 수 없는 힘" 이 두 줄 연속으로
    // 나온다. 앞에서 누구인지 밝혔으므로 여기서는 가리키는 말이면 된다.
    if (answer.spell.effects.length && answer.headline) {
      lines.push(w.effects(w.it, answer.spell.effects.map((tag) => translateTag(tag, lang)).join(w.joiner)));
    }
    return lines.join(" ");
  }

  if (answer.kind === "champion") {
    const name = answer.card.name;
    const focus = answer.focus;
    if (focus) {
      const label = focusLabel(answer, lang);
      const rows = answer.card.spells
        .map((spell) => {
          const value = focusValue(spell, focus, lang);
          return value ? `${spell.slot} ${spell.name} ${value}` : undefined;
        })
        .filter((row): row is string => Boolean(row));
      if (rows.length === 0) return "";
      return `${w.perSkill(name, label)} ${rows.join(w.joiner)}.`;
    }
    // 이름만 늘어놓으면 "P 화강암 방패, Q 지진의 파편…" 으로 끝나 아무것도 안 알려 준다.
    // 스킬마다 쿨·효과 한 줄을 붙인다. 카드에 이미 있는 값이라 지어내는 부분이 없다.
    if (answer.view === "skills") {
      const lines = answer.card.spells.map((spell) => `- ${spell.slot} ${spell.name}: ${spellOneLiner(spell, lang)}`);
      return [w.skillset(name), ...lines].join("\n");
    }
    return championDigest(answer, lang);
  }

  if (answer.kind === "compare" && answer.headline) {
    return w.is(answer.headline.label, answer.headline.value);
  }

  if (answer.kind === "compare" && answer.matchup) return matchupDigest(answer, lang);

  if (answer.kind === "item") {
    if (answer.verdicts.length) {
      return answer.verdicts
        .map((verdict) => (verdict.evidence ? verdict.evidence : w.none(`${answer.itemName} ${translateTag(verdict.tag, lang)}`)))
        .join(" ");
    }
    if (answer.effects.length) {
      return w.effects(answer.itemName, answer.effects.map((effect) => effect.name).join(w.joiner));
    }
    return "";
  }

  return "";
}

const firstSentence = (text: string) => text.split(/(?<=[.!?。])\s+/)[0]?.trim() ?? text;

/**
 * 상대에게 맞으면 곤란한 효과. 상성 요약의 "조심할 것" 을 고르는 잣대다.
 *
 * 카드 태그를 그대로 쓴다(스킬 865개에 붙은 값). 붙잡는 것과 저항을 깎는 것이 위협이다
 * — "럼블 E 전기 작살을 맞으면 마법 저항력이 깎인다" 가 이 둘이 겹친 경우다.
 */
const THREAT_TAGS = new Set([
  "둔화", "기절", "속박", "에어본", "강제 이동(넉백/끌기)", "침묵", "공포", "매혹", "도발", "억제",
  "적 마법 저항력 감소", "적 방어력 감소", "처형", "치유 감소",
]);

const DIGEST_HEADINGS: Record<Language, { watch: string; build: string; fight: string; playing: string; against: string }> = {
  ko_KR: { watch: "조심할 것", build: "아이템", fight: "싸우는 법", playing: "플레이할 때", against: "상대할 때" },
  en_US: { watch: "Watch out", build: "Build", fight: "How to fight", playing: "Playing it", against: "Playing against it" },
  zh_CN: { watch: "注意", build: "出装", fight: "打法", playing: "使用时", against: "对线时" },
};

/**
 * 질문이 한 갈래를 콕 집으면 "싸우는 법" 칸의 제목을 그 갈래로 바꾼다.
 * "라인전 어떻게 해" 에 "싸우는 법" 이라고 답하면 물은 것에 답했는지 한눈에 안 보인다.
 */
const FIGHT_TITLES: Record<Language, Partial<Record<string, string>>> = {
  ko_KR: { combo: "콤보", laning: "라인전", teamfight: "한타", phase: "운영", "escape-window": "진입 타이밍" },
  en_US: { combo: "Combo", laning: "Laning", teamfight: "Teamfights", phase: "Game plan", "escape-window": "When to go in" },
  zh_CN: { combo: "连招", laning: "对线", teamfight: "团战", phase: "运营", "escape-window": "进场时机" },
};

/** 문장이 챔피언 이름으로 시작하지 않으면 앞에 붙인다. 이미 "럼블의" 로 시작하면 둔다. */
function withOwner(line: string, name: string | undefined): string {
  if (!name || line.startsWith(name)) return line;
  return `${name} ${line}`;
}

/** 한 칸에 싣는 문장 수 상한. 길어지면 요약이 아니라 노트 전문이 된다. */
const PER_SECTION = 2;

/**
 * 상성 답을 검증된 문장으로 조립한다. 모델이 쓰지 않는다.
 *
 * 0.8B 가 쓴 상성 해설은 어떤 프롬프트로도 1~2점이었다(14쌍, 1~5점). 같은 자리에
 * 검증된 노트 셋을 그대로 놓으면 3.8, 판정기가 고른 셋이면 4.1 이었다. 옳은 말만
 * 나가고 되풀이·지어내기가 없다. 모델이 없는 기기도 같은 답을 받는다.
 *
 * **칸을 코드가 정한다.** 처음에는 "도출 하나·내 노트 하나·상대 노트 하나" 를 순서대로
 * 뽑았는데, 오공·럼블에서 "오공의 물리 피해가 럼블 방어력에 막힌다" 가 먼저 나오고
 * 정작 급한 말 — 럼블 E 를 맞으면 마법 저항력이 깎인다, 오공은 마법 저항력이 바닥이라
 * 마저 아이템이 먼저다 — 은 빠졌다. 재료에는 다 있었다. 순서가 기계적이었을 뿐이다.
 *
 *   조심할 것  상대 노트 중 위협 효과(붙잡기·저항 깎기)를 가진 스킬을 말하는 것
 *   아이템     상대 피해가 내 약한 저항을 파고드는가 + 초반 저항 아이템 + 상황별 아이템 노트
 *   싸우는 법  내 콤보 + 상대의 빈틈(이동 수단 공백·라인전) + 시간이 누구 편인가
 *
 * 노트마다 첫 문장만 쓴다. 한 갈래를 물었으면 그 칸의 첫 노트는 전문으로, 다른 노트에는 "언제" 를
 * 말하는 문장을 하나씩 덧붙인다(`DigestDetail`).
 * 나머지 전문은 카드에서 펼쳐 볼 수 있다.
 */
export function matchupDigest(
  answer: Extract<AdvisorAnswer, { kind: "compare" }>,
  lang: Language = "ko_KR",
  detail: DigestDetail = "focus-cue-all",
): string {
  return digestSections(answer, lang, detail)
    .filter((section) => section.lines.length)
    .map((section) => `**${section.title}**\n${labelSlots(section.lines.join(" "), answer.cards)}`)
    .join("\n\n");
}

/** 상성 요약의 칸 하나. `key` 로 다른 조립(XML 답 등)이 칸을 맞춰 쓴다. */
export interface DigestSection {
  key: "watch" | "build" | "fight";
  title: string;
  /** 검증된 문장. 슬롯 붙이기 전이다. */
  lines: string[];
}

/** 칸별로 고른 문장. 칸 순서는 물은 주제를 따른다. */
/**
 * 물은 칸을 얼마나 자세히 실을지. 일반 질문(갈래 general)은 어느 값이든 첫 문장만 싣는다.
 *
 * 한 갈래 8문항 맹검(1~5점, 2026-09-24, 채점은 답을 처음 보는 별도 에이전트):
 *   focus-lead 3.50 · focus-full 3.38 · short 2.75 · 4B 산문 2.62
 * 첫 문장만으로는 "W 응수를 빼내는 것이 첫 과제입니다" 에서 끝나 방법이 빠졌다(얇다).
 * 전부 펼치면 길어져 물은 것이 묻혔고, 뒤쪽 노트의 틀린 문장까지 딸려 나왔다.
 *
 * 10점 항목 채점(직답 2·슬롯 1·방법 2·타이밍 2·상성 특화 1·정확 1·간결 1)으로 다시 쟀다.
 * 규칙을 맞춘 8문항과, 규칙을 고칠 때 보지 않은 검증 8문항(`FOCUSED_HOLDOUT`):
 *
 *                   맞춘 8   검증 8
 *   short            6.12     5.12
 *   focus-lead       7.38     6.88
 *   focus-cue        7.62     7.50
 *   focus-cue-all    8.12     8.12   ← 기본
 *
 * 오른 것은 타이밍(0.88 → 1.38)과 상성 특화였다. 노트의 둘째 문장 이후에 "Q를 맞은 직후에는",
 * "Q·W·E를 모두 쓴 직후가 반격 구간" 같은 문장이 있었는데 첫 문장만 싣느라 버리고 있었다.
 *
 *   short       노트마다 첫 문장만
 *   focus-full  물은 칸의 노트는 전문
 *   focus-lead  물은 칸의 첫 노트만 전문, 나머지는 첫 문장
 *   focus-cue   focus-lead 에 더해: 물은 칸에서 내 노트와 상대 노트를 번갈아 싣고, 질문 낱말이
 *               든 문장을 앞에 두고, 나머지 노트에는 "언제" 를 말하는 문장을 하나 덧붙인다
 *   focus-cue-all  focus-cue 의 덧붙이기를 다른 칸에도(기본)
 */
export type DigestDetail = "short" | "focus-full" | "focus-lead" | "focus-cue" | "focus-cue-all";

export function digestSections(
  answer: Extract<AdvisorAnswer, { kind: "compare" }>,
  lang: Language = "ko_KR",
  detail: DigestDetail = "focus-cue-all",
): DigestSection[] {
  const notes = answer.notes;
  const plan = notes?.plan;
  if (!notes || !plan) return [];
  // 첫 문장 → 전문. 물은 칸을 펼칠 때 쓴다. 도출 문장은 한 문장이라 그대로다.
  const fullOf = new Map([...plan.mine, ...plan.enemy].map((entry) => [firstSentence(entry.text), entry.text]));
  const [, enemy] = answer.cards;
  const heading = DIGEST_HEADINGS[lang] ?? DIGEST_HEADINGS.ko_KR;
  const claims = (kind: string) => plan.claims.filter((claim) => claim.kind === kind).map((claim) => claim.text);
  const byCategory = (list: typeof plan.mine, ...categories: string[]) =>
    categories.flatMap((category) => list.filter((entry) => entry.category === category)).map((entry) => firstSentence(entry.text));

  // 상대 노트를 위협 정도로 줄 세운다. 노트가 부르는 상대 스킬의 효과 태그 중 위협인 것의 수.
  // 노트는 스킬을 이름으로도("전기 작살을") 슬롯으로도("R은", "E로") 부른다. 둘 다 본다.
  const threat = (text: string) =>
    (enemy?.spells ?? [])
      .filter(
        (spell) =>
          (spell.name.length >= 2 && text.includes(spell.name)) ||
          (spell.slot !== "P" && new RegExp(`(?<![A-Za-z])${spell.slot}(?=\\s|[은는이가을를로의와과에]|$)`).test(text)),
      )
      .reduce((sum, spell) => sum + spell.effects.filter((tag) => THREAT_TAGS.has(tag)).length, 0);
  // 질문이 상대 스킬을 슬롯으로 집었으면("드레이븐 Q") 그 스킬을 말하는 노트가 위협 점수보다 먼저다
  const askedSlots = detail === "focus-cue" || detail === "focus-cue-all" ? enemySlotsAsked(plan.question ?? "", enemy) : [];
  const namesSlot = (text: string) =>
    askedSlots.some(
      (spell) => (spell.name.length >= 2 && text.includes(spell.name)) || new RegExp(`(?<![A-Za-z])${spell.slot}(?=\\s|[은는이가을를로의와과에]|$)`).test(firstSentence(text)),
    );
  const threats = plan.enemy
    .filter((entry) => ["skill", "laning", "teamfight"].includes(entry.category))
    .map((entry) => ({ text: firstSentence(entry.text), score: threat(entry.text) + (namesSlot(entry.text) ? 100 : 0) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.text);

  const focus = plan.focus ?? "general";
  const cue = detail === "focus-cue" || detail === "focus-cue-all";
  const fightCategories = FIGHT_TITLES.ko_KR[focus] ? [focus] : [];
  const watch: [DigestSection["key"], string, string[], number] = [
    "watch",
    heading.watch,
    [...threats.slice(0, focus === "skill" ? 2 : 1).map((line) => withOwner(line, enemy?.name)), ...claims("pinned")],
    PER_SECTION,
  ];
  const build: [DigestSection["key"], string, string[], number] = [
    "build",
    heading.build,
    [...claims("defense"), ...byCategory(plan.mine, "situational-item"), ...byCategory(plan.enemy, "situational-item"), ...claims("offense")],
    // 아이템을 물었으면 더 싣는다
    focus === "situational-item" ? 3 : PER_SECTION,
  ];
  const fight: [DigestSection["key"], string, string[], number] = [
    "fight",
    (FIGHT_TITLES[lang] ?? FIGHT_TITLES.ko_KR)[focus] ?? heading.fight,
    [
      // 물은 갈래의 노트를 먼저. 시간대를 물었으면 성장 문장이 곧 답이다.
      ...(focus === "phase" ? claims("scaling") : []),
      ...(cue
        ? interleave(byCategory(plan.mine, ...fightCategories), byCategory(plan.enemy, ...fightCategories))
        : [...byCategory(plan.mine, ...fightCategories), ...byCategory(plan.enemy, ...fightCategories)]),
      // 시간대 낱말이 가리키는 갈래를 콤보보다 먼저. "후반 어때" 에 콤보를 채우지 않게.
      ...(cue ? timeCategories(plan.question ?? "", focus).flatMap((category) => interleave(byCategory(plan.mine, category), byCategory(plan.enemy, category))) : []),
      ...byCategory(plan.mine, "combo"),
      ...byCategory(plan.enemy, "escape-window", "laning"),
      ...claims("scaling"),
    ],
    fightCategories.length ? 3 : PER_SECTION,
  ];
  // 물은 칸을 맨 앞에 둔다
  const sections =
    focus === "situational-item" ? [build, watch, fight] : fightCategories.length ? [fight, watch, build] : [watch, build, fight];
  const used = new Set<string>();
  const asked = focus !== "general";
  return sections.map(([key, title, lines, size], index) => {
    const picked = lines.filter((line) => line && !used.has(line)).slice(0, size);
    for (const line of picked) used.add(line);
    // 한 갈래를 물었으면 맨 앞 칸이 그 답이다. 첫 문장만으로는 "W 응수를 빼내는 것이 첫
    // 과제입니다" 에서 끝나 방법이 빠졌다. 그 칸만 노트 전문으로 펼친다.
    const expand = asked && index === 0 && detail !== "short";
    if (cue && asked) {
      const terms = questionTerms(plan.question ?? "");
      const names = [enemy?.name, ...(enemy?.spells ?? []).map((spell) => spell.name)].filter((name): name is string => !!name && name.length >= 2);
      // 노트끼리 문장이 겹친다(조건만 다른 같은 콤보 노트). 이미 실은 문장은 다시 싣지 않는다.
      const said = new Set<string>();
      const shown: string[] = [];
      for (const [i, line] of picked.entries()) {
        const full = expandLine(line, fullOf, enemy?.name);
        let text = line;
        if (full !== line && expand && i === 0) text = leadWithTerms(full, terms);
        else if (full !== line && (expand || detail === "focus-cue-all")) {
          const extra = cueSentence(full, terms, names, said);
          if (extra) text = `${line} ${extra}`;
        }
        const fresh = sentencesOf(text).filter((sentence) => !said.has(sentence));
        if (!fresh.length) continue;
        for (const sentence of fresh) said.add(sentence);
        shown.push(fresh.join(" "));
      }
      return { key, title, lines: shown };
    }
    const shown = expand
      ? picked.map((line, i) => (detail === "focus-full" || i === 0 ? expandLine(line, fullOf, enemy?.name) : line))
      : picked;
    return { key, title, lines: shown };
  });
}

const sentencesOf = (text: string) => text.split(/(?<=[.!?。])\s+/).map((sentence) => sentence.trim()).filter(Boolean);

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/** "언제" 를 말하는 문장. 채점에서 가장 많이 잃은 항목이 타이밍이었다. */
const TIMING = /직후|뒤에|뒤로|이후|후에|빠진|빠지면|빠졌|끝난|끝나|동안|쿨타임|대기시간|재사용|순간|시점|타이밍|때만|레벨/;
const TIME_WORDS = ["초반", "중반", "후반", "라인전", "한타", "갱킹", "합류", "스플릿", "오브젝트"];

const TIME_CATEGORY: Record<string, string> = { 후반: "teamfight", 한타: "teamfight", 초반: "laning", 라인전: "laning" };

function timeCategories(question: string, focus: string): string[] {
  return [...new Set(Object.entries(TIME_CATEGORY).filter(([word]) => question.includes(word)).map(([, category]) => category))].filter(
    (category) => category !== focus,
  );
}

/** 질문이 상대 스킬을 슬롯으로 집었는가. "드레이븐 Q", "피오라 W" 처럼 상대 이름 바로 뒤의 슬롯 */
function enemySlotsAsked(question: string, enemy: ChampionCard | undefined) {
  if (!enemy) return [];
  const slots = [...question.matchAll(new RegExp(`${enemy.name}\\s*([QWER])(?![A-Za-z])`, "gi"))].map((m) => m[1].toUpperCase());
  return enemy.spells.filter((spell) => slots.includes(spell.slot));
}

/** 질문에서 문장을 고를 때 쓸 낱말. 시간대 낱말과 슬롯 글자("피오라 W") */
function questionTerms(question: string): RegExp[] {
  // "5레벨 후반부터" 의 후반은 게임 후반이 아니다
  const terms = TIME_WORDS.filter((word) => question.includes(word)).map((word) => new RegExp(`(?<!레벨 )${word}`));
  for (const m of question.matchAll(/(?<![A-Za-z])([QWER])(?![A-Za-z])/gi)) terms.push(new RegExp(`(?<![A-Za-z])${m[1].toUpperCase()}(?![A-Za-z])`));
  return terms;
}

/** 전문을 싣되 질문 낱말이 든 문장을 앞으로. "후반 어때" 에 초반 이야기부터 하지 않게. */
function leadWithTerms(full: string, terms: RegExp[]): string {
  if (!terms.length) return full;
  const sentences = sentencesOf(full);
  const hit = sentences.filter((sentence) => terms.some((term) => term.test(sentence)));
  if (!hit.length || hit[0] === sentences[0]) return full;
  return [...hit, ...sentences.filter((sentence) => !hit.includes(sentence))].join(" ");
}

/** 첫 문장 뒤에 덧붙일 한 문장. 질문 낱말·타이밍·상대 이름이 든 것 중 가장 나은 것 */
function cueSentence(full: string, terms: RegExp[], names: string[], said: Set<string>): string | undefined {
  let best: { sentence: string; score: number } | undefined;
  for (const sentence of sentencesOf(full).slice(1)) {
    if (said.has(sentence)) continue;
    const score =
      (terms.some((term) => term.test(sentence)) ? 2 : 0) + (TIMING.test(sentence) ? 2 : 0) + (names.some((name) => sentence.includes(name)) ? 1 : 0);
    if (score >= 2 && (!best || score > best.score)) best = { sentence, score };
  }
  return best?.sentence;
}

/** 첫 문장을 노트 전문으로 바꾼다. `withOwner` 가 이름을 붙였으면 떼고 찾아 다시 붙인다. */
function expandLine(line: string, fullOf: Map<string, string>, name: string | undefined): string {
  const direct = fullOf.get(line);
  if (direct) return direct;
  if (name && line.startsWith(`${name} `)) {
    const full = fullOf.get(line.slice(name.length + 1));
    if (full) return withOwner(full, name);
  }
  return line;
}

/**
 * 챔피언 하나를 물은 답을 노트로 조립한다. 상성 요약과 같은 까닭으로 모델이 쓰지 않는다.
 *
 * 노트는 이미 질문의 갈래·관점에 맞춰 골라져 있다(`selectNotes`). 여기서는 물은 쪽을
 * 먼저 두고, 묻지 않은 쪽은 한 줄만 붙인다.
 */
function championDigest(answer: Extract<AdvisorAnswer, { kind: "champion" }>, lang: Language): string {
  const notes = answer.notes;
  if (!notes || (!notes.playing.length && !notes.against.length)) return "";
  const heading = DIGEST_HEADINGS[lang] ?? DIGEST_HEADINGS.ko_KR;
  const block = (title: string, lines: string[], size: number) =>
    lines.length ? `**${title}**\n${labelSlots(lines.slice(0, size).map(firstSentence).join(" "), [answer.card])}` : "";
  const size = { main: 3, side: 1 };
  const parts =
    notes.perspective === "against"
      ? [block(heading.against, notes.against, size.main), block(heading.playing, notes.playing, size.side)]
      : notes.perspective === "playing"
        ? [block(heading.playing, notes.playing, size.main), block(heading.against, notes.against, size.side)]
        : [block(heading.playing, notes.playing, 2), block(heading.against, notes.against, 2)];
  return parts.filter(Boolean).join("\n\n");
}
