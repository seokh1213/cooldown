import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { decodeChampionDetail } from "../src/data/contracts/championDataDecoder";
import type { ChampionDetailV2 } from "../src/data/contracts/championData";
import { assertStaticDataIdentity } from "../src/data/contracts/staticDataDecoder";
import { DATA_LOCALES } from "../src/data/contracts/staticData";
import type { Champion } from "../src/types";
import type { StringTable } from "./data-pipeline/localization";
import { fetchJson, writeJson } from "./data-pipeline/io/json";
import { fetchCDragonChampion } from "./data-pipeline/sources/cdragon-champion";
import { extractActiveSpells } from "./data-pipeline/cdragon-active-spells";
import { ABILITY_FORM_DEFINITIONS, buildAbilityForms } from "./data-pipeline/ability-forms";

async function generateForms() {
  const release = decodeDataManifest(JSON.parse(await readFile("public/data/version.json", "utf8")));
  const sources = await Promise.all(Object.keys(ABILITY_FORM_DEFINITIONS).map(async (id) => ({
    id, aliases: extractActiveSpells(await fetchCDragonChampion(id, release.sources.cdragon), id).aliases,
  })));
  for (const locale of DATA_LOCALES) {
    const table = await fetchJson<StringTable>(`https://raw.communitydragon.org/${release.sources.cdragon}/game/${locale.toLowerCase()}/data/menu/en_us/lol.stringtable.json`);
    for (const { id, aliases } of sources) {
      const filename = path.join("public/data", release.patchVersion, "champions", locale, id + ".json");
      // Replace generated forms before validating, so earlier form revisions can be refreshed.
      const detail = JSON.parse(await readFile(filename, "utf8")) as ChampionDetailV2;
      const response = await fetchJson<{ data: Record<string, Champion> }>(`https://ddragon.leagueoflegends.com/cdn/${release.sources.ddragon}/data/${locale}/champion/${id}.json`);
      const champion = response.data[id];
      if (!champion) throw new Error(`Missing ${id}`);
      for (const [index, slot] of (["Q", "W", "E", "R"] as const).entries()) {
        const spell = champion.spells?.[index];
        if (!spell) throw new Error(`Missing ${id} ${slot}`);
        detail.champion.abilities[slot].forms = buildAbilityForms({ champion, spell, slot, locale, table, aliases, cdragonVersion: release.sources.cdragon });
      }
      decodeChampionDetail(detail);
      assertStaticDataIdentity(detail, release, locale);
      await writeJson(detail, filename);
    }
  }
}
generateForms().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
