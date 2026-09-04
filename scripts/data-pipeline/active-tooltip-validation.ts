import type { DataLocale } from "./localization";
import type { Champion } from "../../src/types";
import type { ChampionsByLocale } from "./champion-source";
import type { StaticDataSources } from "../../src/data/contracts/staticData";

const ABILITY_SLOTS = ["Q", "W", "E", "R"] as const;

export interface ActiveTooltipAllowlist {
  unresolvedTokens: string[];
  missingTooltips: string[];
}

export interface ActiveTooltipIssue {
  championId: string;
  locale: DataLocale;
  slot: (typeof ABILITY_SLOTS)[number];
  spellId: string;
  unresolvedTokens: string[];
}

export interface ActiveTooltipValidationReport {
  schemaVersion: 2;
  patchVersion: string;
  sources: StaticDataSources;
  totals: {
    abilities: number;
    localized: number;
    fallback: number;
    withDiagnostics: number;
    uniqueUnresolvedTokens: number;
  };
  issues: ActiveTooltipIssue[];
  unexpectedTokens: string[];
  unexpectedMissingTooltips: string[];
  staleAllowedTokens: string[];
  staleAllowedMissingTooltips: string[];
}

interface ChampionLocaleEntry {
  championId: string;
  locale: DataLocale;
  champion: Champion;
}

export interface ActiveTooltipValidationInput {
  championsByLocale: ChampionsByLocale;
  patchVersion: string;
  sources: StaticDataSources;
  allowlist: ActiveTooltipAllowlist;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedChampionLocaleEntries(
  championsByLocale: ChampionsByLocale,
): ChampionLocaleEntry[] {
  return [...championsByLocale.entries()]
    .flatMap(([locale, champions]) =>
      [...champions.entries()].map(([championId, champion]) => ({
        championId,
        locale,
        champion,
      })),
    )
    .sort(
      (left, right) =>
        compareStrings(left.championId, right.championId) ||
        compareStrings(left.locale, right.locale),
    );
}

export function validateActiveTooltips({
  championsByLocale,
  patchVersion,
  sources,
  allowlist,
}: ActiveTooltipValidationInput): ActiveTooltipValidationReport {
  const issues: ActiveTooltipIssue[] = [];
  const missing = new Set<string>();
  let abilities = 0;
  let localized = 0;

  for (const { championId, locale, champion } of sortedChampionLocaleEntries(
    championsByLocale,
  )) {
    (champion.spells ?? []).forEach((spell, index) => {
      const slot = ABILITY_SLOTS[index];
      if (!slot) return;
      abilities += 1;
      if (spell.tooltipSource === "communitydragon") localized += 1;
      else missing.add(`${championId}:${slot}`);

      const unresolvedTokens = spell.tooltipDiagnostics?.unresolvedTokens ?? [];
      if (unresolvedTokens.length === 0) return;
      issues.push({
        championId,
        locale,
        slot,
        spellId: spell.id ?? "unknown",
        unresolvedTokens,
      });
    });
  }

  const tokens = [...new Set(issues.flatMap((issue) => issue.unresolvedTokens))];
  const allowedTokens = new Set(allowlist.unresolvedTokens);
  const allowedMissing = new Set(allowlist.missingTooltips);
  return {
    schemaVersion: 2,
    patchVersion,
    sources,
    totals: {
      abilities,
      localized,
      fallback: abilities - localized,
      withDiagnostics: issues.length,
      uniqueUnresolvedTokens: tokens.length,
    },
    issues,
    unexpectedTokens: tokens.filter((token) => !allowedTokens.has(token)).sort(),
    unexpectedMissingTooltips: [...missing]
      .filter((key) => !allowedMissing.has(key))
      .sort(),
    staleAllowedTokens: allowlist.unresolvedTokens
      .filter((token) => !tokens.includes(token))
      .sort(),
    staleAllowedMissingTooltips: allowlist.missingTooltips
      .filter((key) => !missing.has(key))
      .sort(),
  };
}

/**
 * 기준선 위반만 실패로 본다.
 *
 * 새로 생긴 미해석 토큰·툴팁 누락은 회귀라 막아야 한다.
 * 반대로 해소된 항목은 개선이므로 막을 이유가 없다. 예전에는 이것도 실패로
 * 처리해서, 패치로 토큰 하나가 사라지기만 해도 CI 가 30분마다 죽고 데이터
 * 갱신이 멈췄다. 해소분은 허용 목록에서 자동으로 걷어낸다.
 */
export function assertActiveTooltipReport(
  report: ActiveTooltipValidationReport,
): void {
  if (
    report.unexpectedTokens.length === 0 &&
    report.unexpectedMissingTooltips.length === 0
  ) {
    return;
  }
  throw new Error(
    `Active tooltip baseline regressed: ${report.unexpectedTokens.length} new tokens ` +
      `[${report.unexpectedTokens.slice(0, 5).join(", ")}], ` +
      `${report.unexpectedMissingTooltips.length} new missing tooltips ` +
      `[${report.unexpectedMissingTooltips.slice(0, 5).join(", ")}]`,
  );
}

/**
 * 해소된 항목을 허용 목록에서 걷어낸다.
 * 목록이 실제와 어긋난 채 굳으면 다음 회귀를 못 잡는다.
 */
export function pruneAllowlist(
  allowlist: ActiveTooltipAllowlist,
  report: ActiveTooltipValidationReport,
): { allowlist: ActiveTooltipAllowlist; changed: boolean } {
  const staleTokens = new Set(report.staleAllowedTokens);
  const staleMissing = new Set(report.staleAllowedMissingTooltips);
  if (staleTokens.size === 0 && staleMissing.size === 0) {
    return { allowlist, changed: false };
  }
  return {
    allowlist: {
      unresolvedTokens: allowlist.unresolvedTokens.filter(
        (token) => !staleTokens.has(token),
      ),
      missingTooltips: allowlist.missingTooltips.filter(
        (key) => !staleMissing.has(key),
      ),
    },
    changed: true,
  };
}
