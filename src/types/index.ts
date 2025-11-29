export interface ChampionSkin {
  num: number;
  name: string;
}

export interface ChampionSpell {
  id: string;
  name?: string;
  maxrank: number;
  cooldown: (number | string)[];
  description?: string;
  tooltip?: string;
  leveltip?: {
    label: string[];
    effect: string[];
  };
  effectBurn?: (string | null)[];
  costBurn?: string;
  resource?: string;
  costType?: string;
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
