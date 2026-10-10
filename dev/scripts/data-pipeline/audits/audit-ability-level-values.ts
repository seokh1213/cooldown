/** tsx dev/scripts/data-pipeline/audits/audit-ability-level-values.ts [--ref HEAD] [--json report.json] */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decodeChampionDetail, decodeChampionIndex } from "../../../../src/domain/game/contracts/championDataDecoder";
import { decodeDataManifest } from "../../../../src/domain/game/contracts/dataManifest";
import { DATA_LOCALES } from "../../../../src/domain/game/contracts/staticData";
import { findAbilityLevelIssues, type AbilityLevelIssue } from "../abilities/ability-level-validation";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const reference = argument("--ref");
async function readJson(file: string): Promise<unknown> {
  const text = reference
    ? execFileSync("git", ["show", `${reference}:${file}`], { encoding: "utf8" })
    : await readFile(file, "utf8");
  return JSON.parse(text) as unknown;
}

async function audit() {
  const release = decodeDataManifest(await readJson("public/data/version.json"));
  const dataRoot = path.join("public/data", release.patchVersion, "champions");
  const summary = {
    champions: 0, locales: DATA_LOCALES.length, abilities: 0,
    descriptions: 0, descriptionsWithLevelValues: 0, levelTables: 0,
  };
  const findings: Array<AbilityLevelIssue & { championId: string; locale: string; slot: string; form?: string }> = [];
  for (const locale of DATA_LOCALES) {
    const index = decodeChampionIndex(await readJson(path.join(dataRoot, locale, "index.json")));
    if (summary.champions && summary.champions !== index.champions.length) throw new Error("Champion count differs by locale");
    summary.champions = index.champions.length;
    for (const { id } of index.champions) {
      const detail = decodeChampionDetail(await readJson(path.join(dataRoot, locale, `${id}.json`)));
      for (const [slot, ability] of Object.entries(detail.champion.abilities)) {
        summary.abilities += 1;
        for (const displayed of ability.forms ?? [ability]) {
          summary.descriptions += 1;
          if (displayed.levelValues?.length) summary.descriptionsWithLevelValues += 1;
          summary.levelTables += displayed.levelValues?.length ?? 0;
          for (const issue of findAbilityLevelIssues(displayed)) {
            findings.push({ championId: id, locale, slot, ...("key" in displayed ? { form: displayed.key } : {}), ...issue });
          }
        }
      }
    }
  }
  const report = { patchVersion: release.patchVersion, reference: reference ?? "workspace", summary, findings };
  console.log(JSON.stringify(report, null, 2));
  const output = argument("--json");
  if (output) await writeFile(output, JSON.stringify(report, null, 2));
  if (findings.length) process.exitCode = 1;
}

await audit();
