export interface NumericSpell {
  values: Record<string, number[]>;
  calculations: Record<string, number[]>;
  cooldown?: number[];
  cost?: number[];
}

export interface NumericChampion {
  name: string;
  stats: Record<string, number>;
  spells: Record<string, NumericSpell>;
  rootSpells?: string[];
  passive?: string;
  attackDamagePerLevel?: number;
}

export interface ChampionCatalogEntry {
  name: string;
  stats: Record<string, number>;
  passive: { name: string };
  spells: Array<{ name: string; maxrank: number; cooldown: number[]; cost: number[] }>;
}

export interface ItemCatalogEntry {
  name: string;
  maps?: Record<string, boolean>;
  gold: { purchasable: boolean; total: number };
  inStore?: boolean;
  stats: Record<string, number>;
}
