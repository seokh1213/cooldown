import { readFile } from "node:fs/promises";
import path from "node:path";
import { DATA_LOCALES } from "../../../../src/domain/game/contracts/staticData";
import { decodeDataManifest } from "../../../../src/domain/game/contracts/dataManifest";
import { decodeNormalizedItems } from "../../../../src/domain/game/contracts/normalizedDataDecoder";
import { fetchJson, writeJson } from "../io/json";
import {
  fetchCDragonItemCalculations,
  fetchCDragonItems,
  mergeCDragonItems,
} from "../sources/cdragon-items";
import { normalizeItems } from "../normalization/item";

// Regenerate only the item catalogs at the checked-in release, without mixing patches.
async function generateItemData() {
  const directory = path.join(process.cwd(), "public/data");
  const release = decodeDataManifest(
    JSON.parse(await readFile(path.join(directory, "version.json"), "utf8")),
  );
  const calculations = await fetchCDragonItemCalculations(
    release.sources.cdragon,
  );
  const files = await Promise.all(
    DATA_LOCALES.map(async (locale) => {
      const [ddragon, cdragon] = await Promise.all([
        fetchJson(
          `https://ddragon.leagueoflegends.com/cdn/${release.sources.ddragon}/data/${locale}/item.json`,
        ),
        fetchCDragonItems(locale, release.sources.cdragon),
      ]);
      const data = decodeNormalizedItems({
        ...release,
        locale,
        items: normalizeItems(
          locale,
          mergeCDragonItems(ddragon, cdragon, calculations),
        ),
      });
      return {
        data,
        filename: path.join(
          directory,
          release.patchVersion,
          `items-normalized-${locale}.json`,
        ),
      };
    }),
  );
  for (const file of files) await writeJson(file.data, file.filename);
}

generateItemData().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
