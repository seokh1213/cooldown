/**
 * 사실 카드의 재료가 되는 원본 레코드 타입
 *
 * 챔피언 정적 데이터(public/data/<patch>/champions/...)와 라이엇·LoL Wiki 분류
 * 메타데이터의 모양이다. 파일을 읽는 쪽은 scripts/llm/lib/data.ts 다.
 */
import type {
  ChampionBaseStats,
  ChampionSpellSlot,
  NormalizedSpellScaling,
} from "../../types/combatNormalized";

export interface AbilityCostInfo {
  values: number[];
  resource?: string;
}

export interface AbilitySimulationTerm {
  stat: string;
  coefficientsByRank?: number[];
  coefficientsByLevel?: number[];
  coefficientsByRankAndLevel?: number[][];
}

export interface AbilitySimulation {
  status: "complete" | "unsupported" | "unavailable";
  primary?: {
    id: string;
    kind: string;
    baseByRank?: number[];
    baseByLevel?: number[];
    baseByRankAndLevel?: number[][];
    terms?: AbilitySimulationTerm[];
  };
}

export interface ChampionAbility {
  slot: ChampionSpellSlot;
  id: string;
  name: string;
  maxRank?: number;
  /** 한 줄 요약 */
  summary?: string;
  /** 상세 설명 (HTML) */
  bodyHtml?: string;
  cooldownSeconds?: number[];
  /** 충전형 스킬의 재충전 시간·최대 충전 수. 이때 cooldownSeconds 는 연속 시전 간격이다. */
  rechargeSeconds?: number[];
  maxCharges?: number;
  cost?: AbilityCostInfo;
  range?: number[];
  rankValues?: Array<{ label: string; values: string }>;
  scalings?: NormalizedSpellScaling[];
  simulation?: AbilitySimulation;
}

export interface ChampionRecord {
  id: string;
  key: string;
  name: string;
  title?: string;
  tags?: string[];
  baseStats: ChampionBaseStats;
  abilities: Partial<Record<ChampionSpellSlot, ChampionAbility>>;
}

/** 라이엇 공식 챔피언 분류 (scripts/llm/fetch-riot-meta.ts 로 수집) */
export interface RiotChampionMeta {
  id: string;
  key: number;
  name: string;
  roles: string[];
  tagPrimary?: string;
  tagSecondary?: string;
  /** kPhysical | kMagic | kMixed | kTrue */
  damageType?: string;
  /** melee | ranged */
  attackType?: string;
  difficulty?: number;
  playstyle?: {
    damage: number;
    durability: number;
    crowdControl: number;
    mobility: number;
    utility: number;
  };
}

/** LoL Wiki(Fandom) 챔피언 분류 (scripts/llm/fetch-wiki-meta.ts 로 수집) */
export interface WikiChampionMeta {
  id: string;
  key?: number;
  /** 주 클래스 (Fighter, Tank, Mage, Marksman, Assassin, Support) */
  heroType?: string;
  /** 부 클래스 */
  altType?: string;
  /** 하위 클래스 (Juggernaut, Diver, Skirmisher, Vanguard, Warden, Battlemage, Burst, Artillery, Assassin, Enchanter, Catcher, Marksman, Specialist) */
  subclasses: string[];
  rangeType?: string;
  resource?: string;
  difficulty?: number;
  /** 클라이언트 기준 포지션 (Top, Jungle, Middle, Bottom, Support) */
  positions: string[];
  externalPositions: string[];
}

/** LoL Wiki(Fandom) 아이템 상점 분류 (scripts/llm/fetch-wiki-items.ts 로 수집) */
export interface WikiItemMeta {
  id: string;
  englishName: string;
  /** 상점 역할군 탭: fighter, tank, mage, marksman, assassin, support, movement … */
  menu: string[];
  /** Legendary | Epic | Basic | Starter | Boots | Consumable | Trinket … */
  types: string[];
  itemLimit?: string;
  nicknames: string[];
}
