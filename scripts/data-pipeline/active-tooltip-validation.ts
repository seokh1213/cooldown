import * as fs from "node:fs";
import * as path from "node:path";
import type { DataLocale } from "./localization";

const ABILITY_SLOTS = ["Q", "W", "E", "R"] as const;

interface GeneratedSpell {
  id?: string;
  tooltipSource?: string;
  tooltipDiagnostics?: { unresolvedTokens?: string[] };
}

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

function readSpells(filePath: string): GeneratedSpell[] {
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return Array.isArray(data?.champion?.spells) ? data.champion.spells : [];
}

export function validateActiveTooltipFiles(
  championsDir: string,
  patchVersion: string,
  locales: readonly DataLocale[],
  allowlist: ActiveTooltipAllowlist
): ActiveTooltipValidationReport {
  const issues: ActiveTooltipIssue[] = [];
  const missing = new Set<string>();
  let abilities = 0;
  let localized = 0;

  for (const fileName of fs.readdirSync(championsDir).sort()) {
    const locale = locales.find((entry) => fileName.endsWith(`-${entry}.json`));
    if (!locale) continue;
    const championId = fileName.slice(0, -`-${locale}.json`.length);
    readSpells(path.join(championsDir, fileName)).forEach((spell, index) => {
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
  report: ActiveTooltipValidationReport
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
      `${report.staleAllowedMissingTooltips.length} resolved missing tooltips`
  );
}
