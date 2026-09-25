/**
 * C2 — kev 가 빼기: 조립 답에서 물음에 도움이 안 되는 줄을 kev-0.8B 가 골라 뺀다. 새 문장은 없다.
 *
 * C·D 맹검에서 조립 답이 가장 크게 잃은 것은 간결(0.25/1)이었다. 채점자 사유는 "맥락 없는 단편",
 * "물음과 무관한 줄", "통째로 붙인 노트". 넣을 것을 고르는 C 는 간결을 못 건드렸다. 여기서는 뺄 것을 고른다.
 *
 *   맨 앞 칸의 첫 줄은 남긴다(물은 것의 답). 나머지 줄마다 kev 에 keep/drop 을 묻고 drop 이 이기면 뺀다.
 *   칸이 비면 칸째 뺀다.
 *
 * 사용: npx tsx scripts/llm/kev-agent/build-c2.ts <cd-answers.json> <out.json>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "../lib/facts";
import { matchupAnswer } from "../lib/matchupEval";
import type { AdvisorAnswer } from "../../../src/lib/advisor/answer";
import type { AdvisorData } from "../../../src/lib/advisor/context";
import { digestSections } from "../../../src/lib/advisor/prose";
import { labelSlots } from "../../../src/lib/advisor/grounding";
import { PATCH, ROOT, kev } from "./lib";

type Compare = Extract<AdvisorAnswer, { kind: "compare" }>;
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const DATA = path.join(ROOT, "public/data", PATCH);
const cards = read<{ cards: ChampionCard[] }>(path.join(DATA, "llm/champion-cards-ko_KR.json")).cards;
const data = {
  cards,
  items: read<{ items: unknown[] }>(path.join(DATA, "items-normalized-ko_KR.json")).items,
  cardById: new Map(cards.map((c) => [c.id, c])),
  playbooks: new Map(Object.entries(read<{ playbooks: Record<string, unknown> }>(path.join(DATA, "llm/advisor-knowledge.json")).playbooks)),
} as unknown as AdvisorData;

export async function prune(answer: Compare, q: string) {
  const [me, enemy] = answer.cards;
  const sections = digestSections(answer, "ko_KR").filter((s) => s.lines.length);
  const dropped: string[] = [];
  const kept = [];
  for (const [si, section] of sections.entries()) {
    const lines: string[] = [];
    for (const [li, line] of section.lines.entries()) {
      if (si === 0 && li === 0) {
        lines.push(line);
        continue;
      }
      const a = await kev(`The user plays ${me.name} against ${enemy.name} and asks: ${q}\nSection: ${section.title}\nSentence: ${line}`, {
        use: {
          type: "choice",
          instructions: "Should this sentence stay in the answer to the user's question?",
          criteria: {
            keep: "Keep: it helps answer this question for this matchup",
            drop: "Drop: off-topic for this question, generic filler, or a fragment that makes no sense alone",
          },
        },
      });
      if (a.use.choice === "drop") dropped.push(line);
      else lines.push(line);
    }
    if (lines.length) kept.push({ ...section, lines });
  }
  const text = kept.map((s) => `**${s.title}**\n${labelSlots(s.lines.join(" "), answer.cards)}`).join("\n\n");
  return { text, dropped };
}

async function main() {
  const [src, out] = process.argv.slice(2);
  const rows = read<Array<{ id: string; q: string; focus: string }>>(src);
  const result = [];
  for (const row of rows) {
    const [a, b] = row.id.split(":");
    const answer = matchupAnswer(data, data.cardById.get(a)!, data.cardById.get(b)!, row.q) as Compare;
    answer.notes!.plan!.focus = row.focus;
    answer.notes!.plan!.question = row.q;
    const { text, dropped } = await prune(answer, row.q);
    result.push({ ...row, C2: text, c2Dropped: dropped });
    console.log(`${result.length}/${rows.length} ${row.id} 뺀 줄 ${dropped.length}`);
  }
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
