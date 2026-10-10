import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeChampionDetail, decodeChampionIndex } from "../../../src/domain/game/contracts/championDataDecoder";
import { decodeDataManifest } from "../../../src/domain/game/contracts/dataManifest";
import { DATA_LOCALES } from "../../../src/domain/game/contracts/staticData";
import { findAbilityLevelIssues } from "../../scripts/data-pipeline/ability-level-validation";

const release = decodeDataManifest(JSON.parse(readFileSync("public/data/version.json", "utf8")));
for (const locale of DATA_LOCALES) {
  const directory = `public/data/${release.patchVersion}/champions/${locale}`;
  const index = decodeChampionIndex(JSON.parse(readFileSync(`${directory}/index.json`, "utf8")));
  test(`${locale} 모든 챔피언의 표시되는 레벨 범위에 상세 표 데이터가 있다`, () => {
    for (const { id } of index.champions) {
      const detail = decodeChampionDetail(JSON.parse(readFileSync(`${directory}/${id}.json`, "utf8")));
      for (const [slot, ability] of Object.entries(detail.champion.abilities)) {
        for (const displayed of ability.forms ?? [ability]) {
          const form = "key" in displayed ? `/${displayed.key}` : "";
          assert.deepEqual(findAbilityLevelIssues(displayed), [], `${id}:${slot}${form}`);
        }
      }
    }
  });
}
