import Hangul from "hangul-js";
import type { DataLocale, StaticDataIdentity } from "@/data/contracts/staticData";
import { toChampion, toChampionSummary } from "@/data/mappers/championMapper";
import { championRepository } from "@/data/repositories/championRepository";
import type { Champion } from "@/types";

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
