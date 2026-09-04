export interface ChampionSkin {
  num: number;
  name: string;
}

export interface ChampionSpell {
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
  maxammo?: string;
}

export interface ChampionPassive {
  name?: string;
  description?: string;
  /** Data Dragon의 축약 설명. description이 CDragon 상세 툴팁이면 함께 보존한다. */
  summary?: string;
  spellId?: string;
  tooltipSource?: "communitydragon";
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
  spells?: ChampionSpell[];
  passive?: ChampionPassive;
  // API에서 추가로 받을 수 있는 필드들 (타입 안정성을 위해 명시적으로 정의)
  tags?: string[];
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
