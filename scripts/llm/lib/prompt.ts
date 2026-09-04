/**
 * 상성 조언 프롬프트 조립
 *
 * 컨텍스트 = [자동 도출 사실 카드] + [규칙 기반 아이템/룬/주문 후보] + [큐레이션 팁]
 * 모델에게는 "주어진 자료 밖의 수치·아이템명을 만들지 말 것" 을 강하게 요구한다.
 */
import { championCardToText, type ChampionCard } from "./facts";
import { tipsToText, type CuratedTip } from "./knowledge";
import {
  itemSelectionToText,
  keystonesToText,
  summonersToText,
  type ItemSelection,
  type RuneBrief,
  type SummonerBrief,
} from "./retrieval";
import type { ChatMessage } from "./ollama";
import { playbookToText, type SelectedPlaybook } from "./playbook";

export interface MatchupContext {
  patch: string;
  lane?: string;
  me: ChampionCard;
  enemy: ChampionCard;
  items: ItemSelection;
  keystones: RuneBrief[];
  summoners: SummonerBrief[];
  tips: CuratedTip[];
  playbook?: SelectedPlaybook;
  /** 컨텍스트 크기 절약 모드 (소형 모델용) */
  compact?: boolean;
  /**
   * 프롬프트 예산 프로필
   * - full: 스킬 툴팁 전문 + 후보 목록 전체 (CLI 기본, 약 8.9k 토큰)
   * - compact: 툴팁 상세 제거, 룬은 이름만 (약 6.2k 토큰)
   * - web: web-llm 4k 컨텍스트용. 후보 목록·룬 목록·공식 팁 제거하고 결론만 남긴다
   */
  profile?: PromptProfile;
}

export type PromptProfile = "full" | "compact" | "web";

export function resolveProfile(ctx: MatchupContext): PromptProfile {
  return ctx.profile ?? (ctx.compact ? "compact" : "full");
}

export const SYSTEM_PROMPT_KO = `당신은 리그 오브 레전드 상성 코치입니다. 한국어로만 답합니다.

규칙:
1. 제공된 자료 안의 사실(스탯 등급, 계수, 스킬 효과, 아이템/룬/소환사 주문 목록, 지식 카드, 검증 팁)만 근거로 삼습니다. 자료에 없는 아이템·룬·스킬 이름이나 수치를 만들어내지 마십시오.
2. [권장안 초안]이 주어지면 항목별 선택은 이미 정해진 것입니다. 그 이름을 그대로 쓰고 왜 좋은지 이유만 서술하십시오. 목록에 없는 대안을 새로 제시하지 마십시오.
3. [지식 카드]와 [검증 팁]은 사람이 확인한 정보이므로 최우선으로 반영합니다. 콤보와 라인 운영은 반드시 지식 카드의 표현을 따릅니다.
4. [자동 결론]은 데이터에서 계산된 사실이므로 그대로 반영하고, 왜 그 선택이 좋은지 한 문장씩 이유를 붙입니다.
5. 자료에 근거가 없는 항목은 "자료에 근거 없음"이라고 적고 추측을 사실처럼 쓰지 않습니다.
6. 스킬을 지목할 때는 자료에 적힌 슬롯 문자(P, Q, W, E, R)와 스킬 이름을 함께 씁니다. 슬롯을 숫자로 바꾸지 마십시오.
7. 출력 형식(아래 소제목을 그대로, 순서대로 사용):
   ## 상성 한 줄 요약
   (한 문장. 누가 유리한 구도인지와 그 이유. [권장안 초안]에 "상성 판정"이 있으면 그 판정을 따르고 뒤집지 마십시오)
   ## 라인전 구도
   (2~4문장. 서로의 사거리·쿨타임·힘의 구간을 근거로 언제 강하고 언제 약한지)
   ## 시작 아이템
   ## 첫 아이템
   ## 최종 아이템
   ## 룬
   ## 소환사 주문
   ## 조심할 스킬
   (상대 스킬을 슬롯과 이름으로 지목하고 왜 위험한지)
   ## 콤보와 플레이 팁
   (지식 카드의 콤보를 스킬 순서 그대로 적고, 딜 교환 요령을 덧붙임)`;

const CC_EFFECTS = new Set(["기절", "에어본", "침묵", "속박", "도발", "매혹", "공포", "억제", "강제 이동(넉백/끌기)"]);

/**
 * 상대 스킬의 위험도 순위를 계산한다.
 *
 * 소형 모델은 "무엇이 가장 위험한가" 를 실행마다 다르게 고른다.
 * 순위 자체는 효과 태그로 결정할 수 있으므로 코드가 정하고 모델은 이유만 서술한다.
 */
const THREAT_WEIGHT: Array<[string, number, string]> = [
  ["적 마법 저항력 감소", 100, "내 마법 저항력 아이템 효과를 깎아 방어 자체를 무력화한다"],
  ["적 방어력 감소", 95, "내 방어력 아이템 효과를 깎아 방어 자체를 무력화한다"],
  ["공격 무효화", 90, "내 핵심 스킬을 통째로 무효화하고 반격까지 나온다"],
  ["피해 면역", 80, "내 피해가 들어가지 않는 구간을 만든다"],
  ["억제", 78, "긴 시간 아무것도 할 수 없게 만든다"],
  ["기절", 70, "행동 불가로 이어져 콤보를 전부 받게 된다"],
  ["속박", 66, "이동 불가로 이탈이 막힌다"],
  ["에어본", 64, "행동 불가로 이어진다"],
  ["도발", 62, "조작을 빼앗긴다"],
  ["매혹", 62, "조작을 빼앗긴다"],
  ["공포", 60, "조작을 빼앗긴다"],
  ["침묵", 58, "스킬을 봉인한다"],
  ["강제 이동(넉백/끌기)", 56, "원치 않는 위치로 끌려간다"],
  ["처형", 54, "체력이 낮으면 즉시 죽는다"],
  ["고정 피해", 50, "방어력과 마법 저항력으로 줄일 수 없다"],
  ["최대 체력 비례 피해", 46, "체력을 올려도 피해가 함께 커진다"],
  ["치유 감소", 42, "내 회복 수단을 무력화한다"],
  ["둔화", 30, "거리 조절을 방해한다"],
  ["광역", 20, "여러 명이 함께 맞는다"],
];

export interface ThreatRank {
  slot: string;
  name: string;
  score: number;
  reasons: string[];
}

export function deriveThreatOrder(enemy: ChampionCard, limit = 3): ThreatRank[] {
  const ranked: ThreatRank[] = enemy.spells.map((spell) => {
    let score = 0;
    const reasons: string[] = [];
    for (const [tag, weight, why] of THREAT_WEIGHT) {
      if (spell.effects.includes(tag)) {
        score += weight;
        reasons.push(`${tag}: ${why}`);
      }
    }
    // 궁극기는 쿨타임이 길어 상시 위험은 아니지만 한 번의 파괴력이 크다
    if (spell.slot === "R") score += 10;
    return { slot: spell.slot, name: spell.name, score, reasons };
  });
  return ranked
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function threatOrderToText(ranks: ThreatRank[]): string {
  return ranks
    .map((r, i) => `${i + 1}순위 ${r.slot} ${r.name} — ${r.reasons.slice(0, 2).join(" / ")}`)
    .join("\n");
}

/**
 * 데이터만으로 확정되는 결론을 코드에서 미리 문장으로 만든다.
 * 소형 모델은 사실 → 결론 추론이 약하므로, 결론까지 계산해 주고 모델은 서술만 맡긴다.
 */
export function deriveConclusions(ctx: MatchupContext): string[] {
  const out: string[] = [];
  const { me, enemy, items } = ctx;
  const primary = enemy.damageProfile.primary;
  const focusLabel = items.focus
    .map((f) => (f === "MAGIC_RESIST" ? "마법 저항력" : "방어력"))
    .join("과 ");

  out.push(
    primary === "혼합"
      ? `상대 ${enemy.name}의 피해 유형은 혼합이지만 계수 프로필이 ${enemy.scalingProfile.primary}이므로 내가 우선 올릴 방어 스탯은 ${focusLabel}이다.`
      : `상대 ${enemy.name}의 주 피해 유형은 ${primary}이므로 내가 우선 올릴 방어 스탯은 ${focusLabel}이다.`,
  );
  const trueDamageSpells = enemy.spells.filter((s) => s.damageTypes.includes("고정"));
  if (trueDamageSpells.length) {
    out.push(
      `상대는 고정 피해 스킬(${trueDamageSpells.map((s) => `${s.slot} ${s.name}`).join(", ")})을 갖고 있어 방어력·마법 저항력으로 줄일 수 없다. 체력과 회복, 거리 유지가 대응 수단이다.`,
    );
  }

  const needLabel = (grade: string) =>
    grade === "매우 낮음" || grade === "낮음" ? "높다" : grade === "보통" ? "보통이다" : "낮다";
  if (items.focus.includes("MAGIC_RESIST")) {
    const s = me.stats.magicResist;
    out.push(
      `내 마법 저항력은 1레벨 ${s.lv1}로 전체 챔피언 중 "${s.gradeLv1}" 등급이다. 따라서 마법 저항력 보강 필요도는 ${needLabel(s.gradeLv1)}.`,
    );
  }
  if (items.focus.includes("ARMOR")) {
    const s = me.stats.armor;
    out.push(
      `내 방어력은 1레벨 ${s.lv1}로 전체 챔피언 중 "${s.gradeLv1}" 등급이다. 따라서 방어력 보강 필요도는 ${needLabel(s.gradeLv1)}.`,
    );
  }

  const focusStarters = items.starters.filter((it) =>
    items.focus.some((f) => it.stats.includes(f === "MAGIC_RESIST" ? "마법 저항력" : "방어력")),
  );
  out.push(
    focusStarters.length
      ? `시작 아이템 후보 중 ${focusLabel}을 주는 것은 ${focusStarters.map((i) => i.name).join(", ")}뿐이다.`
      : `시작 아이템 후보 중 ${focusLabel}을 주는 것은 없다.`,
  );
  if (items.boots.length) {
    out.push(`${focusLabel}을 주는 장화: ${items.boots.map((i) => i.name).join(", ")}.`);
  }
  if (items.components.length) {
    out.push(`${focusLabel} 초반 하위 아이템: ${items.components.map((i) => `${i.name}(${i.priceTotal}G)`).join(", ")}.`);
  }

  for (const sp of enemy.spells) {
    if (sp.effects.includes("적 마법 저항력 감소")) {
      out.push(`상대 ${sp.slot} ${sp.name}은(는) 내 마법 저항력을 깎는다. 마법 저항력 아이템 효과가 줄어드므로 회피 우선순위가 가장 높다.`);
    }
    if (sp.effects.includes("적 방어력 감소")) {
      out.push(`상대 ${sp.slot} ${sp.name}은(는) 내 방어력을 깎는다. 회피 우선순위가 높다.`);
    }
  }
  const cc = enemy.spells.filter((sp) => sp.effects.some((e) => CC_EFFECTS.has(e)));
  if (cc.length) {
    out.push(
      `상대 군중 제어 스킬: ${cc.map((sp) => `${sp.slot} ${sp.name}(${sp.effects.filter((e) => CC_EFFECTS.has(e)).join("/")})`).join(", ")}.`,
    );
  } else {
    out.push("상대에게 기절/속박/에어본 류 군중 제어 스킬이 없다.");
  }
  if (enemy.mechanics.includes("보호막")) out.push("상대는 보호막 스킬을 갖고 있어 짧은 교환 시 보호막이 빠진 직후를 노리는 것이 유리하다.");
  if (enemy.mechanics.includes("회복")) {
    out.push(
      items.antiHeal.length
        ? `상대는 회복 스킬을 갖고 있어 장기전 지속력이 좋다. 치유 감소 아이템 후보: ${items.antiHeal.map((i) => i.name).join(", ")}.`
        : "상대는 회복 스킬을 갖고 있어 장기전 지속력이 좋다.",
    );
  }
  if (enemy.mechanics.includes("피해 면역")) {
    out.push("상대에게 피해를 무시하는 스킬이 있어, 내 핵심 피해 스킬을 그 스킬이 빠진 뒤에 쓰는 것이 중요하다.");
  }
  if (!enemy.mechanics.includes("이동기")) out.push("상대는 이동기가 없어 접근하면 이탈이 어렵다.");
  if (me.mechanics.includes("이동기") && enemy.rangeType === "원거리") {
    out.push("나는 근접, 상대는 원거리이므로 이동기로 접근하는 타이밍이 교전의 핵심이다.");
  }

  // 계수 프로필 → 상대가 어떤 능력치로 성장하는지
  out.push(
    `상대 계수 프로필은 ${enemy.scalingProfile.primary}이고 내 계수 프로필은 ${me.scalingProfile.primary}이다.`,
  );

  // 교전 창: 서로의 핵심 스킬 쿨타임 비교 (1랭크 기준)
  const longest = (card: typeof me) =>
    card.spells
      .filter((s) => s.slot !== "P" && s.slot !== "R" && typeof s.cooldownRank1 === "number")
      .sort((a, b) => (b.cooldownRank1 ?? 0) - (a.cooldownRank1 ?? 0))[0];
  const myKey = longest(me);
  const enemyKey = longest(enemy);
  if (myKey?.cooldownRank1 && enemyKey?.cooldownRank1) {
    out.push(
      `내 최장 기본 스킬 쿨타임은 ${myKey.slot} ${myKey.name} ${myKey.cooldownRank1}초, 상대는 ${enemyKey.slot} ${enemyKey.name} ${enemyKey.cooldownRank1}초다(1레벨 기준). 쿨타임이 긴 쪽이 스킬을 헛치면 그 시간이 상대의 교전 창이 된다.`,
    );
  }
  const rangeGap = enemy.attackRange - me.attackRange;
  if (Math.abs(rangeGap) >= 50) {
    out.push(
      rangeGap > 0
        ? `상대 기본 공격 사거리가 내 것보다 ${rangeGap} 길어 평타 견제에서 불리하다.`
        : `내 기본 공격 사거리가 상대보다 ${-rangeGap} 길어 평타 견제에서 유리하다.`,
    );
  }
  return out;
}

/**
 * 지식 카드의 구조화된 참조(refs)와 데이터 후보로 항목별 권장안 초안을 만든다.
 *
 * 소형 모델은 후보 목록에서 스스로 고르는 데 약해 엉뚱한 아이템을 집는다.
 * 골라 주는 것은 코드가 하고 모델은 이유 서술만 맡긴다.
 */
export function deriveRecommendation(ctx: MatchupContext): string[] {
  const entries = [...(ctx.playbook?.mine ?? []), ...(ctx.playbook?.vsEnemy ?? [])];
  const avoided = new Set(
    entries.flatMap((e) => [...(e.avoid?.items ?? []), ...(e.avoid?.runes ?? []), ...(e.avoid?.summoners ?? [])]),
  );
  for (const tip of ctx.tips) {
    for (const name of [...(tip.avoid?.items ?? []), ...(tip.avoid?.runes ?? []), ...(tip.avoid?.summoners ?? [])]) {
      avoided.add(name);
    }
  }
  const byCategory = (category: string, key: "items" | "runes" | "summoners") =>
    Array.from(
      new Set(entries.filter((e) => e.category === category).flatMap((e) => e.refs?.[key] ?? [])),
    ).filter((name) => !avoided.has(name));

  const lines: string[] = [];
  const push = (label: string, names: string[]) => {
    if (names.length) lines.push(`${label}: ${names.join(", ")}`);
  };

  // 팁(상성 한정 지식)이 지목한 이름은 플레이북보다 우선한다
  const tipsByCategory = (categories: string[], key: "items" | "runes" | "summoners") =>
    Array.from(
      new Set(ctx.tips.filter((t) => categories.includes(t.category)).flatMap((t) => t.refs?.[key] ?? [])),
    ).filter((name) => !avoided.has(name));

  const merge = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));

  // 상성 판정은 데이터로 도출할 수 없으므로 사람이 쓴 verdict 팁을 그대로 쓴다
  const verdicts = ctx.tips.filter((t) => t.category === "verdict");
  for (const v of verdicts) lines.push(`상성 판정: ${v.text}`);

  push("시작 아이템", merge(tipsByCategory(["item", "start-item"], "items"), byCategory("start-item", "items")));
  const boots = ctx.items.boots[0]?.name;
  const firstItems = [
    ...byCategory("first-item", "items"),
    ...byCategory("situational-item", "items"),
    ...(boots ? [boots] : []),
  ];
  push(
    "첫 아이템 후보",
    merge(tipsByCategory(["build-order"], "items"), Array.from(new Set(firstItems))),
  );
  push("코어 아이템", byCategory("core-item", "items"));
  push("룬", merge(tipsByCategory(["rune"], "runes"), byCategory("rune", "runes")));
  push("소환사 주문", merge(tipsByCategory(["summoner"], "summoners"), byCategory("summoner", "summoners")));
  if (ctx.items.antiHeal.length && ctx.enemy.mechanics.includes("회복")) {
    lines.push(`치유 감소: ${ctx.items.antiHeal[0].name}`);
  }
  return lines;
}

export function buildUserPrompt(ctx: MatchupContext): string {
  const profile = resolveProfile(ctx);
  const cardOpts =
    profile === "full"
      ? { includeSpellText: true, spellTextMax: 380 }
      : profile === "compact"
        ? { includeSpellText: false }
        : { includeSpellText: false, spellDetail: "meta" as const };
  const laneLabel = ctx.lane ? ` (${laneLabelKo(ctx.lane)} 라인)` : "";

  const sections: string[] = [];
  sections.push(`[패치] ${ctx.patch}`);
  sections.push(`[내 챔피언]\n${championCardToText(ctx.me, cardOpts)}`);
  sections.push(`[상대 챔피언]\n${championCardToText(ctx.enemy, cardOpts)}`);
  sections.push(
    `[자동 결론 — 위 데이터에서 계산된 사실, 그대로 반영하십시오]\n${deriveConclusions(ctx)
      .map((c) => `- ${c}`)
      .join("\n")}`,
  );
  if (profile === "web") {
    // 항목별 선택은 [권장안 초안]이 이미 정했으므로 후보 목록은 싣지 않는다.
    // 장화와 치유 감소만 대안으로 남긴다.
    const extras: string[] = [];
    if (ctx.items.boots.length) extras.push(`장화 대안: ${ctx.items.boots.map((b) => b.name).join(", ")}`);
    if (ctx.items.antiHeal.length)
      extras.push(`치유 감소 대안: ${ctx.items.antiHeal.slice(0, 2).map((b) => b.name).join(", ")}`);
    if (extras.length) sections.push(`[아이템 대안]\n${extras.join("\n")}`);
  } else {
    sections.push(`[아이템 후보 — 이 목록 안에서만 고르십시오]\n${itemSelectionToText(ctx.items)}`);
    if (profile === "full") {
      sections.push(`[핵심 룬 후보]\n${keystonesToText(ctx.keystones)}`);
    } else {
      sections.push(`[핵심 룬 후보] ${ctx.keystones.map((k) => `${k.name}[${k.path}]`).join(", ")}`);
    }
    sections.push(`[소환사 주문 후보] ${summonersToText(ctx.summoners)}`);
  }
  if (ctx.playbook && (ctx.playbook.mine.length || ctx.playbook.vsEnemy.length)) {
    // web 프로필에서는 이름 선택(룬·아이템) 항목을 권장안 초안이 대신하므로 서술형 지식만 남긴다
    const NARRATIVE = new Set(["combo", "phase", "laning", "teamfight", "skill"]);
    const selected =
      profile === "web"
        ? {
            mine: ctx.playbook.mine.filter((e) => NARRATIVE.has(e.category)),
            vsEnemy: ctx.playbook.vsEnemy.filter((e) => NARRATIVE.has(e.category)),
          }
        : ctx.playbook;
    sections.push(
      `[지식 카드 — 사람이 검증한 콤보/운영, 최우선 반영]\n${playbookToText(selected, ctx.me.name, ctx.enemy.name, ctx.patch)}`,
    );
  }
  sections.push(`[검증 팁]\n${tipsToText(ctx.tips, ctx.patch)}`);
  sections.push(
    `[조심할 스킬 우선순위 — 이 순서를 따르십시오]\n${threatOrderToText(deriveThreatOrder(ctx.enemy))}`,
  );
  const recommendation = deriveRecommendation(ctx);
  if (recommendation.length) {
    sections.push(
      `[권장안 초안 — 항목별 선택은 이미 정해졌습니다. 이 이름을 그대로 쓰고 이유만 서술하십시오]\n${recommendation
        .map((r) => `- ${r}`)
        .join("\n")}`,
    );
  }
  sections.push(
    `[질문] 내가 ${ctx.me.name}${laneLabel}으로 ${ctx.enemy.name}을(를) 상대합니다. 위 자료를 근거로 형식에 맞춰 조언해 주십시오.`,
  );
  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// 분할 호출 (web-llm 4k 컨텍스트 대응)
//
// 한 번에 모든 소제목을 요구하면 프롬프트가 컨텍스트 상한에 붙는다.
// 산출물을 성질에 따라 나눈다.
//  - 확정 구간(상성 판정, 아이템/룬/주문 이름): 코드가 이미 정했으므로 LLM 없이 그대로 렌더링한다.
//  - 서술 구간: 두 번의 짧은 호출로 나눈다. 필요한 자료만 실어 프롬프트를 절반 이하로 줄인다.
// ---------------------------------------------------------------------------

export interface PromptSection {
  id: "build-reasons" | "laning";
  /** 화면 소제목 */
  title: string;
  messages: ChatMessage[];
}

const SYSTEM_SPLIT_KO = `당신은 리그 오브 레전드 상성 코치입니다. 한국어로만 답합니다.

규칙:
1. 제공된 자료 안의 사실만 근거로 삼습니다. 자료에 없는 아이템·룬·스킬 이름이나 수치를 만들지 마십시오.
2. 선택은 이미 정해져 있습니다. 이름을 바꾸거나 대안을 새로 제시하지 말고 이유만 서술하십시오.
3. 스킬은 자료에 적힌 슬롯 문자(P, Q, W, E, R)와 이름을 함께 씁니다.
4. 요청받은 소제목만 출력하고 다른 소제목은 만들지 마십시오.`;

/** 확정 구간 — LLM 을 쓰지 않고 코드가 렌더링하는 부분 */
export function renderDecidedSections(ctx: MatchupContext): string {
  const lines: string[] = [];
  const verdict = ctx.tips.find((t) => t.category === "verdict");
  if (verdict) lines.push(`## 상성 한 줄 요약\n${verdict.text}`);
  // 프롬프트용 라벨을 화면용 소제목으로 바꾼다
  const TITLE: Record<string, string> = {
    "시작 아이템": "시작 아이템",
    "첫 아이템 후보": "첫 아이템",
    "코어 아이템": "최종 아이템",
    룬: "룬",
    "소환사 주문": "소환사 주문",
    "치유 감소": "치유 감소 아이템",
  };
  for (const row of deriveRecommendation(ctx)) {
    if (row.startsWith("상성 판정:")) continue;
    const sep = row.indexOf(": ");
    if (sep < 0) continue;
    const label = row.slice(0, sep);
    const value = row.slice(sep + 2);
    lines.push(`## ${TITLE[label] ?? label}\n${value}`);
  }
  return lines.join("\n\n");
}

export function buildSections(ctx: MatchupContext): PromptSection[] {
  const NARRATIVE = new Set(["combo", "phase", "laning", "teamfight", "skill"]);
  const pick = (categories: Set<string>, invert = false) => ({
    mine: (ctx.playbook?.mine ?? []).filter((e) => categories.has(e.category) !== invert),
    vsEnemy: (ctx.playbook?.vsEnemy ?? []).filter((e) => categories.has(e.category) !== invert),
  });

  // 1) 빌드 이유: 권장안 + 스탯/계수 결론만. 스킬 툴팁은 싣지 않는다.
  const statLines = deriveConclusions(ctx).filter(
    (line) => !line.startsWith("상대 군중 제어") && !line.includes("최장 기본 스킬"),
  );
  const buildKnowledge = pick(NARRATIVE, true);
  const buildPrompt = [
    `[패치] ${ctx.patch}`,
    `[구도] 내가 ${ctx.me.name}${ctx.lane ? ` (${laneLabelKo(ctx.lane)} 라인)` : ""}으로 ${ctx.enemy.name}을(를) 상대합니다.`,
    `[근거 사실]\n${statLines.map((l) => `- ${l}`).join("\n")}`,
    `[확정된 선택]\n${deriveRecommendation(ctx)
      .map((r) => `- ${r}`)
      .join("\n")}`,
    buildKnowledge.mine.length || buildKnowledge.vsEnemy.length
      ? `[지식 카드]\n${playbookToText(buildKnowledge, ctx.me.name, ctx.enemy.name, ctx.patch)}`
      : "",
    `[요청] 확정된 선택의 이유만 아래 형식으로 쓰십시오. 이름 목록은 이미 화면에 표시되므로 다시 나열하지 마십시오.
- 시작 아이템: <이유 1~2문장>
- 첫 아이템: <이유 1~2문장>
- 최종 아이템: <이유 1~2문장>
- 룬: <이유 1~2문장>
- 소환사 주문: <이유 1~2문장>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  // 2) 라인전과 콤보: 스킬 메타와 서술형 지식만.
  const cardOpts = { includeSpellText: false, spellDetail: "meta" as const };
  const laneKnowledge = pick(NARRATIVE);
  const lanePrompt = [
    `[패치] ${ctx.patch}`,
    `[내 챔피언]\n${championCardToText(ctx.me, cardOpts)}`,
    `[상대 챔피언]\n${championCardToText(ctx.enemy, cardOpts)}`,
    `[근거 사실]\n${deriveConclusions(ctx)
      .filter((l) => l.includes("군중 제어") || l.includes("최장 기본 스킬") || l.includes("고정 피해") || l.includes("사거리"))
      .map((l) => `- ${l}`)
      .join("\n")}`,
    `[조심할 스킬 우선순위 — 이 순서와 이유를 그대로 쓰십시오]\n${threatOrderToText(deriveThreatOrder(ctx.enemy))}`,
    `[지식 카드 — 표현을 그대로 따르십시오]\n${playbookToText(laneKnowledge, ctx.me.name, ctx.enemy.name, ctx.patch)}`,
    ctx.tips.filter((t) => t.category !== "verdict").length
      ? `[검증 팁]\n${tipsToText(
          ctx.tips.filter((t) => t.category !== "verdict"),
          ctx.patch,
        )}`
      : "",
    `[요청] 아래 소제목으로만 답하십시오.
## 라인전 구도
(2~4문장. 레벨 구간, 쿨타임, 사거리를 근거로 언제 강하고 언제 약한지)
## 조심할 스킬
(상대 스킬 중 가장 위험한 것부터 슬롯과 이름으로 지목하고 이유를 문장으로 풀어 씁니다. "1순위" 같은 내부 표기를 그대로 복사하지 마십시오)
## 콤보와 플레이 팁
(지식 카드의 콤보를 스킬 순서 그대로 적고 딜 교환 요령을 덧붙임)`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    {
      id: "build-reasons",
      title: "선택 이유",
      messages: [
        { role: "system", content: SYSTEM_SPLIT_KO },
        { role: "user", content: buildPrompt },
      ],
    },
    {
      id: "laning",
      title: "라인전",
      messages: [
        { role: "system", content: SYSTEM_SPLIT_KO },
        { role: "user", content: lanePrompt },
      ],
    },
  ];
}

/**
 * 연속 대화(chain) 방식
 *
 * 분할 호출은 자료를 두 번 실어 보내므로 prefill 을 두 번 낸다.
 * 같은 대화를 이어가면 첫 턴의 KV 캐시가 남아 두 번째 턴은 질문 문장만 prefill 한다.
 * 대신 컨텍스트에 첫 턴 답변이 누적되므로 4k 예산에서는 출력 길이를 관리해야 한다.
 */
export interface ChainTurn {
  id: "build-reasons" | "laning";
  title: string;
  /** 이 턴에서 새로 추가되는 user 메시지 */
  user: string;
}

export function buildChain(ctx: MatchupContext): { system: string; turns: ChainTurn[] } {
  const cardOpts = { includeSpellText: false, spellDetail: "meta" as const };

  const shared = [
    `[패치] ${ctx.patch}`,
    `[구도] 내가 ${ctx.me.name}${ctx.lane ? ` (${laneLabelKo(ctx.lane)} 라인)` : ""}으로 ${ctx.enemy.name}을(를) 상대합니다.`,
    `[내 챔피언]\n${championCardToText(ctx.me, cardOpts)}`,
    `[상대 챔피언]\n${championCardToText(ctx.enemy, cardOpts)}`,
    `[근거 사실]\n${deriveConclusions(ctx)
      .map((l) => `- ${l}`)
      .join("\n")}`,
    `[조심할 스킬 우선순위 — 이 순서와 이유를 그대로 쓰십시오]\n${threatOrderToText(deriveThreatOrder(ctx.enemy))}`,
    `[확정된 선택]\n${deriveRecommendation(ctx)
      .map((r) => `- ${r}`)
      .join("\n")}`,
    ctx.playbook
      ? `[지식 카드 — 표현을 그대로 따르십시오]\n${playbookToText(ctx.playbook, ctx.me.name, ctx.enemy.name, ctx.patch)}`
      : "",
    ctx.tips.filter((t) => t.category !== "verdict").length
      ? `[검증 팁]\n${tipsToText(
          ctx.tips.filter((t) => t.category !== "verdict"),
          ctx.patch,
        )}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    system: SYSTEM_SPLIT_KO,
    turns: [
      {
        id: "build-reasons",
        title: "선택 이유",
        user: `${shared}

[요청] 확정된 선택의 이유만 아래 형식으로 쓰십시오. 이름 목록은 이미 화면에 표시되므로 다시 나열하지 마십시오.
- 시작 아이템: <이유 1~2문장>
- 첫 아이템: <이유 1~2문장>
- 최종 아이템: <이유 1~2문장>
- 룬: <이유 1~2문장>
- 소환사 주문: <이유 1~2문장>`,
      },
      {
        id: "laning",
        title: "라인전",
        // 자료는 위 대화에 이미 있으므로 질문만 보낸다 (KV 캐시 재사용)
        user: `이어서 위 자료만 근거로 아래 소제목으로 답하십시오. 자료를 다시 요약하지 마십시오.
## 라인전 구도
(2~4문장. 레벨 구간, 쿨타임, 사거리를 근거로 언제 강하고 언제 약한지)
## 조심할 스킬
(우선순위 순서대로 슬롯과 이름을 지목하고 이유를 문장으로 풀어 씁니다. "1순위" 같은 내부 표기를 그대로 복사하지 마십시오)
## 콤보와 플레이 팁
(지식 카드의 콤보를 스킬 순서 그대로 적고 딜 교환 요령을 덧붙임)`,
      },
    ],
  };
}

export function buildMessages(ctx: MatchupContext): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT_KO },
    { role: "user", content: buildUserPrompt(ctx) },
  ];
}

export function laneLabelKo(lane: string): string {
  const map: Record<string, string> = {
    top: "탑",
    jungle: "정글",
    mid: "미드",
    bot: "바텀",
    adc: "바텀",
    support: "서포터",
    sup: "서포터",
  };
  return map[lane] ?? lane;
}
