import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import { statAtLevel, type ChampionCard, type StatSnapshot } from "@/lib/knowledge/facts";
import type { LevelScaledScalar } from "@/types/combatNormalized";
import { ALL_CHAMPION_STATS, statFields, type ChampionStatQuery } from "@/lib/advisor/statQuery";
import { translateStat } from "@/lib/advisor/promptLocale";
import { KvTable } from "./AnswerCardFrame";

function snapshot(scalar: LevelScaledScalar) {
  return { lv1: statAtLevel(scalar, 1), lv18: Number(statAtLevel(scalar, 18).toFixed(2)), perLevel: scalar.perLevel };
}

export function ChampionReferenceStats({ card, detail, query }: {
  card: ChampionCard; detail?: ChampionDetailV2; query?: ChampionStatQuery;
}) {
  const { t, lang } = useTranslation();
  const copy = t.advisor.card;
  const selected = query ? statFields(query) : [];
  const stats: Array<{ label: string; snap: Pick<StatSnapshot, "lv1" | "lv18" | "perLevel">; percent: boolean; hit: boolean }> = ALL_CHAMPION_STATS.map(stat => ({
    label: translateStat(stat, lang), snap: card.stats[stat], percent: stat === "attackSpeed", hit: selected.includes(stat),
  }));
  const source = detail?.champion;
  if (source?.resource && source.baseStats.mana && source.baseStats.mana.base > 0) {
    stats.splice(2, 0, { label: source.resource, snap: snapshot(source.baseStats.mana), percent: false, hit: false });
    if (source.baseStats.manaRegen && source.baseStats.manaRegen.base > 0) stats.splice(3, 0, {
      label: fill(copy.resourceRegen, { resource: source.resource }),
      snap: snapshot(source.baseStats.manaRegen), percent: false, hit: false,
    });
  }
  const range = source?.baseStats.attackRange;
  stats.push({ label: t.stats.attackrange, snap: range ? snapshot(range) : { lv1: card.attackRange, lv18: card.attackRange, perLevel: 0 }, percent: false, hit: false });
  return <div data-reference-stats>
    <div className="mb-1 text-[11px] font-medium text-muted-foreground">{copy.stats} · {copy.statGrowth}</div>
    <KvTable rows={stats.map(({ label, snap, percent, hit }) => ({ label, hit, value: <>
      {snap.lv1} → {snap.lv18}
      {snap.perLevel !== undefined && <span className="ml-1.5 whitespace-nowrap text-[11px] text-muted-foreground"
        title={copy.statGrowthNote} aria-label={`${copy.statGrowth} ${snap.perLevel}`}>
        {snap.perLevel >= 0 ? "+" : ""}{snap.perLevel}{percent ? "%" : ""}
      </span>}
    </> }))} />
  </div>;
}
