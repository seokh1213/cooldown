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
  description?: string;
  tooltip?: string;
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
}

export interface ChampionPassive {
  name?: string;
  description?: string;
  image: {
    full: string;
  };
}

export interface Champion {
  name: string;
  id: string;
  key: string;
  title: string;
  version?: string;
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
}

// ===== Runes (Runes Reforged) =====

export interface Rune {
  id: number;
  key: string;
  icon: string;
  name: string;
  shortDesc: string;
  longDesc: string;
}

export interface RuneSlot {
  runes: Rune[];
}

export interface RuneTree {
  id: number;
  key: string;
  icon: string;
  name: string;
  slots: RuneSlot[];
}

// Data Dragon runesReforged.json 전체는 RuneTree[] 형태
export type RuneTreeList = RuneTree[];

// ===== Items =====

export interface ItemGold {
  base: number;
  total: number;
  sell: number;
  purchasable: boolean;
}

export interface ItemStatsMap {
  // Data Dragon item.json 의 stats 필드를 그대로 유지 (FlatHPPoolMod 등)
  [statKey: string]: number;
}

export interface ItemData {
  name: string;
  description: string;
  plaintext?: string;
  colloq?: string;
  into?: string[];
  from?: string[];
  tags?: string[];
  maps?: Record<string, boolean>;
  gold: ItemGold;
  stats: ItemStatsMap;
  // 상점 노출 여부 (true/undefined: 상점에 보임, false: 상점에서 직접 구매 불가인 퀘스트/업그레이드 전용 등)
  inStore?: boolean;
}

export interface ItemMap {
  [id: string]: ItemData;
}

export interface ItemList {
  type: string;
  version: string;
  data: ItemMap;
}

// UI에서 다루기 편하게 ID를 포함한 아이템 타입
export interface Item extends ItemData {
  id: string;
}

