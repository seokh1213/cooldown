/**
 * 평가 30문항의 칸마다 원자 선별 선택 문제를 짓는다 — 판정 헤드가 점수를 매길 입력
 *
 * 학습 자료(build-atom-pick-data)와 같은 요청 꼴(pickRecord)이다. 정답은 없다(label 0 으로 채운다).
 * _meta 에 문항·칸·후보 문장을 남겨, 점수를 받은 뒤 eval-connector 의 atoms-kev 판이 고른다.
 *
 * 사용: npx tsx scripts/llm/atom-pick-eval-records.ts <out.jsonl>
 */
import * as fs from "fs";
import type { ChampionCard } from "./lib/facts";
import type { MatchupNotes } from "../../src/lib/advisor/answer";
import type { Playbook } from "./lib/playbookCore";
import { atomCandidates, eligibleNotes } from "./lib/atomAssembly";
import { connectorAnswer, connectorData } from "./build-connector-data";
import { pickRecord, MAX_OPTIONS } from "./build-atom-pick-data";
import { evalItems, focusOf } from "./eval-connector";
import type { AtomFile } from "./build-note-atoms";

const out = process.argv[2];
const atoms = (id: string): AtomFile | undefined =>
  fs.existsSync(`knowledge/atoms/${id}.json`) ? (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile) : undefined;
const lines: string[] = [];
for (const item of evalItems()) {
  const me = connectorData.cardById.get(item.me) as ChampionCard;
  const enemy = connectorData.cardById.get(item.enemy) as ChampionCard;
  const answer = connectorAnswer(me, enemy, item.question);
  const plan = (answer.notes as MatchupNotes | undefined)?.plan;
  if (plan) plan.focus = focusOf(item.question);
  const eligible = eligibleNotes(connectorData.playbooks as unknown as Map<string, Playbook>, me, enemy);
  for (const section of atomCandidates(answer, atoms(me.id), atoms(enemy.id), true, eligible)) {
    if (section.candidates.length < 2) continue;
    lines.push(
      JSON.stringify({
        ...pickRecord(item.question, me, enemy, section, 0),
        _meta: { item: item.id, section: section.key, texts: section.candidates.slice(0, MAX_OPTIONS).map((c) => c.text) },
      }),
    );
  }
}
fs.writeFileSync(out, lines.join("\n") + "\n");
console.log(`${lines.length}칸 → ${out}`);
