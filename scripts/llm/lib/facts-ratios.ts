import type { ChampionAbility } from "../../../src/lib/knowledge/sourceRecords";
import type { ScalingProfile, SpellFact } from "./facts";
import { round } from "./text";

/** "(105% 주문력)", "(50% 추가 공격력)", "최대 체력의 8%" 같은 계수 표기를 스탯별 최대값으로 수집 */
const RATIO_STATS =
  "주문력|추가 공격력|공격력|총 공격력|추가 체력|최대 체력|체력|추가 방어력|방어력|추가 마법 저항력|마법 저항력|추가 공격 속도";
const RATIO_PAREN_RE = new RegExp(`\\((\\d+(?:\\.\\d+)?)% (${RATIO_STATS})\\)`, "g");
const RATIO_MAXHP_RE = /(?:최대|추가) 체력의 ([\d./]+)%/g;

export function detectRatios(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of text.matchAll(RATIO_PAREN_RE)) {
    const value = Number(m[1]);
    const stat = m[2];
    out[stat] = Math.max(out[stat] ?? 0, value);
  }
  for (const m of text.matchAll(RATIO_MAXHP_RE)) {
    // "6/6.5/7/7.5/8" → 최대 랭크 값
    const parts = m[1].split("/").map(Number).filter((n) => !Number.isNaN(n));
    if (parts.length) out["최대 체력"] = Math.max(out["최대 체력"] ?? 0, parts[parts.length - 1]);
  }
  return out;
}

/**
 * 시뮬레이션 항(structured terms)에서 계수를 뽑는다.
 * 툴팁 정규식보다 정확하므로 값이 있으면 이쪽을 우선한다.
 */
const SIM_STAT_LABEL: Record<string, string> = {
  abilityPower: "주문력",
  bonusAttackDamage: "추가 공격력",
  totalAttackDamage: "공격력",
  bonusHealth: "추가 체력",
  maxHealth: "최대 체력",
  bonusArmor: "추가 방어력",
  armor: "방어력",
  bonusMagicResist: "추가 마법 저항력",
  magicResist: "마법 저항력",
};

export function ratiosFromSimulation(ability: ChampionAbility): Record<string, number> {
  const out: Record<string, number> = {};
  const terms = ability.simulation?.primary?.terms ?? [];
  for (const term of terms) {
    const label = SIM_STAT_LABEL[term.stat];
    if (!label) continue;
    const values = term.coefficientsByRankAndLevel?.flat() ??
      term.coefficientsByLevel ??
      term.coefficientsByRank ??
      [];
    const max = Math.max(...values.filter((n) => Number.isFinite(n)), 0);
    if (max <= 0) continue;
    out[label] = Math.max(out[label] ?? 0, round(max * 100, 1));
  }
  return out;
}

export function buildScalingProfile(spells: SpellFact[]): ScalingProfile {
  let apSpells = 0;
  let adSpells = 0;
  let healthSpells = 0;
  for (const s of spells) {
    const keys = Object.keys(s.ratios);
    if (keys.includes("주문력")) apSpells += 1;
    if (keys.some((k) => /공격력/.test(k))) adSpells += 1;
    if (keys.some((k) => /체력/.test(k))) healthSpells += 1;
  }
  let primary: ScalingProfile["primary"] = "없음";
  if (apSpells === 0 && adSpells === 0) primary = healthSpells > 0 ? "체력" : "없음";
  else if (apSpells >= adSpells * 2) primary = "AP";
  else if (adSpells >= apSpells * 2) primary = "AD";
  else primary = "혼합";
  return { apSpells, adSpells, healthSpells, primary };
}
