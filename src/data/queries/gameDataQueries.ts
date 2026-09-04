import type { DataLocale } from "@/data/contracts/staticData";
import { toRuneStatShards, toRuneTrees } from "@/data/mappers/runeMapper";
import { gameDataRepository } from "@/data/repositories/gameDataRepository";
import type { RuneStatShardStaticData, RuneTree } from "@/types";
import type {
  NormalizedItem,
  NormalizedSummonerSpell,
} from "@/types/combatNormalized";

export async function getRunePageData(
  patchVersion: string,
  locale: DataLocale
): Promise<{ trees: RuneTree[]; statShards: RuneStatShardStaticData }> {
  const data = await gameDataRepository.getRunes(patchVersion, locale);
  return { trees: toRuneTrees(data), statShards: toRuneStatShards(data) };
}

export async function getNormalizedItems(
  patchVersion: string,
  locale: DataLocale
): Promise<NormalizedItem[]> {
  return (await gameDataRepository.getItems(patchVersion, locale)).items;
}

export async function getNormalizedSummonerSpells(
  patchVersion: string,
  locale: DataLocale
): Promise<NormalizedSummonerSpell[]> {
  return (await gameDataRepository.getSummoners(patchVersion, locale)).spells;
}
