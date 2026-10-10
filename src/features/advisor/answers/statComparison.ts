/** 요청한 능력치마다 표의 행과 결론을 만든다. 값은 패치 카드에서만 가져온다. */
import type { Language } from "@/shared/i18n";
import type { ChampionCard, StatName } from "@/domain/knowledge/facts";
import type { AdvisorAnswer, CompareRow, Fact } from "./answer";
import { cardLabels, translateStat } from "./promptLocale";
import { detectLevel, detectStats, statFields, type ChampionStatQuery } from "../understanding/statQuery";

function winner(values: Array<number | undefined>): number | undefined {
  const maximum = Math.max(...values.filter((value): value is number => value !== undefined));
  const indices = values.flatMap((value, index) => value === maximum ? [index] : []);
  return indices.length === 1 ? indices[0] : undefined;
}

function conclusion(row: CompareRow, cards: ChampionCard[], level: ChampionStatQuery["level"], lang: Language): Fact {
  const order = cards.map((card, index) => ({ name: card.name, value: row.values[index] === "" ? NaN : Number(row.values[index]) }))
    .filter(entry => Number.isFinite(entry.value)).sort((a, b) => b.value - a.value);
  const value = order.map((entry, i) => i === 0 ? `${entry.name} ${entry.value}`
    : `${entry.value === order[i - 1].value ? "=" : ">"} ${entry.name} ${entry.value}`).join(" ");
  return { label: `${row.label} (${cardLabels(lang).level(level)})`, value };
}

export function buildStatComparison(cards: ChampionCard[], question: string,
  options: { lang: Language; query?: ChampionStatQuery; defaultFields: StatName[] }): Extract<AdvisorAnswer, { kind: "compare" }> {
  const { lang } = options;
  const level = options.query?.level ?? detectLevel(question);
  const asked = options.query ? statFields(options.query) : detectStats(question);
  const stats = asked.length > 1 ? asked : [...new Set([...options.defaultFields, ...asked])];
  const rows = stats.map(stat => {
    const numbers = cards.map(card => card.stats[stat]?.[`lv${level}`]);
    const unit = lang === "ko_KR" ? "5초당" : lang === "en_US" ? "per 5s" : "每5秒";
    return { label: stat === "healthRegen" ? `${translateStat(stat, lang)} (${unit})` : translateStat(stat, lang),
      values: numbers.map(n => n === undefined ? "" : String(n)), hit: asked.includes(stat), winner: winner(numbers) };
  });
  const headlines = asked.flatMap(field => {
    const row = rows[stats.indexOf(field)];
    return row ? [conclusion(row, cards, level, lang)] : [];
  });
  const statQuery = options.query ?? (asked.length ? { kind: "championStat" as const, champions: cards.map(card => card.id),
    field: asked[0], ...(asked.length > 1 ? { fields: asked } : {}), level } : undefined);
  return { kind: "compare", cards, level, rows, headline: headlines[0],
    ...(headlines.length > 1 ? { headlines } : {}), statQuery };
}
