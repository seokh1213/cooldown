import type { CommunityDragonSpellData } from "../../../../src/domain/game/tooltip/contracts";
import type { Champion } from "../../../../src/domain/game/types";
import type { DataLocale } from "../tooltip/localization";

export type ChampionById = ReadonlyMap<string, Champion>;

export type ChampionsByLocale = ReadonlyMap<DataLocale, ChampionById>;

export type ChampionSpellData = Readonly<
  Record<string, CommunityDragonSpellData>
>;

export type SpellDataByChampion = ReadonlyMap<string, ChampionSpellData>;

export function requireMapValue<K, V>(
  values: ReadonlyMap<K, V>,
  key: K,
  description: string,
): V {
  const value = values.get(key);
  if (value === undefined) throw new Error(`Missing ${description}: ${String(key)}`);
  return value;
}
