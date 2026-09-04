import type { DataLocale } from "./localization";
import type { Champion } from "../../src/types";
import type { ChampionsByLocale } from "./champion-source";

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
  schemaVersion: 1;
  patchVersion: string;
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
    schemaVersion: 1,
    patchVersion,
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

export function assertActiveTooltipReport(
  report: ActiveTooltipValidationReport,
): void {
  if (
    report.unexpectedTokens.length === 0 &&
    report.unexpectedMissingTooltips.length === 0 &&
    report.staleAllowedTokens.length === 0 &&
    report.staleAllowedMissingTooltips.length === 0
  ) {
    return;
  }
  throw new Error(
    `Active tooltip baseline changed: ${report.unexpectedTokens.length} new tokens, ` +
      `${report.unexpectedMissingTooltips.length} new missing tooltips, ` +
      `${report.staleAllowedTokens.length} resolved tokens, ` +
      `${report.staleAllowedMissingTooltips.length} resolved missing tooltips`,
  );
}
