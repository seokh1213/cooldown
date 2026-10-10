import type { DataLocale, StaticDataIdentity } from "@/domain/game/contracts/staticData";
import { toRuneStatShards, toRuneTrees } from "@/infrastructure/mappers/runeMapper";
import { gameDataRepository } from "@/infrastructure/repositories/gameDataRepository";
import type { RuneStatShardStaticData, RuneTree } from "@/domain/game/types";
import type {
  NormalizedItem,
  NormalizedSummonerSpell,
} from "@/domain/game/types/combatNormalized";

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

export async function getNormalizedSummonerSpells(
  identity: StaticDataIdentity,
  locale: DataLocale
): Promise<NormalizedSummonerSpell[]> {
  return (await gameDataRepository.getSummoners(identity, locale)).spells;
}
