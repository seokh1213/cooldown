import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  decodeChampionDetail,
  decodeChampionIndex,
} from "../src/data/contracts/championDataDecoder";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { decodeChampionProfile } from "../src/data/contracts/championProfile";
import {
  decodeNormalizedItems,
  decodeNormalizedRunes,
  decodeNormalizedSummoners,
} from "../src/data/contracts/normalizedDataDecoder";
import { DATA_LOCALES } from "../src/data/contracts/staticData";
import { assertStaticDataIdentity } from "../src/data/contracts/staticDataDecoder";

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

const dataDirectory = path.join(process.cwd(), "public", "data");
const manifest = decodeDataManifest(
  await readJson(path.join(dataDirectory, "version.json")),
);
const releaseDirectory = path.join(dataDirectory, manifest.patchVersion);
let checkedFiles = 0;
let expectedFiles = 0;

for (const locale of DATA_LOCALES) {
  const championDirectory = path.join(releaseDirectory, "champions", locale);
  const index = decodeChampionIndex(
    await readJson(path.join(championDirectory, "index.json")),
  );
  assertStaticDataIdentity(index, manifest, locale);
  checkedFiles += 1;
  expectedFiles += 4 + index.champions.length * 2;

  for (const champion of index.champions) {
    const detail = decodeChampionDetail(
      await readJson(path.join(championDirectory, `${champion.id}.json`)),
    );
    assertStaticDataIdentity(detail, manifest, locale);
    checkedFiles += 1;
    const profile = decodeChampionProfile(await readJson(path.join(releaseDirectory, "champion-profiles", locale, champion.id + ".json")));
    assertStaticDataIdentity(profile, manifest, locale);
    assert.equal(profile.champion.id, champion.id);
    checkedFiles += 1;
  }

  for (const [fileName, decode] of [
    [`items-normalized-${locale}.json`, decodeNormalizedItems],
    [`runes-normalized-${locale}.json`, decodeNormalizedRunes],
    [`summoner-normalized-${locale}.json`, decodeNormalizedSummoners],
  ] as const) {
    const data = decode(await readJson(path.join(releaseDirectory, fileName)));
    assertStaticDataIdentity(data, manifest, locale);
    checkedFiles += 1;
  }
}

assert.equal(checkedFiles, expectedFiles);
console.log(`✅ ${checkedFiles} runtime files match the manifest source identity`);
