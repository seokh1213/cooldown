/** 현재 앱으로 질문을 계획하고 실제 답 은행과 두 원자 선택 방식을 같은 기억에서 비교한다. */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadData } from "../kev-agent/lib";
import type { AtomFile } from "../build-note-atoms";
import { translations } from "../../../src/i18n/translations";
import { planDialogue } from "../../../src/lib/advisor/dialoguePlanner";
import { assembleDialogueReply } from "../../../src/lib/advisor/dialogueReply";
import { emptyDialogue, type DialogueMemory, type DialogueHistoryTurn } from "../../../src/lib/advisor/dialogueState";
import { buildCompareAnswer } from "../../../src/lib/advisor/answer";
import { matchupNotes } from "../../../src/lib/advisor/playbookNotes";
import { selectMatchupReply, focusOfMatchupTopic } from "../../../src/lib/advisor/matchupReply";
import type { PrecomputedPair } from "../../../src/lib/advisor/precomputed";
import { dialogueAnswerText } from "../../../src/lib/advisor/dialogueReply";
import { selectAtomAnswer, type AtomRequest, type AtomSelection } from "./select";
interface ReplayRow {
  id: string; turn: number; question: string; plan: { mine: string; enemy: string; focus?: string };
  memory: DialogueMemory; current: string; detached: AtomSelection; linked: AtomSelection;
}

const directory = "research/llm-evals/atoms/context-replay";
const data = loadData("ko_KR");
const files = new Map(readdirSync("knowledge/atoms").filter(f => f.endsWith(".json")).map(f => {
  const file = JSON.parse(readFileSync(`knowledge/atoms/${f}`, "utf8")) as AtomFile;
  return [file.champion, file];
}));
const deps = { judge: async () => { throw new Error("선택 방식만 비교하므로 판정 모델은 호출하지 않는다"); }, search: async () => [] };

function bankAnswer(plan: AtomRequest, dialogue: Awaited<ReturnType<typeof planDialogue>>) {
  const path = `public/data/${data.patch}/llm/matchups/${plan.mine.id}.json`;
  const bank = JSON.parse(readFileSync(path, "utf8")) as { pairs: Record<string, PrecomputedPair> };
  const notes = matchupNotes(data, plan.mine, plan.enemy);
  if (notes.plan) { notes.plan.focus = plan.focus as typeof notes.plan.focus; notes.plan.question = plan.question; }
  const answer = buildCompareAnswer([plan.mine, plan.enemy], plan.question, undefined, { matchup: true, notes });
  const sourcePlan = dialogue.parts.find(p => p.plan.type === "matchup")!.plan;
  if (sourcePlan.type !== "matchup") throw new Error("상성 계획 필요");
  const selected = selectMatchupReply(answer, bank.pairs[plan.enemy.id], { ...sourcePlan, question: plan.question, scope: "topic", conditions: plan.memory.conditions, shownTopics: plan.memory.matchup?.shownTopics }, "ko_KR");
  if (plan.memory.matchup) {
    plan.memory.matchup.shownTopics = [...new Set([...(plan.memory.matchup.shownTopics ?? []), ...selected.topics])];
    if (sourcePlan.continuation === "advance" && selected.topics.length) plan.memory.matchup.focus = focusOfMatchupTopic(selected.topics[0]);
  }
  return { text: dialogueAnswerText(selected.answer, "ko_KR"), answer: selected.answer };
}

export async function replayAtoms() {
  const cases = JSON.parse(readFileSync(`${directory}/questions.json`, "utf8")) as Array<{ id: string; turns: string[] }>;
  const rows: ReplayRow[] = [];
  const skipped: Array<{ id: string; turn: number; question: string; plans: string[] }> = [];
  for (const item of cases) {
    let memory: DialogueMemory = emptyDialogue(data.patch);
    const turns: DialogueHistoryTurn[] = [];
    for (const [turn, question] of item.turns.entries()) {
      const ctx = { data, lang: "ko_KR" as const, copy: translations.ko_KR.advisor, championIds: [], turns: [...turns, { role: "assistant" as const, memory }], consented: false, canUseModel: false, retrieval: false, judge: "none" as const };
      const dialogue = await planDialogue(question, ctx, deps, "combined");
      const matchup = dialogue.parts.find(p => p.plan.type === "matchup")?.plan;
      const reply = matchup?.type === "matchup" ? undefined : await assembleDialogueReply(dialogue, data, "ko_KR");
      memory = reply?.memory ?? structuredClone(dialogue.memory);
      let answer = reply?.answer;
      if (matchup?.type === "matchup") {
        const request = { question, mine: matchup.mine, enemy: matchup.enemy, focus: matchup.focus, memory, baseline: "" };
        const baseline = bankAnswer(request, dialogue);
        const current = baseline.text;
        request.baseline = current;
        answer = baseline.answer;
        memory.lastReply = { question, text: current, focus: memory.matchup?.focus };
        rows.push({ id: item.id, turn, question, plan: { mine: matchup.mine.id, enemy: matchup.enemy.id, focus: matchup.focus }, memory: structuredClone(memory), current,
          detached: selectAtomAnswer(data, files, request, "detached"), linked: selectAtomAnswer(data, files, request, "linked") });
      } else skipped.push({ id: item.id, turn, question, plans: dialogue.parts.map(p => p.plan.type) });
      turns.push({ role: "user", content: question }, { role: "assistant", content: memory.lastReply?.text ?? reply?.text ?? "", answer, memory: structuredClone(memory) });
    }
  }
  const summary = Object.fromEntries(["detached", "linked"].map(mode => {
    const selections = rows.map(row => mode === "linked" ? row.linked : row.detached);
    return [mode, { turns: rows.length, sourceSelections: selections.flatMap(s => s.sources).length, ineligibleSourceSelections: selections.flatMap(s => s.sources).filter(s => !s.eligible).length,
      fallbacks: selections.filter(s => s.fallback).length, emptyAnswers: selections.filter(s => !s.text.trim()).length,
      medianCharacters: selections.map(s => s.text.length).sort((a, b) => a - b)[Math.floor(selections.length / 2)] }];
  }));
  return { patch: data.patch, atomPatches: [...new Set([...files.values()].map(f => f.patch))], inference: "none", totalTurns: rows.length + skipped.length, summary, skipped, rows };
}

async function main() {
  const result = await replayAtoms();
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/results.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result.summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
