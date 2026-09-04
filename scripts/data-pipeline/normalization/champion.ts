import fs from "node:fs";
import type {
  ChampionSpellSlot,
  NormalizedChampion,
  NormalizedSpell,
} from "../../../src/types/combatNormalized";
import type { FormulaPart } from "../../../src/types/combatStats";
import { buildBaseStatContributions, buildChampionBaseStats } from "./champion-stats";
import { getNormalizationOverrides } from "./overrides";

interface DDragonSpell {
  id?: string;
  name?: string;
  tooltip?: string;
  cooldown?: unknown[];
  cost?: unknown[];
}

interface DDragonPassive {
  name?: string;
  description?: string;
}

interface DDragonChampion {
  name?: string;
  image?: { full?: string };
  stats?: Record<string, number | undefined>;
  spells?: DDragonSpell[];
  passive?: DDragonPassive;
}

interface CDragonSpell {
  mSpellCalculations?: Record<string, unknown>;
}

type CDragonSpellMap = Record<string, CDragonSpell>;

function buildSpellScaling(
  spellIndex: number,
  spellDataMap: CDragonSpellMap | null,
): { parts: FormulaPart[] } {
  const calculations = spellDataMap?.[String(spellIndex)]?.mSpellCalculations;
  if (!calculations) return { parts: [] };

  const calculationKeys = Object.keys(calculations);
  if (calculationKeys.length === 0) return { parts: [] };

  const priority = [
    "TotalDamage",
    "BaseDamage",
    "QMissileDamage",
    "TotalMaxHealthDamage",
    "HealingCalc",
    "TotalHeal",
    "TotalShield",
  ];
  const calculationKey =
    priority.find((key) => key in calculations) ?? calculationKeys[0];

  return {
    parts: [
      {
        stat: null,
        coefficient: 1,
        op: "add",
        rawRef: `${spellIndex}:${calculationKey}`,
      },
    ],
  };
}

function numbersOnly(values: unknown[] | undefined): number[] | undefined {
  if (!values) return undefined;
  return values.filter((value): value is number => typeof value === "number");
}

function buildNormalizedSpell(
  slot: ChampionSpellSlot,
  ddragonSpell: DDragonSpell | null,
  passive: DDragonPassive | null,
  spellIndex: number,
  spellDataMap: CDragonSpellMap | null,
): NormalizedSpell {
  const isPassive = slot === "P";
  const name = isPassive ? passive?.name ?? "" : ddragonSpell?.name ?? "";
  const tooltip = isPassive
    ? passive?.description ?? ""
    : ddragonSpell?.tooltip ?? "";
  const scaling = buildSpellScaling(spellIndex, spellDataMap);

  return {
    slot,
    key: ddragonSpell?.id ?? slot,
    name,
    tooltip,
    cooldowns: numbersOnly(ddragonSpell?.cooldown),
    costs: numbersOnly(ddragonSpell?.cost),
    scalings:
      scaling.parts.length === 0
        ? []
        : [
            {
              id: isPassive ? "passive" : "damage",
              labelEn: isPassive ? "Passive" : `${slot} Scaling`,
              labelKo: isPassive ? "패시브" : `${slot} 계수`,
              parts: scaling.parts,
            },
          ],
  };
}

export function buildNormalizedChampion(
  locale: string,
  championId: string,
  championDataPath: string,
  cdragonSpellPath: string,
): NormalizedChampion | null {
  if (!fs.existsSync(championDataPath)) return null;

  const raw = JSON.parse(fs.readFileSync(championDataPath, "utf8")) as {
    champion?: DDragonChampion;
  };
  const champion = raw.champion;
  if (!champion) return null;

  const baseStats = buildChampionBaseStats(champion.stats ?? {});
  let spellDataMap: CDragonSpellMap | null = null;
  if (fs.existsSync(cdragonSpellPath)) {
    const cdragonRaw = JSON.parse(fs.readFileSync(cdragonSpellPath, "utf8")) as {
      spellData?: CDragonSpellMap;
    };
    spellDataMap = cdragonRaw.spellData ?? null;
  }

  const spells = champion.spells ?? [];
  const normalized: NormalizedChampion = {
    id: championId,
    type: "champion",
    name: champion.name ?? championId,
    iconPath: champion.image?.full
      ? `/lol/img/champion/${champion.image.full}`
      : undefined,
    baseStats,
    baseStatContributions: buildBaseStatContributions(baseStats),
    spells: {
      P: buildNormalizedSpell("P", null, champion.passive ?? null, -1, spellDataMap),
      Q: buildNormalizedSpell("Q", spells[0] ?? null, null, 0, spellDataMap),
      W: buildNormalizedSpell("W", spells[1] ?? null, null, 1, spellDataMap),
      E: buildNormalizedSpell("E", spells[2] ?? null, null, 2, spellDataMap),
      R: buildNormalizedSpell("R", spells[3] ?? null, null, 3, spellDataMap),
    },
  };
  const override = getNormalizationOverrides()?.champions?.[locale]?.[championId];
  return override ? { ...normalized, ...override } : normalized;
}
