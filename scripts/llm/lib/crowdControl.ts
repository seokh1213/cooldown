import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SpellCrowdControl } from "../../../src/lib/knowledge/crowdControl";
import type { ChampionCard } from "../../../src/lib/knowledge/facts";
import { inferCrowdControl } from "../../../src/lib/knowledge/crowdControlInference";
import { digestSpellText } from "./spellOverrides";

interface ControlFile {
  patch: string;
  abilities: Record<string, SpellCrowdControl & { textDigest: string; textHash?: string }>;
}
export const crowdControlTextHash = (text: string): string => createHash("sha256").update(text).digest("hex");

export function currentControl(known: ControlFile["abilities"][string] | undefined, source: string, patch: string, reviewedPatch?: string): boolean {
  // Exact full text permits cross-patch reuse; the older numeric-blind digest never does.
  return Boolean(known && (known.textHash ? known.textHash === crowdControlTextHash(source)
    : reviewedPatch === patch && known.textDigest === digestSpellText(source)));
}
/** 변경 없는 전체 원문만 패치를 넘어 재사용한다. 변경된 원문은 추론으로 내려간다. */
export function attachCrowdControl(cards: ChampionCard[], patch: string, koreanCards = cards): void {
  const file = path.resolve("knowledge", "crowd-control.json");
  const input: ControlFile | undefined = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined;
  const korean = new Map(koreanCards.flatMap(card => card.spells.map(spell => [`${card.id}:${spell.slot}`, spell] as const)));
  for (const card of cards) {
    for (const spell of card.spells) {
      const known = input?.abilities[`${card.id}:${spell.slot}`];
      const source = korean.get(`${card.id}:${spell.slot}`) ?? spell;
      const current = currentControl(known, source.text, patch, input?.patch);
      // 영문·중문은 한국어 카드와 동일한 슬롯 메타데이터를 사용한다(본문 지문은 한국어에서 검사).
      spell.crowdControl = current && known ? { status: known.status, effects: known.effects } : inferCrowdControl(source.effects, source.text);
    }
  }
}
