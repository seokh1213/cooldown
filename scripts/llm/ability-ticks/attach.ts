import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChampionCard } from "../../../src/lib/knowledge/facts";
import type { SpellTicks } from "../../../src/lib/knowledge/abilityTicks";
import { isSpellTicks } from "../../../src/lib/knowledge/abilityTicksValidation";

export interface TickEntry extends SpellTicks { tooltipHash: string }
export interface TickFile { schemaVersion: 1; patch: string; checkedAt: string; abilities: Record<string, TickEntry> }
export const tooltipHash = (text: string) => createHash("sha256").update(text).digest("hex");

export function attachAbilityTicks(cards: ChampionCard[], patch: string, koreanCards = cards,
  file: TickFile = JSON.parse(readFileSync(path.resolve("knowledge/ability-ticks.json"), "utf8"))): void {
  const korean = new Map(koreanCards.flatMap(card => card.spells.map(spell => [`${card.id}:${spell.slot}`, spell] as const)));
  for (const card of cards) {
    for (const spell of card.spells) {
      const entry = file.abilities[`${card.id}:${spell.slot}`];
      const text = korean.get(`${card.id}:${spell.slot}`)?.text;
      const current = file.schemaVersion === 1 && file.patch === patch && text !== undefined
        && entry?.tooltipHash === tooltipHash(text) && isSpellTicks(entry);
      spell.ticks = current ? { status: entry.status, effects: entry.effects, sources: entry.sources, ...(entry.note ? { note: entry.note } : {}) }
        : { status: "unknown", effects: [], sources: [] };
      for (const form of spell.forms ?? []) {
        const effects = spell.ticks.effects.filter(effect => effect.forms?.includes(form.key));
        form.ticks = { ...spell.ticks, effects, status: spell.ticks.status === "known" && !effects.length ? "not_documented" : spell.ticks.status };
      }
    }
  }
}
