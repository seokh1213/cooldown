import { createHash } from "node:crypto";
import type { ChampionCard, SpellFact } from "../../../../src/domain/knowledge/facts";
import type { ComboGuideFile, ComboPattern } from "../../../../src/domain/knowledge/comboGuide";
import type { NumericChampion } from "../../patch-notes/sourceTypes";
import { numericComboChanges } from "./comboNumericChanges";

export const comboHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");
export const abilityTextHash = (card: ChampionCard): string => comboHash(card.spells.map(({ slot, text }) => ({ slot, text })));

function comboSpellSource(spell: SpellFact): SpellFact {
  // 검수 주석 추가는 게임 변경이 아니다. 툴팁·공식 수치의 변경 검사는 그대로 유지한다.
  const { ticks: _ticks, ...source } = spell;
  if (source.forms) source.forms = source.forms.map(({ ticks: _ticks, ...form }) => form);
  return source;
}

export function comboSource(card: ChampionCard, numeric?: NumericChampion) {
  return { id: card.id, attackRange: card.attackRange, rangeType: card.rangeType, spells: card.spells.map(comboSpellSource),
    ...(numeric ? { numeric } : {}),
    stats: Object.fromEntries(Object.entries(card.stats).map(([key, stat]) => [key,
      { perLevel: stat.perLevel, lv1: stat.lv1, lv6: stat.lv6, lv11: stat.lv11, lv18: stat.lv18 }])) };
}
export type ComboSource = ReturnType<typeof comboSource>;
export interface ComboBaseline {
  schemaVersion: 1;
  patch: string;
  sources: Record<string, { hash: string; card: ComboSource }>;
  noteHashes: Record<string, string>;
}
export interface ComboChange {
  slot: string; kind: "damage-numbers" | "numeric-value" | "source-content"; before?: SpellFact; after?: SpellFact;
  beforeCommon?: Omit<ComboSource, "id" | "spells">; afterCommon?: Omit<ComboSource, "id" | "spells">;
  sourceKey?: string; beforeValue?: unknown; afterValue?: unknown;
}
export interface ComboReview {
  champion: string;
  id: string;
  status: "unchanged" | "compatible" | "needs-review";
  reviewedPatch: string;
  reviewedAt?: string;
  checkedThroughPatch: string | null;
  sourceHash: string | null;
  previousSourceHash: string | null;
  reasons: string[];
  changes: ComboChange[];
}

// Only arithmetic immediately qualifying damage is masked. Counts, seconds and thresholds remain visible.
export function damageSignature(text: string): string {
  return text.replace(/(?:[0-9()[\].\s+*/%~−-]|추가 공격력|기본 공격력|총 공격력|공격력|주문력)+(?=의\s*(?:물리|마법|고정)\s*피해)/g,
    expression => expression.replace(/\d+(?:\.\d+)?/g, "#"));
}

function damageOnly(before: SpellFact, after: SpellFact): boolean {
  if (before.text === after.text || damageSignature(before.text) !== damageSignature(after.text)) return false;
  const mask = (spell: SpellFact) => ({ ...spell, text: damageSignature(spell.text),
    ratios: Object.fromEntries(Object.entries(spell.ratios).map(([key, value]) => [key,
      ["공격력", "추가 공격력", "주문력"].includes(key) && spell.text.includes(key) ? "damage-coefficient" : value])) });
  return comboHash(mask(before)) === comboHash(mask(after));
}

export function sourceChanges(before: ComboSource, after: ComboSource): ComboChange[] {
  const slots = new Set([...before.spells, ...after.spells].map(spell => spell.slot));
  const changes: ComboChange[] = [];
  for (const slot of slots) {
    const old = before.spells.find(spell => spell.slot === slot), current = after.spells.find(spell => spell.slot === slot);
    if (comboHash(old) !== comboHash(current)) changes.push({ slot,
      kind: old && current && damageOnly(old, current) ? "damage-numbers" : "source-content", before: old, after: current });
  }
  if (comboHash({ stats: before.stats, attackRange: before.attackRange, rangeType: before.rangeType })
      !== comboHash({ stats: after.stats, attackRange: after.attackRange, rangeType: after.rangeType })) {
    changes.push({ slot: "stats", kind: "source-content",
      beforeCommon: { stats: before.stats, attackRange: before.attackRange, rangeType: before.rangeType },
      afterCommon: { stats: after.stats, attackRange: after.attackRange, rangeType: after.rangeType } });
  }
  changes.push(...numericComboChanges(before.numeric, after.numeric));
  return changes;
}

export function validateComboBaseline(guides: ComboGuideFile, baseline: ComboBaseline): void {
  if (baseline.schemaVersion !== 1 || !/^\d+\.\d+$/.test(baseline.patch)) throw new Error("Invalid combo baseline");
  const ids = new Set<string>();
  for (const guide of guides.champions) {
    const source = baseline.sources[guide.champion];
    if (!source || source.card.id !== guide.champion || comboHash(source.card) !== source.hash) {
      throw new Error(`Invalid combo source snapshot: ${guide.champion}`);
    }
    for (const pattern of guide.patterns) {
      const dep = pattern.dependencies;
      if (ids.has(pattern.id) || !baseline.noteHashes[pattern.id] || !dep?.slots.length || !dep.basis
          || !["review", "independent"].includes(dep.damageNumbers)
          || dep.damageSourceKeys !== undefined && (!Array.isArray(dep.damageSourceKeys) || dep.damageSourceKeys.some(key => typeof key !== "string" || !key))
          || dep.damageNumbers === "independent" && source.card.numeric && !dep.damageSourceKeys?.length
          || dep.slots.some(slot => !source.card.spells.some(spell => spell.slot === slot))) {
        throw new Error(`Invalid combo dependencies: ${pattern.id}`);
      }
      ids.add(pattern.id);
    }
    if (guide.laning && !baseline.noteHashes[`${guide.champion.toLowerCase()}-web-laning`]) {
      throw new Error(`Missing combo laning snapshot: ${guide.champion}`);
    }
  }
}

export function reviewCombos(options: {
  guides: ComboGuideFile; cards: ChampionCard[]; patch: string; baseline?: ComboBaseline;
  numericSources?: Record<string, NumericChampion>;
}): ComboReview[] {
  const { guides, cards, patch, baseline } = options;
  if (!/^\d+\.\d+$/.test(patch)) throw new Error("Invalid combo target patch");
  if (guides.schemaVersion === 2 && !baseline) throw new Error("Combo dependency baseline is required");
  if (baseline) validateComboBaseline(guides, baseline);
  const byId = new Map(cards.map(card => [card.id, card]));
  return guides.champions.flatMap(guide => {
    const previous = baseline?.sources[guide.champion];
    const card = byId.get(guide.champion), numeric = options.numericSources?.[guide.champion];
    if (card && previous?.card.numeric && !numeric) throw new Error(`Missing combo numeric source: ${guide.champion}`);
    const current = card && comboSource(card, numeric);
    const changes = previous && current ? sourceChanges(previous.card, current) : [];
    const patterns: Array<ComboPattern | { id: string; text: string; sourceUrl: string }> = [...guide.patterns];
    if (guide.laning) patterns.push({ id: `${guide.champion.toLowerCase()}-web-laning`, ...guide.laning });
    return patterns.map(pattern => {
      const dep = "dependencies" in pattern ? pattern.dependencies : undefined;
      const relevant = changes.filter(change => change.slot === "stats" || change.slot === "source" || !dep || dep.slots.includes(change.slot)
        || !previous?.card.spells.some(spell => spell.slot === change.slot));
      const reasons: string[] = [];
      if (!card) reasons.push("champion-removed");
      if (baseline && baseline.noteHashes[pattern.id] !== comboHash(pattern)) reasons.push("note-edited");
      if (!baseline && card && abilityTextHash(card) !== guide.abilityTextHash) reasons.push("unclassified-source-change");
      reasons.push(...relevant.filter(change => {
        if (dep?.damageNumbers !== "independent") return true;
        return change.sourceKey ? !dep.damageSourceKeys?.includes(change.sourceKey) || change.kind !== "numeric-value"
          : change.kind !== "damage-numbers";
      }).map(change => `${change.slot}:${change.sourceKey ?? change.kind}`));
      return { champion: guide.champion, id: pattern.id,
        status: reasons.length ? "needs-review" : changes.length ? "compatible" : "unchanged",
        reviewedPatch: guide.verifiedPatch ?? guides.patch, reviewedAt: guide.reviewedAt ?? guides.reviewedAt,
        checkedThroughPatch: reasons.length ? null : patch, sourceHash: current ? comboHash(current) : null,
        previousSourceHash: previous?.hash ?? null, reasons, changes: relevant } as ComboReview;
    });
  });
}
