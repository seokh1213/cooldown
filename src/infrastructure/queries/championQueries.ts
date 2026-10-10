import Hangul from "hangul-js";
import type { DataLocale, StaticDataIdentity } from "@/domain/game/contracts/staticData";
import { toChampion, toChampionSummary } from "@/infrastructure/mappers/championMapper";
import { championRepository } from "@/infrastructure/repositories/championRepository";
import type { Champion } from "@/domain/game/types";

export async function getChampionList(
  identity: StaticDataIdentity,
  locale: DataLocale
): Promise<Champion[]> {
  const index = await championRepository.getIndex(identity, locale);
  return index.champions.map((entry) => {
    const champion = toChampionSummary(entry, index.sources.ddragon);
    champion.hangul = locale === "ko_KR"
      ? Hangul.d(champion.name, true).map((letters) => letters[0]).join("")
      : "";
    return champion;
  });
}

export async function getChampionInfo(
  identity: StaticDataIdentity,
  locale: DataLocale,
  championId: string
): Promise<Champion> {
  return toChampion(
    await championRepository.getDetail(identity, locale, championId)
  );
}
