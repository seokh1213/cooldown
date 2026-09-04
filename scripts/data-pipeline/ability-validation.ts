import * as fs from "node:fs";
import type { Champion, ChampionSpell } from "../../src/types";
import type { ActiveSpellSourceData } from "./cdragon-active-spells";

type AbilitySlot = "Q" | "W" | "E" | "R";
type IssueKind =
  | "missing-tooltip-key"
  | "missing-cooldown"
  | "missing-cost"
  | "cooldown-mismatch"
  | "cost-mismatch";

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

export type ChampionById = ReadonlyMap<string, Champion>;

interface ValidationCounters {
  tooltipKeys: number;
  cooldownMatches: number;
  costMatches: number;
}

interface ValidationContext {
  allowed: ReadonlyMap<string, string>;
  issues: AbilityValidationIssue[];
  counters: ValidationCounters;
}

interface AbilityInput {
  championId: string;
  slot: AbilitySlot;
  spell: ChampionSpell;
  source?: ActiveSpellSourceData;
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

function addIssue(
  context: ValidationContext,
  input: AbilityInput,
  kind: IssueKind,
  values: { ddragon?: number[]; cdragon?: number[] } = {}
): void {
  const key = `${input.championId}:${input.slot}:${kind}` as const;
  const reason = context.allowed.get(key);
  context.issues.push({
    key,
    championId: input.championId,
    slot: input.slot,
    kind,
    ddragonValues: values.ddragon,
    cdragonValues: values.cdragon,
    allowlisted: Boolean(reason),
    reason,
  });
}

function validateAbility(
  context: ValidationContext,
  input: AbilityInput
): void {
  const { spell, source } = input;
  if (source?.locKeys.keyTooltip) context.counters.tooltipKeys += 1;
  else addIssue(context, input, "missing-tooltip-key");

  const cooldowns = toNumbers(spell.cooldown).slice(0, spell.maxrank);
  if (!source?.cooldowns) {
    addIssue(context, input, "missing-cooldown", { ddragon: cooldowns });
  } else if (matchesRankValues(source.cooldowns, cooldowns, spell.maxrank)) {
    context.counters.cooldownMatches += 1;
  } else {
    addIssue(context, input, "cooldown-mismatch", {
      ddragon: cooldowns,
      cdragon: source.cooldowns,
    });
  }

  const costs = toNumbers(spell.cost).slice(0, spell.maxrank);
  if (!source?.costs) {
    if (costs.every((value) => value === 0)) {
      context.counters.costMatches += 1;
    } else {
      addIssue(context, input, "missing-cost", { ddragon: costs });
    }
  } else if (matchesRankValues(source.costs, costs, spell.maxrank)) {
    context.counters.costMatches += 1;
  } else {
    addIssue(context, input, "cost-mismatch", {
      ddragon: costs,
      cdragon: source.costs,
    });
  }
}

export function validateGeneratedAbilities(options: {
  championsById: ChampionById;
  patchVersion: string;
  ddragonVersion: string;
  cdragonVersion: string;
  allowlistPath: string;
  abilitySourcesByChampion: ReadonlyMap<string, ActiveSpellSourceData[]>;
}): AbilityValidationReport {
  const allowlist = readJson<AllowlistEntry[]>(options.allowlistPath);
  const allowed = new Map(allowlist.map((entry) => [entry.key, entry.reason]));
  const championIds = [...options.championsById.keys()].sort();
  const context: ValidationContext = {
    allowed,
    issues: [],
    counters: {
      tooltipKeys: 0,
      cooldownMatches: 0,
      costMatches: 0,
    },
  };

  for (const championId of championIds) {
    const champion = options.championsById.get(championId);
    const abilitySources = options.abilitySourcesByChampion.get(championId);
    SLOTS.forEach((slot, index) => {
      const spell = champion?.spells?.[index];
      if (!spell) return;
      validateAbility(context, {
        championId,
        slot,
        spell,
        source: abilitySources?.[index],
      });
    });
  }

  const { issues, counters } = context;

  return {
    schemaVersion: 1,
    patchVersion: options.patchVersion,
    sourceVersions: {
      ddragon: options.ddragonVersion,
      cdragon: options.cdragonVersion,
    },
    summary: {
      champions: championIds.length,
      abilities: championIds.length * SLOTS.length,
      tooltipKeys: counters.tooltipKeys,
      cooldownMatches: counters.cooldownMatches,
      costMatches: counters.costMatches,
      knownIssues: issues.filter((issue) => issue.allowlisted).length,
      unexpectedIssues: issues.filter((issue) => !issue.allowlisted).length,
    },
    issues,
  };
}
