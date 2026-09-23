/**
 * 스킬을 슬롯 없이 부르는 노트를 찾는다
 *
 * 상성 답은 노트가 부르는 스킬을 슬롯으로 알아본다("드레이븐 Q" 를 물으면 Q 를 말하는 노트).
 * "도끼를 받으러" 처럼 별명으로만 부르면 어느 스킬인지 코드가 모른다. 노트 본문이 슬롯도
 * 스킬 이름도 부르지 않는 것을 뽑는다.
 *
 * 사용: npx tsx scripts/llm/find-unslotted-notes.ts [--json out.json]
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { loadPlaybooks } from "./lib/playbook";
import type { ChampionCard } from "./lib/facts";

const SKILL_CATEGORIES = new Set(["skill", "combo", "laning", "teamfight", "escape-window"]);
const patch = resolvePatchVersion();
const cards = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] })
  .cards;
const byId = new Map(cards.map((card) => [card.id, card]));

const mode = process.argv.includes("--tokens") ? "tokens" : "exact";

export function namesSkill(text: string, card: ChampionCard): boolean {
  if (/패시브/.test(text)) return true;
  return card.spells.some(
    (spell) =>
      (spell.name.length >= 2 && text.includes(spell.name)) ||
      (mode === "tokens" && spell.name.split(/\s+/).some((word) => word.length >= 2 && text.includes(word))) ||
      new RegExp(`(?<![A-Za-z])${spell.slot}(?=\\s|[은는이가을를로의와과에도만·,.)→]|$)`).test(text),
  );
}

const found: Array<{ champion: string; side: string; id?: string; category: string; text: string }> = [];
for (const [champion, book] of loadPlaybooks()) {
  const card = byId.get(champion);
  if (!card) continue;
  for (const side of ["playing", "against"] as const) {
    for (const entry of book[side]) {
      if (!SKILL_CATEGORIES.has(entry.category) || !entry.text) continue;
      if (!namesSkill(entry.text, card)) found.push({ champion, side, id: entry.id, category: entry.category, text: entry.text });
    }
  }
}
const out = process.argv[process.argv.indexOf("--json") + 1];
if (process.argv.includes("--json") && out) fs.writeFileSync(out, JSON.stringify(found, null, 2));
console.log(`슬롯·스킬 이름 없는 노트 ${found.length}건`);
for (const f of found.slice(0, 400)) console.log(`${f.champion}\t${f.side}\t${f.id}\t${f.text.slice(0, 90)}`);
