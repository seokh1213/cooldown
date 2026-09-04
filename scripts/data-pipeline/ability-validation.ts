import * as fs from "node:fs";
import * as path from "node:path";
import type { ActiveSpellSourceData } from "./cdragon-active-spells";

type AbilitySlot = "Q" | "W" | "E" | "R";
type IssueKind =
  | "missing-tooltip-key"
  | "missing-cooldown"
  | "missing-cost"
  | "cooldown-mismatch"
  | "cost-mismatch";

interface DDragonSpell {
  maxrank: number;
  cooldown?: Array<number | string>;
  cost?: Array<number | string>;
}

interface ChampionFile {
  champion: { spells: DDragonSpell[] };
}

export interface AbilityValidationIssue {
  key: `${string}:${AbilitySlot}:${IssueKind}`;
  championId: string;
  slot: AbilitySlot;
  kind: IssueKind;
  ddragonValues?: number[];
  cdragonValues?: number[];
  allowlisted: boolean;
  reason?: string;
}

interface AllowlistEntry {
  key: AbilityValidationIssue["key"];
  reason: string;
}

export interface AbilityValidationReport {
  schemaVersion: 1;
  patchVersion: string;
  sourceVersions: {
    ddragon: string;
    cdragon: string;
  };
  summary: {
    champions: number;
    abilities: number;
    tooltipKeys: number;
    cooldownMatches: number;
    costMatches: number;
    knownIssues: number;
    unexpectedIssues: number;
  };
  issues: AbilityValidationIssue[];
}

const SLOTS: AbilitySlot[] = ["Q", "W", "E", "R"];

function toNumbers(values: Array<number | string> | undefined): number[] {
  return (values ?? []).map(Number).filter(Number.isFinite);
}

function valuesEqual(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every(
    (value, index) => Math.abs(value - right[index]) < 0.0001
  );
}

function matchesRankValues(
  source: number[] | undefined,
  expected: number[],
  ranks: number
): boolean {
  if (!source) return false;
  return [source.slice(0, ranks), source.slice(1, ranks + 1)].some(
    (candidate) => valuesEqual(candidate, expected)
  );
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function validateGeneratedAbilities(options: {
  versionDir: string;
  patchVersion: string;
  ddragonVersion: string;
  cdragonVersion: string;
  allowlistPath: string;
  abilitySourcesByChampion: ReadonlyMap<string, ActiveSpellSourceData[]>;
}): AbilityValidationReport {
  const allowlist = readJson<AllowlistEntry[]>(options.allowlistPath);
  const allowed = new Map(allowlist.map((entry) => [entry.key, entry.reason]));
  const championsDir = path.join(options.versionDir, "champions");
  const files = fs.readdirSync(championsDir)
    .filter((name) => name.endsWith("-ko_KR.json"))
    .sort();
  const issues: AbilityValidationIssue[] = [];
  let tooltipKeys = 0;
  let cooldownMatches = 0;
  let costMatches = 0;

  const addIssue = (
    championId: string,
    slot: AbilitySlot,
    kind: IssueKind,
    ddragonValues?: number[],
    cdragonValues?: number[]
  ): void => {
    const key = `${championId}:${slot}:${kind}` as const;
    const reason = allowed.get(key);
    issues.push({
      key,
      championId,
      slot,
      kind,
      ddragonValues,
      cdragonValues,
      allowlisted: Boolean(reason),
      reason,
    });
  };

  for (const fileName of files) {
    const championId = fileName.slice(0, -"-ko_KR.json".length);
    const champion = readJson<ChampionFile>(path.join(championsDir, fileName));
    const abilitySources = options.abilitySourcesByChampion.get(championId);
    SLOTS.forEach((slot, index) => {
      const spell = champion.champion.spells[index];
      const source = abilitySources?.[index];
      if (!spell) return;
      if (source?.locKeys.keyTooltip) tooltipKeys += 1;
      else addIssue(championId, slot, "missing-tooltip-key");

      const cooldowns = toNumbers(spell.cooldown).slice(0, spell.maxrank);
      if (!source?.cooldowns) {
        addIssue(championId, slot, "missing-cooldown", cooldowns);
      } else if (matchesRankValues(source.cooldowns, cooldowns, spell.maxrank)) {
        cooldownMatches += 1;
      } else {
        addIssue(
          championId,
          slot,
          "cooldown-mismatch",
          cooldowns,
          source.cooldowns
        );
      }

      const costs = toNumbers(spell.cost).slice(0, spell.maxrank);
      if (!source?.costs) {
        if (costs.every((value) => value === 0)) costMatches += 1;
        else addIssue(championId, slot, "missing-cost", costs);
      } else if (matchesRankValues(source.costs, costs, spell.maxrank)) {
        costMatches += 1;
      } else {
        addIssue(championId, slot, "cost-mismatch", costs, source.costs);
      }
    });
  }

  return {
    schemaVersion: 1,
    patchVersion: options.patchVersion,
    sourceVersions: {
      ddragon: options.ddragonVersion,
      cdragon: options.cdragonVersion,
    },
    summary: {
      champions: files.length,
      abilities: files.length * SLOTS.length,
      tooltipKeys,
      cooldownMatches,
      costMatches,
      knownIssues: issues.filter((issue) => issue.allowlisted).length,
      unexpectedIssues: issues.filter((issue) => !issue.allowlisted).length,
    },
    issues,
  };
}
