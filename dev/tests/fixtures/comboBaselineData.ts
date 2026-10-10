import type { AdvisorData } from "../../../src/features/advisor/conversation/context";
import type { ChampionCard } from "../../../src/domain/knowledge/facts";
import type { ComboGuideFile } from "../../../src/domain/knowledge/comboGuide";
import { compileComboNotes } from "../../scripts/advisor/lib/comboNotes";
import type { ComboBaseline } from "../../scripts/advisor/lib/comboReview";

/** Conversation behavior uses approved snapshots; publication tests inspect live quarantine separately. */
export function comboBaselineData(data: AdvisorData, guides: ComboGuideFile, baseline: ComboBaseline): AdvisorData {
  const cards = data.cards.map(card => {
    const frozen = baseline.sources[card.id]?.card;
    if (!frozen) return card;
    return { ...card, attackRange: frozen.attackRange, rangeType: frozen.rangeType, spells: structuredClone(frozen.spells),
      stats: Object.fromEntries(Object.entries(card.stats).map(([key, stat]) => [key, { ...stat, ...frozen.stats[key] }])) } as ChampionCard;
  });
  const numericSources = Object.fromEntries(Object.entries(baseline.sources).flatMap(([id, source]) => source.card.numeric ? [[id, source.card.numeric]] : []));
  const notes = compileComboNotes(guides, cards, { baseline, numericSources });
  const playbooks = new Map(data.playbooks);
  for (const [id, entries] of notes) {
    const book = playbooks.get(id) ?? { champion: id, playing: [], against: [] };
    playbooks.set(id, { ...book, comboReview: undefined,
      playing: [...book.playing.filter(entry => !entry.combo && !entry.id?.endsWith("-web-laning")), ...entries] });
  }
  return { ...data, cards, cardById: new Map(cards.map(card => [card.id, card])), playbooks };
}
