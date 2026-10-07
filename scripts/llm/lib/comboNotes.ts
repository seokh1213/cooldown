/** 웹에서 확인하고 편집한 콤보를 기존 플레이북 형식으로 묶는다. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { ChampionCard } from "../../../src/lib/knowledge/facts";
import type { ComboGuideFile } from "../../../src/lib/knowledge/comboGuide";
import { renderComboPattern } from "../../../src/lib/knowledge/comboGuide";
import type { PlaybookEntry } from "../../../src/lib/knowledge/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./data";

export function abilityTextHash(card: ChampionCard): string {
  return createHash("sha256").update(JSON.stringify(card.spells.map(({ slot, text }) => ({ slot, text })))).digest("hex");
}

export function loadComboNotes(): Map<string, PlaybookEntry[]> {
  const root = process.cwd();
  const file = path.join(root, "knowledge", "combo-guides.json");
  if (!fs.existsSync(file)) return new Map();
  const guides = JSON.parse(fs.readFileSync(file, "utf8")) as ComboGuideFile;
  if (guides.schemaVersion !== 1) throw new Error("지원하지 않는 콤보 노트 형식");
  const cardFile = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm", "champion-cards-ko_KR.json");
  const cards = (JSON.parse(fs.readFileSync(cardFile, "utf8")) as { cards: ChampionCard[] }).cards;
  return compileComboNotes(guides, cards);
}

export function compileComboNotes(guides: ComboGuideFile, cards: ChampionCard[]): Map<string, PlaybookEntry[]> {
  const byId = new Map(cards.map(card => [card.id, card]));
  const notes = new Map<string, PlaybookEntry[]>();
  for (const guide of guides.champions) {
    const card = byId.get(guide.champion);
    if (!card || abilityTextHash(card) !== guide.abilityTextHash) {
      throw new Error(`${guide.champion} 스킬 본문이 바뀌었습니다. 콤보를 다시 검수하세요.`);
    }
    const entries: PlaybookEntry[] = guide.patterns.map(pattern => ({
      id: pattern.id, category: "combo", text: renderComboPattern(pattern), combo: pattern,
      source: pattern.sourceUrl, verifiedPatch: guide.reviewedPatch ?? guides.patch,
    }));
    if (guide.laning) entries.push({ id: `${guide.champion.toLowerCase()}-web-laning`, category: "laning",
      text: guide.laning.text, source: guide.laning.sourceUrl, verifiedPatch: guide.reviewedPatch ?? guides.patch });
    notes.set(guide.champion, entries);
  }
  return notes;
}
