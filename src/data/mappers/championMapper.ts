import type {
  AbilityV2,
  ChampionDetailV2,
  ChampionIndexEntryV2,
} from "@/data/contracts/championData";
import type { Champion, ChampionSpell } from "@/types";

function toStats(detail: ChampionDetailV2): Record<string, number> {
  const stats = detail.champion.baseStats;
  return {
    hp: stats.health.base,
    hpperlevel: stats.health.perLevel,
    mp: stats.mana?.base ?? 0,
    mpperlevel: stats.mana?.perLevel ?? 0,
    movespeed: stats.moveSpeed.base,
    armor: stats.armor.base,
    armorperlevel: stats.armor.perLevel,
    spellblock: stats.magicResist.base,
    spellblockperlevel: stats.magicResist.perLevel,
    attackdamage: stats.attackDamage.base,
    attackdamageperlevel: stats.attackDamage.perLevel,
    attackspeed: stats.attackSpeed.base,
    attackspeedperlevel: stats.attackSpeed.perLevel,
    attackrange: stats.attackRange.base,
    hpregen: stats.healthRegen.base,
    hpregenperlevel: stats.healthRegen.perLevel,
    mpregen: stats.manaRegen?.base ?? 0,
    mpregenperlevel: stats.manaRegen?.perLevel ?? 0,
    crit: 0,
    critperlevel: 0,
  };
}

function toSpell(ability: AbilityV2): ChampionSpell {
  return {
    id: ability.id,
    name: ability.name,
    maxrank: ability.maxRank,
    cooldown: ability.cooldownSeconds,
    cooldownBurn: ability.cooldownSeconds.join("/"),
    recharge: ability.rechargeSeconds,
    maxCharges: ability.maxCharges,
    description: ability.summary,
    summary: ability.summary,
    tooltip: ability.bodyHtml,
    tooltipSource:
      ability.source === "communitydragon" ? "communitydragon" : undefined,
    tooltipDiagnostics:
      ability.diagnostics.unresolvedTokens.length > 0
        ? ability.diagnostics
        : undefined,
    cost: ability.cost?.values,
    costBurn: ability.cost?.values.join("/"),
    costType: ability.cost?.resource,
    resource: ability.cost?.resource,
    range: ability.range,
    rangeBurn: ability.range.join("/"),
    image: { full: ability.iconFile },
    rankValues: ability.rankValues,
  };
}

export function toChampionSummary(
  entry: ChampionIndexEntryV2,
  ddragonVersion: string
): Champion {
  return {
    id: entry.id,
    key: entry.key,
    name: entry.name,
    title: entry.title,
    version: ddragonVersion,
    image: { full: entry.iconFile },
  };
}

export function toChampion(detail: ChampionDetailV2): Champion {
  const { champion } = detail;
  const passive = champion.abilities.P;
  return {
    id: champion.id,
    key: champion.key,
    name: champion.name,
    title: champion.title,
    version: detail.sources.ddragon,
    tags: champion.tags,
    stats: toStats(detail),
    image: { full: `${champion.id}.png` },
    passive: {
      name: passive.name,
      description: passive.bodyHtml,
      summary: passive.summary,
      spellId: passive.id,
      tooltipSource:
        passive.source === "communitydragon" ? "communitydragon" : undefined,
      image: { full: passive.iconFile },
    },
    spells: (["Q", "W", "E", "R"] as const).map((slot) =>
      toSpell(champion.abilities[slot])
    ),
  };
}
