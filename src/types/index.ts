import type { NormalizedSpellScaling } from "./combatNormalized";
import type { AbilitySimulation } from "@/data/contracts/championData";

export interface ChampionSkin {
  num: number;
  name: string;
  parentSkin?: number;
}

export interface ChampionSpell {
  forms?: import("@/data/contracts/championData").AbilityForm[];
  id: string;
  name?: string;
  maxrank: number;
  cooldown: (number | string)[];
  cooldownBurn?: string;
  recharge?: number[];
  maxCharges?: number;
  description?: string;
  tooltip?: string;
  summary?: string;
  tooltipSource?: "communitydragon";
  tooltipDiagnostics?: {
    unresolvedTokens: string[];
  };
  leveltip?: {
    label: string[];
    effect: string[];
  };
  effectBurn?: (string | null)[];
  cost?: (number | string)[];
  costBurn?: string;
  resource?: string;
  costType?: string;
  range?: (number | string)[];
  rangeBurn?: string;
  image?: { full: string };
  rankValues?: Array<{ label: string; values: string }>;
  scalings?: NormalizedSpellScaling[];
  conditions?: string[];
  simulation?: AbilitySimulation;
  maxammo?: string;
}

export interface ChampionPassive {
  name?: string;
  description?: string;
  /** Data Dragon의 축약 설명. description이 CDragon 상세 툴팁이면 함께 보존한다. */
  summary?: string;
  spellId?: string;
  tooltipSource?: "communitydragon";
  rankValues?: Array<{ label: string; values: string }>;
  scalings?: NormalizedSpellScaling[];
  conditions?: string[];
  simulation?: AbilitySimulation;
  tooltipDiagnostics?: {
    unresolvedTokens: string[];
  };
  image: {
    full: string;
  };
}

export interface Champion {
  name: string;
  id: string;
  key: string;
  title: string;
  ddragonVersion?: string;
  hangul?: string;
  skins?: ChampionSkin[];
  lore?: string;
  spells?: ChampionSpell[];
  passive?: ChampionPassive;
  // API에서 추가로 받을 수 있는 필드들 (타입 안정성을 위해 명시적으로 정의)
  tags?: string[];
  /**
   * 라이엇 공식 역할군. 챔피언 목록의 거르개가 쓴다.
   *
   * 클라이언트가 보여 주는 여섯 갈래다. `tags` 와 값이 겹치지만 이쪽은 정규화된
   * 소문자 열쇠라 화면이 번역표를 바로 찾을 수 있다.
   */
  roles?: string[];
  info?: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
  stats?: {
    [key: string]: number;
  };
  image?: { full: string };
}

// ===== Runes =====

export interface Rune {
  id: number;
  name: string;
  icon: string;
  /**
   * 정규화된 데이터의 tooltip(HTML)을 그대로 담는 필드
   * - ko_KR: tooltipKo
   * - en_US: tooltipEn
   */
  descriptionHtml: string;
}

export interface RuneTreeSlot {
  runes: Rune[];
}

export interface RuneTree {
  id: number;
  /**
   * 영문 트리 키 (예: Precision, Domination ...)
   * - 정렬 등에 사용
   */
  key: string;
  /**
   * 표시용 이름 (언어별 이름)
   */
  name: string;
  /**
   * DDragon 기준 아이콘 경로 (perk-images/... 형식)
   */
  icon: string;
  slots: RuneTreeSlot[];
}

export interface RuneStatShard {
  id: number;
  name: string;
  iconPath: string;
  shortDesc: string;
  longDesc: string;
}

export interface RuneStatShardRow {
  label: string;
  perks: RuneStatShard[];
}

export interface RuneStatShardGroup {
  styleId: number;
  styleName: string;
  rows: RuneStatShardRow[];
}

export interface RuneStatShardStaticData {
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  groups: RuneStatShardGroup[];
}
import type {
  DataLocale,
  StaticDataSources,
} from "@/data/contracts/staticData";
