import * as fs from "node:fs";
import * as path from "node:path";
import type { StaticDataRelease } from "../../../src/lib/staticDataRelease";
import { validateAbilitySimulations } from "../ability-simulation-validation";
import { validateGeneratedAbilities } from "../ability-validation";
import {
  assertActiveTooltipReport,
  validateActiveTooltips,
  type ActiveTooltipAllowlist,
} from "../active-tooltip-validation";
import { requireMapValue } from "../champion-source";
import { writeJson } from "../io/json";
import type { ChampionSources } from "./champion-stage";

function readConfig<T>(fileName: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "scripts", fileName), "utf8"),
  ) as T;
}

async function validateActiveAbilities(
  versionDir: string,
  release: StaticDataRelease,
  source: ChampionSources,
): Promise<void> {
  const report = validateActiveTooltips({
    championsByLocale: source.championsByLocale,
    patchVersion: release.patchVersion,
    sources: release.sources,
    allowlist: readConfig<ActiveTooltipAllowlist>(
      "active-tooltip-allowlist.json",
    ),
  });
  await writeJson(report, path.join(versionDir, "active-tooltip-validation.json"));
  assertActiveTooltipReport(report);
  console.log(
    `✅ Precomputed ${report.totals.localized}/${report.totals.abilities} ` +
      `localized Q/W/E/R tooltips (${report.totals.withDiagnostics} diagnostics)`,
  );
}

async function validateAbilitySources(
  versionDir: string,
  release: StaticDataRelease,
  source: ChampionSources,
): Promise<void> {
  const report = validateGeneratedAbilities({
    patchVersion: release.patchVersion,
    sources: release.sources,
    allowlistPath: path.join(
      process.cwd(),
      "scripts",
      "ability-validation-allowlist.json",
    ),
    championsById: requireMapValue(
      source.championsByLocale,
      "ko_KR",
      "Korean champion locale",
    ),
    abilitySourcesByChampion: source.abilitySourcesByChampion,
  });
  await writeJson(report, path.join(versionDir, "ability-validation.json"));
  const unexpected = report.issues
    .filter((issue) => !issue.allowlisted)
    .map((issue) => issue.key);
  if (unexpected.length > 0) {
    throw new Error(`Unexpected ability source mismatches: ${unexpected.join(", ")}`);
  }
  console.log(
    `✅ Validated ${report.summary.abilities} Q/W/E/R abilities ` +
      `(${report.summary.knownIssues} known source differences)`,
  );
}

async function validateSimulations(
  versionDir: string,
  release: StaticDataRelease,
): Promise<void> {
  const report = validateAbilitySimulations(
    versionDir,
    release.patchVersion,
    release.sources,
  );
  await writeJson(
    report,
    path.join(versionDir, "ability-simulation-validation.json"),
  );
  console.log(
    `✅ Compiled ${report.summary.complete}/${report.summary.abilities} ` +
      "safe ability simulations",
  );
}

export async function validateGeneratedData(
  versionDir: string,
  release: StaticDataRelease,
  source: ChampionSources,
): Promise<void> {
  await validateActiveAbilities(versionDir, release, source);
  await validateAbilitySources(versionDir, release, source);
  await validateSimulations(versionDir, release);
}
