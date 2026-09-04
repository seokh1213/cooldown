import type { ChampionCard } from "./facts";
import type { MatchupContext } from "./prompt";

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

