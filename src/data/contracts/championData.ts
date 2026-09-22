import type {
  ChampionBaseStats,
  NormalizedSpellScaling,
} from "@/types/combatNormalized";
import type { StatContribution } from "@/types/combatStats";
import type { DataLocale, StaticDataSources } from "./staticData";

export type AbilitySlot = "P" | "Q" | "W" | "E" | "R";

export interface AbilityRankValue {
  label: string;
  values: string;
}

export interface AbilityResourceCost {
  values: number[];
  resource: string;
}

export type AbilitySimulationStat =
  | "abilityPower"
  | "totalAttackDamage"
  | "baseAttackDamage"
  | "bonusAttackDamage"
  | "maxHealth"
  | "bonusHealth"
  | "armor"
  | "bonusArmor"
  | "magicResist"
  | "bonusMagicResist"
  | "maxMana"
  | "bonusMana"
  | "attackSpeed"
  | "bonusAttackSpeed"
  | "moveSpeed"
  | "critChance"
  | "critDamage"
  | "bonusCritDamage"
  | "lifeSteal"
  | "lethality";

export interface AbilitySimulationTerm {
  stat: AbilitySimulationStat;
  coefficientsByRank?: number[];
  coefficientsByLevel?: number[];
  coefficientsByRankAndLevel?: number[][];
}

export interface AbilitySimulationCalculation {
  id: string;
  kind: "damage";
  damageType: "physical" | "magical" | "true" | "unknown";
  targetHealthScaling?: "max" | "current" | "missing";
  baseByRank?: number[];
  baseByLevel?: number[];
  baseByRankAndLevel?: number[][];
  terms: AbilitySimulationTerm[];
}

/** 한 값이 스킬 레벨과 챔피언 레벨 중 무엇에 따라 변하는지 압축해 담는다. */
export interface AbilitySimulationCurve {
  byRank?: number[];
  byLevel?: number[];
  byRankAndLevel?: number[][];
}

/**
 * 선형 모델(base + Σ 스탯×계수)로 접히지 않는 공식을 원본 모양 그대로 담는다.
 * 리엇 BIN 의 계산 트리를 우리가 다루는 노드로만 좁혀 옮긴 것이다.
 */
export type AbilitySimulationExpr =
  | { kind: "value"; value: AbilitySimulationCurve }
  | { kind: "stat"; stat: AbilitySimulationStat; coefficient: AbilitySimulationCurve }
  | {
      kind: "buffStacks";
      buff: string;
      coefficient: AbilitySimulationCurve;
      /** 이 중첩을 소유한 스킬. 쌓는 스킬과 쓰는 스킬이 달라 자동 추론이 안 되므로 별도로 정한다. */
      stackSource?: AbilitySlot;
    }
  | { kind: "sum"; parts: AbilitySimulationExpr[] }
  | { kind: "product"; parts: AbilitySimulationExpr[] };

export interface AbilitySimulationExpression {
  id: string;
  kind: "damage";
  damageType: "physical" | "magical" | "true" | "unknown";
  targetHealthScaling?: "max" | "current" | "missing";
  root: AbilitySimulationExpr;
  /** buffStacks 노드가 있으면 계산에 중첩 수 입력이 필요하다. */
  requiresBuffStacks: boolean;
}

export interface AbilitySimulation {
  /**
   * complete   선형으로 접힘. primary 사용.
   * expression 선형으로는 못 접지만 공식 트리는 있음. expression 사용.
   * unsupported 둘 다 실패.
   * unavailable 피해 계산 자체가 없음.
   */
  status: "complete" | "expression" | "unsupported" | "unavailable";
  primary?: AbilitySimulationCalculation;
  expression?: AbilitySimulationExpression;
  unsupportedPartTypes: string[];
}

export interface AbilityV2 {
  forms?: AbilityForm[];
  slot: AbilitySlot;
  id: string;
  name: string;
  maxRank: number;
  summary: string;
  bodyHtml: string;
  iconFile: string;
  cooldownSeconds: number[];
  rechargeSeconds?: number[];
  maxCharges?: number;
  cost?: AbilityResourceCost;
  range: number[];
  rankValues: AbilityRankValue[];
  scalings: NormalizedSpellScaling[];
  simulation: AbilitySimulation;
  conditions: string[];
  source: "communitydragon" | "ddragon";
  diagnostics: {
    unresolvedTokens: string[];
  };
}

/** Separate castable forms; keep their source identity and scaling rank explicit. */
export interface AbilityForm {
  key: "A" | "B";
  label: string;
  id: string;
  name: string;
  iconPath: string;
  iconVersion: string;
  bodyHtml: string;
  cooldownSeconds: number[];
  tooltipRankSource: AbilitySlot;
  diagnostics: { unresolvedTokens: string[] };
}

export interface ChampionDetailV2 {
  schemaVersion: 2;
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  champion: {
    id: string;
    key: string;
    name: string;
    title: string;
    tags: string[];
    baseStats: ChampionBaseStats;
    baseStatContributions: StatContribution[];
    abilities: Record<AbilitySlot, AbilityV2>;
  };
}

export interface ChampionIndexEntryV2 {
  id: string;
  key: string;
  name: string;
  title: string;
  iconFile: string;
  /**
   * 커뮤니티 위키 기준 하위 직군. 목록 화면의 거르개가 이것을 쓴다.
   *
   * 라이엇의 `tags` 는 여섯 갈래(Fighter/Mage/Tank…)뿐이라 "가렌과 야스오가
   * 같은 Fighter" 가 된다. 실제로 쓰는 말과 맞지 않는다. Fandom 위키는
   * Juggernaut·Diver·Skirmisher 처럼 열넷으로 갈라 두었고, 나서스는
   * Juggernaut, 야스오는 Skirmisher 다.
   *
   * 한 챔피언이 둘 이상에 걸치기도 한다(오로라 = Mage + Assassin). 위키에
   * 아직 안 올라온 새 챔피언은 비어 있다.
   *
   * 출처: League of Legends Wiki (Fandom) Module:ChampionData/data — CC BY-SA
   */
  subclasses?: string[];
  /** 위키 기준 주 포지션(Top, Jungle, Middle, Bottom, Support). */
  positions?: string[];
}

export interface ChampionIndexV2 {
  schemaVersion: 2;
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  champions: ChampionIndexEntryV2[];
}
