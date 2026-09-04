import type { DataLocale, StaticDataIdentity } from "@/data/contracts/staticData";
import { toRuneStatShards, toRuneTrees } from "@/data/mappers/runeMapper";
import { gameDataRepository } from "@/data/repositories/gameDataRepository";
import type { RuneStatShardStaticData, RuneTree } from "@/types";
import type {
  NormalizedItem,
  NormalizedRune,
  NormalizedSummonerSpell,
} from "@/types/combatNormalized";

export async function getRunePageData(
  identity: StaticDataIdentity,
  locale: DataLocale
): Promise<{ trees: RuneTree[]; statShards: RuneStatShardStaticData }> {
  const data = await gameDataRepository.getRunes(identity, locale);
  return { trees: toRuneTrees(data), statShards: toRuneStatShards(data) };
}

export async function getNormalizedItems(
  identity: StaticDataIdentity,
  locale: DataLocale
): Promise<NormalizedItem[]> {
  return (await gameDataRepository.getItems(identity, locale)).items;
}

export async function getNormalizedRunes(
  identity: StaticDataIdentity,
  locale: DataLocale
): Promise<NormalizedRune[]> {
  return (await gameDataRepository.getRunes(identity, locale)).runes;
}

export async function getNormalizedSummonerSpells(
  identity: StaticDataIdentity,
  locale: DataLocale
): Promise<NormalizedSummonerSpell[]> {
  return (await gameDataRepository.getSummoners(identity, locale)).spells;
}
