import type {
  AbilitySimulation,
  AbilityRankValue,
  AbilitySlot,
  AbilityV2,
  ChampionDetailV2,
  ChampionIndexV2,
} from "../../src/data/contracts/championData";
import type {
  DataLocale,
  StaticDataSources,
} from "../../src/data/contracts/staticData";
import { replaceVariable } from "../../src/lib/spellTooltipParser/variableReplacer";
import { stripStatIconTokens } from "../../src/lib/spellTooltipParser/statIcons";
import { parseSpellTooltip } from "../../src/lib/spellTooltipParser/parser";
import type { CommunityDragonSpellData } from "../../src/lib/spellTooltipParser/types";
import { getAbilityResourceName } from "../../src/lib/spellTooltipParser/valueUtils";
import type { Champion, ChampionPassive, ChampionSpell } from "../../src/types";
import type { NormalizedChampion } from "../../src/types/combatNormalized";
import { compileAbilitySimulation } from "./ability-simulation";

export interface ChampionDataV2Input {
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
  champion: Champion;
  normalized: NormalizedChampion;
  spellData: Record<string, CommunityDragonSpellData>;
}

function numericValues(values: (number | string)[] | undefined): number[] {
  if (!values) return [];
  return values.map(Number).filter(Number.isFinite);
}

/**
 * 퍼센트 값인지 판정한다.
 *
 * 번역된 라벨로 판단하면 언어마다 결과가 갈린다. 같은 값이 한국어에서는
 * "60%", 영어에서는 "60" 으로 나오던 원인이다.
 * DDragon leveltip 의 effect 문자열은 세 언어가 동일하고 토큰 뒤에 %를
 * 달고 있어("{{ qtotaladratio*100 }}%") 이쪽을 근거로 삼는다.
 */
function isPercentEffect(effect: string): boolean {
  return /}}\s*%/.test(effect);
}

/**
 * 본문 HTML.
 *
 * CDragon 로컬라이즈가 된 스킬은 이미 렌더된 문자열이 들어 있다.
 * 실패해서 DDragon 툴팁으로 남은 스킬은 아직 원본 템플릿이라 토큰이 그대로다.
 * 아펠리오스 Q 가 "{{ spellmodifierdescriptionappend }}" 만 노출되던 원인이라
 * 폴백 경로도 파서를 태운다.
 */
function buildBodyHtml(
  spell: ChampionSpell,
  source: CommunityDragonSpellData | undefined,
  locale: DataLocale
): string {
  const tooltip = spell.tooltip ?? "";
  if (!tooltip) return "";
  if (spell.tooltipSource === "communitydragon") return tooltip;
  return parseSpellTooltip(tooltip, spell, source, locale);
}

export function inferDamageType(
  tooltip: string,
): "physical" | "magical" | "true" | "unknown" {
  const plainText = tooltip.replace(/<[^>]*>/g, " ").toLowerCase();
  if (/(고정 피해|true damage|真实伤害)/i.test(plainText)) return "true";
  if (/(마법 피해|magic damage|魔法伤害)/i.test(plainText)) return "magical";
  if (/(물리 피해|physical damage|物理伤害)/i.test(plainText)) return "physical";
  return "unknown";
}

function buildRankValues(
  spell: ChampionSpell,
  source: CommunityDragonSpellData | undefined,
  locale: DataLocale
): AbilityRankValue[] {
  const leveltip = spell.leveltip;
  if (!leveltip) return [];

  const values: AbilityRankValue[] = [];
  const length = Math.min(leveltip.label.length, leveltip.effect.length);
  for (let index = 0; index < length; index += 1) {
    const effect = leveltip.effect[index];
    const match = effect.match(/\{\{\s*([^}]+)\s*}}/);
    if (!match) continue;
    // 레벨별 수치 목록은 텍스트로만 쓰므로 스탯 아이콘 자리 표시는 지운다
    const rendered = stripStatIconTokens(
      replaceVariable(match[1].trim(), spell, source, locale) ?? "",
    );
    if (!rendered) continue;

    const label = leveltip.label[index].replace(
      "@AbilityResourceName@",
      getAbilityResourceName(spell, locale)
    );
    const displayValues = isPercentEffect(effect) && !rendered.includes("%")
      ? rendered.split("/").map((value) => `${value}%`).join("/")
      : rendered;
    values.push({ label, values: displayValues });
  }
  return values;
}

function buildPassive(
  passive: ChampionPassive | undefined,
  normalized: NormalizedChampion
): AbilityV2 {
  return {
    slot: "P",
    id: passive?.spellId ?? "P",
    name: passive?.name ?? normalized.spells.P.name,
    maxRank: 0,
    summary: passive?.summary ?? "",
    bodyHtml: passive?.description ?? normalized.spells.P.tooltip,
    iconFile: passive?.image.full ?? "",
    cooldownSeconds: [],
    range: [],
    rankValues: [],
    scalings: normalized.spells.P.scalings,
    simulation: { status: "unavailable", unsupportedPartTypes: [] },
    conditions: [],
    source: passive?.tooltipSource ?? "ddragon",
    diagnostics: { unresolvedTokens: [] },
  };
}

function inferSimulationConditions(
  tooltip: string,
  simulation: AbilitySimulation,
): string[] {
  const text = tooltip.replace(/<[^>]*>/g, " ").toLowerCase();
  const conditions: string[] = [];
  if (simulation.primary?.targetHealthScaling === "max") {
    conditions.push("target-max-health");
  }
  if (/(per second|초당|매초|每秒)/i.test(text)) conditions.push("per-second");
  if (/(every (?:third|3rd)|세 번째|3번째|第3次)/i.test(text)) {
    conditions.push("third-hit");
  }
  if (/(on-hit|on hit|적중 시|命中时)/i.test(text)) conditions.push("on-hit");
  if (/maximumcharge|max(?:imum)? charge|최대 충전|最大蓄力/i.test(
    `${simulation.primary?.id ?? ""} ${text}`,
  )) {
    conditions.push("maximum-charge");
  }
  return [...new Set(conditions)];
}

function buildActiveAbility(
  slot: Exclude<AbilitySlot, "P">,
  spell: ChampionSpell,
  normalized: NormalizedChampion,
  source: CommunityDragonSpellData | undefined,
  locale: DataLocale
): AbilityV2 {
  const costs = numericValues(spell.cost);
  const simulation = compileAbilitySimulation(
    source,
    spell.maxrank,
    inferDamageType(spell.tooltip ?? ""),
    spell.tooltip ?? "",
  );
  const rechargeSeconds = source?.DataValues?.mAmmoRechargeTime?.slice(
    1,
    spell.maxrank + 1
  );
  return {
    slot,
    id: spell.id,
    name: spell.name ?? normalized.spells[slot].name,
    maxRank: spell.maxrank,
    summary: spell.summary ?? spell.description ?? "",
    bodyHtml: buildBodyHtml(spell, source, locale),
    iconFile: spell.image?.full ?? `${spell.id}.png`,
    cooldownSeconds: numericValues(spell.cooldown),
    rechargeSeconds:
      rechargeSeconds && rechargeSeconds.length > 0
        ? rechargeSeconds
        : undefined,
    maxCharges:
      spell.maxammo && Number(spell.maxammo) > 0
        ? Number(spell.maxammo)
        : undefined,
    cost: costs.some((value) => value !== 0)
      ? { values: costs, resource: getAbilityResourceName(spell, locale) }
      : undefined,
    range: numericValues(spell.range),
    rankValues: buildRankValues(spell, source, locale),
    scalings: normalized.spells[slot].scalings,
    simulation,
    conditions: inferSimulationConditions(spell.tooltip ?? "", simulation),
    source: spell.tooltipSource ?? "ddragon",
    diagnostics: {
      unresolvedTokens: spell.tooltipDiagnostics?.unresolvedTokens ?? [],
    },
  };
}

export function buildChampionDetailV2(
  input: ChampionDataV2Input
): ChampionDetailV2 {
  const { champion, normalized, spellData } = input;
  const spells = champion.spells ?? [];
  const activeSlots = ["Q", "W", "E", "R"] as const;
  const activeAbilities = Object.fromEntries(
    activeSlots.map((slot, index) => {
      const spell = spells[index];
      if (!spell) throw new Error(`${champion.id} is missing ${slot}`);
      const source = spellData[spell.id] ?? spellData[String(index)];
      return [
        slot,
        buildActiveAbility(slot, spell, normalized, source, input.locale),
      ];
    })
  ) as Record<Exclude<AbilitySlot, "P">, AbilityV2>;

  return {
    schemaVersion: 2,
    patchVersion: input.patchVersion,
    locale: input.locale,
    sources: input.sources,
    champion: {
      id: champion.id,
      key: champion.key,
      name: champion.name,
      title: champion.title,
      tags: champion.tags ?? [],
      baseStats: normalized.baseStats,
      baseStatContributions: normalized.baseStatContributions,
      abilities: {
        P: buildPassive(champion.passive, normalized),
        ...activeAbilities,
      },
    },
  };
}

export function buildChampionIndexV2(
  details: ChampionDetailV2[]
): ChampionIndexV2 {
  const first = details[0];
  if (!first) throw new Error("Cannot build an empty champion index");
  return {
    schemaVersion: 2,
    patchVersion: first.patchVersion,
    locale: first.locale,
    sources: first.sources,
    champions: details
      .map(({ champion }) => ({
        id: champion.id,
        key: champion.key,
        name: champion.name,
        title: champion.title,
        iconFile: `${champion.id}.png`,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  };
}
