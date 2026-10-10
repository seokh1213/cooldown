/** 두 패시브의 선택된 규칙을 사람이 출처와 대조한 실험 자료. AI 출력은 여기에 자동 반영하지 않는다. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ChampionCard } from "../../../../src/domain/knowledge/cards/contracts";
import { parseRecord } from "./schema";
import type { MechanicRecord } from "./types";

export const ROOT = path.resolve(import.meta.dirname, "../../../..");
export const PATCH = "26.19";
export const SOURCE_FILE = `dev/research/llm-evals/mechanic-schema/source-cards-${PATCH}.json`;
const cards = (JSON.parse(readFileSync(path.join(ROOT, SOURCE_FILE), "utf8")) as { cards: ChampionCard[] }).cards;
export const sourceCard = (champion: string): ChampionCard => {
  const card = cards.find(card => card.id === champion);
  if (!card) throw new Error(`source card missing: ${champion}`);
  return card;
};
export function fingerprint(card: ChampionCard): string {
  const passive = card.spells.find(spell => spell.slot === "P");
  if (!passive) throw new Error(`passive missing: ${card.id}`);
  return createHash("sha256").update(JSON.stringify({ summary: passive.summary, text: passive.text, crowdControl: passive.crowdControl })).digest("hex");
}
/** 승인 기록의 해시를 현재 원문으로 갱신하지 않는다. 출처 변경은 evaluate에서 재검수로 빠져야 한다. */
export function loadReviewedRecords(): MechanicRecord[] {
  const records: unknown[] = JSON.parse(readFileSync(path.join(ROOT, "dev/research/llm-evals/mechanic-schema/reviewed-records.json"), "utf8"));
  return records.map(parseRecord);
}
