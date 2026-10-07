import fs from "node:fs";
import { loadData } from "../kev-agent/lib";
import type { QualityStory, QualityTurn } from "../quality/types";

const directory = "research/llm-evals/workflow/datasets/context-frames";
const data = loadData("ko_KR");
const distances = [13, 17, 25, 33];
const reserved = new Set(["Garen", "Lux", "Ezreal", "Ahri", "Pyke", "Vladimir"]);
const cards = data.cards.filter(card => !reserved.has(card.id)).sort((a, b) => a.id.localeCompare(b.id));
const spell = (id: string): QualityTurn => ({ q: `${data.cardById.get(id)!.name} Q 쿨타임은?`,
  expected: { context: { kind: "spell", champion: id, slot: "Q" } } });

for (const [index, split] of ["development", "validation"].entries()) {
  const owner = index ? "Lux" : "Garen", other = index ? "Ahri" : "Ezreal";
  const converter = index ? "Vladimir" : "Pyke";
  const amount = index ? 300 : 140;
  const stories: QualityStory[] = [];
  for (const distance of distances) {
    const intervening = cards.slice(index * 40, index * 40 + distance).map(card => ({
      q: `${card.name} 11레벨 마법 저항력은?`,
      expected: { context: { kind: "stat", champions: [card.id], fields: ["magicResist"], level: 11 } },
    }));
    if (intervening.length !== distance) throw new Error("Not enough distinct stress targets");
    const families: Array<[string, QualityTurn[]]> = [
      ["spell-return", [spell(owner), ...intervening, { q: "그 스킬 쿨타임은?",
        expected: { context: { kind: "spell", champion: owner, slot: "Q" } } }]],
      ["conversion-return", [{ q: `${data.cardById.get(converter)!.name} 패시브 추가 체력 ${amount}이면?`,
        expected: { context: { kind: "spell", champion: converter, slot: "P" } } }, ...intervening,
        { q: `아까 패시브에서 추가 체력 ${amount * 2}이면?`,
          expected: { context: { kind: "spell", champion: converter, slot: "P" } } }]],
      ["ambiguous-return", [spell(owner), spell(other), ...intervening,
        { q: "그 스킬 쿨타임은?", expected: { context: { clarify: true } } }]],
      ["evicted-owner", [spell(owner), ...intervening, spell(other),
        { q: "장화 가격은?", expected: { contains: ["300"] } },
        { q: "그 스킬 쿨타임은?", expected: { context: { clarify: true } } }]],
    ];
    for (const [family, turns] of families) stories.push({
      id: `context-stress-${split}-${family}-${distance}`, family, interveningContexts: distance,
      split, suites: ["context-frames-stress"], lang: "ko_KR", turns,
      sources: [{ file: `scripts/llm/context-frames/build-stress.ts`, row: `${split}:${family}:${distance}` }],
    } as QualityStory);
  }
  fs.writeFileSync(`${directory}/stress-${split}.jsonl`, stories.map(story => JSON.stringify(story)).join("\n") + "\n");
  console.log(JSON.stringify({ split, stories: stories.length, turns: stories.reduce((sum, story) => sum + story.turns.length, 0),
    distances, patch: data.patch }));
}
