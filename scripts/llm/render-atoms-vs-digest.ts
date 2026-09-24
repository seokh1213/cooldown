/**
 * 원자 조립(fullall)과 노트 조립(digestSections)을 같은 문항에서 떠 둔다(맹검용).
 *
 * 문항: eval-connector 의 30개 + FOCUSED·FOCUSED_HOLDOUT·FOCUSED_HOLDOUT2 중 두 챔피언 모두
 * 원자가 있는 것. 판마다 같은 답(connectorAnswer)에서 조립만 바꾼다.
 */
import * as fs from "fs";
import type { ChampionCard } from "./lib/facts";
import type { MatchupNotes } from "../../src/lib/advisor/answer";
import { matchupDigest } from "../../src/lib/advisor/prose";
import { connectorAnswer, connectorData } from "./build-connector-data";
import { atomSections, eligibleNotes, renderSections, type Candidate } from "./lib/atomAssembly";
import type { AtomFile } from "./build-note-atoms";
import type { Playbook } from "./lib/playbookCore";
import { evalItems, focusOf } from "./eval-connector";
import { FOCUSED, FOCUSED_HOLDOUT, FOCUSED_HOLDOUT2 } from "./lib/matchupEval";

const atoms = (id: string): AtomFile | undefined =>
  fs.existsSync(`knowledge/atoms/${id}.json`) ? (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile) : undefined;
const playbooks = connectorData.playbooks as unknown as Map<string, Record<string, Array<{ id: string; text: string }>>>;

const items = [
  ...evalItems().map((item) => ({ ...item, focus: focusOf(item.question), set: "connector" })),
  ...[...FOCUSED, ...FOCUSED_HOLDOUT, ...FOCUSED_HOLDOUT2].map(([me, enemy, focus, question], i) => ({ id: `f${i}`, me, enemy, question, focus, set: "focused" })),
].filter((item) => atoms(item.me) && atoms(item.enemy));

const answerOf = (item: (typeof items)[number]) => {
  const me = connectorData.cardById.get(item.me) as ChampionCard;
  const enemy = connectorData.cardById.get(item.enemy) as ChampionCard;
  const answer = connectorAnswer(me, enemy, item.question);
  const plan = (answer.notes as MatchupNotes | undefined)?.plan;
  if (plan) {
    plan.focus = item.focus;
    plan.question = item.question;
  }
  return { me, enemy, answer };
};

/** eval-connector 의 atoms-v:fullall 과 같은 규칙 */
function fullall(item: (typeof items)[number]): string {
  const { me, enemy, answer } = answerOf(item);
  const noteText = (source: string) => {
    const id = source.slice("playbook:".length);
    for (const [champ, side] of [[item.me, "playing"], [item.enemy, "against"]] as const) {
      const found = (playbooks.get(champ)?.[side] ?? []).find((n) => n.id === id);
      if (found) return found.text;
    }
    return undefined;
  };
  let first = true;
  const pick = (_key: string, candidates: Candidate[], size: number): Candidate[] => {
    const picked = candidates.slice(0, size);
    if (first) {
      first = false;
      for (const [i, c] of picked.entries()) {
        if (!c.atom) continue;
        const full = noteText(c.atom.source);
        if (full) picked[i] = { ...c, text: full };
      }
    }
    return picked;
  };
  const eligible = eligibleNotes(connectorData.playbooks as unknown as Map<string, Playbook>, me, enemy);
  return renderSections(atomSections(answer as never, atoms(item.me), atoms(item.enemy), pick, true, eligible), answer as never);
}

const out = items.map((item) => ({
  id: item.id,
  set: item.set,
  focus: item.focus,
  question: item.question,
  ours: matchupDigest(answerOf(item).answer as never, "ko_KR", "focus-cue-all"),
  oursGeneral: matchupDigest(answerOf(item).answer as never, "ko_KR", "cue-all-general"),
  fullall: fullall(item),
}));
fs.writeFileSync(process.argv[2] ?? "atoms-vs-digest.json", JSON.stringify(out, null, 2));
console.log(`문항 ${out.length} (connector ${out.filter((x) => x.set === "connector").length} · focused ${out.filter((x) => x.set === "focused").length})`);
