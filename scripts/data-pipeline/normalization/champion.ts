import type { Champion, ChampionPassive, ChampionSpell } from "../../../src/types";
import type {
  ChampionSpellSlot,
  NormalizedChampion,
  NormalizedSpell,
} from "../../../src/types/combatNormalized";
import type { FormulaPart } from "../../../src/types/combatStats";
import { buildBaseStatContributions, buildChampionBaseStats } from "./champion-stats";
import { getNormalizationOverrides } from "./overrides";
import type { ChampionSpellData } from "../champion-source";

function buildSpellScaling(
  spellIndex: number,
  spellDataMap: ChampionSpellData,
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
  ddragonSpell: ChampionSpell | null,
  passive: ChampionPassive | null,
  spellIndex: number,
  spellDataMap: ChampionSpellData,
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

export function normalizeChampion(input: {
  locale: string;
  championId: string;
  champion: Champion;
  spellData: ChampionSpellData;
}): NormalizedChampion {
  const { locale, championId, champion, spellData } = input;
  const baseStats = buildChampionBaseStats(champion.stats ?? {});
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
      P: buildNormalizedSpell("P", null, champion.passive ?? null, -1, spellData),
      Q: buildNormalizedSpell("Q", spells[0] ?? null, null, 0, spellData),
      W: buildNormalizedSpell("W", spells[1] ?? null, null, 1, spellData),
      E: buildNormalizedSpell("E", spells[2] ?? null, null, 2, spellData),
      R: buildNormalizedSpell("R", spells[3] ?? null, null, 3, spellData),
    },
  };
  const override = getNormalizationOverrides()?.champions?.[locale]?.[championId];
  return override ? { ...normalized, ...override } : normalized;
}
