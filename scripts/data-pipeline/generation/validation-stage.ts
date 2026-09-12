import * as fs from "node:fs";
import * as path from "node:path";
import type { StaticDataRelease } from "../../../src/lib/staticDataRelease";
import { corroborateMismatches } from "../ability-corroboration";
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
  // 원본끼리 갈라졌을 때는 클라이언트 데이터에 물어본다. 배포하는 값이 그쪽과 같으면
  // 우리 문제가 아니다. 이 단계가 없으면 밸런스 패치마다 사람이 허용 목록을 채워야 한다.
  await corroborateMismatches(
    report.issues,
    requireMapValue(source.championsByLocale, "ko_KR", "Korean champion locale"),
    release.sources,
  );
  await writeJson(report, path.join(versionDir, "ability-validation.json"));

  const corroborated = report.issues.filter(
    (issue) => !issue.allowlisted && issue.corroborated,
  );
  for (const issue of corroborated) {
    console.log(
      `ℹ️ ${issue.key}: character bin 과 다르지만 클라이언트 데이터가 배포 값을 뒷받침함 ` +
        `(배포 ${JSON.stringify(issue.ddragonValues)}, bin ${JSON.stringify(issue.cdragonValues)})`,
    );
  }

  // 허용 목록이 낡으면 같은 자리의 진짜 문제까지 가린다. 지울 수 있는 항목을 알려 준다.
  const stale = report.issues.filter((issue) => issue.allowlisted && issue.corroborated);
  if (stale.length) {
    console.log(
      `ℹ️ 허용 목록에서 뺄 수 있는 항목 ${stale.length}건 (클라이언트 데이터가 배포 값을 뒷받침함): ` +
        stale.map((issue) => issue.key).join(", "),
    );
  }

  const unexpected = report.issues
    .filter((issue) => !issue.allowlisted && !issue.corroborated)
    .map((issue) => issue.key);
  if (unexpected.length > 0) {
    throw new Error(`Unexpected ability source mismatches: ${unexpected.join(", ")}`);
  }
  console.log(
    `✅ Validated ${report.summary.abilities} Q/W/E/R abilities ` +
      `(${report.summary.knownIssues} known source differences` +
      `${corroborated.length ? `, ${corroborated.length} corroborated by client data` : ""})`,
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
