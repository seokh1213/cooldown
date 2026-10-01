/** 앱의 대화를 한 경로로 재생한다. 은행·카드를 캐시하고 과거 실행과 변경된 답만 비교한다. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { translations } from "../../../src/i18n/translations";
import { loadData, offlineFileJudge } from "../kev-agent/lib";
import { planDialogue } from "../../../src/lib/advisor/dialoguePlanner";
import { assembleDialogueReply } from "../../../src/lib/advisor/dialogueReply";
import { composeMatchupReply } from "../../../src/lib/advisor/matchupReply";
import type { DialogueHistoryTurn, DialogueMemory } from "../../../src/lib/advisor/dialogueState";
import { matchesTarget } from "../conversational-advisor/score";
import { describe, diagnostics, pairFor, type Case } from "./replay-actions";

const directory = "research/llm-evals/atoms/answer-quality";
const json = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const count = (values: boolean[]) => ({ pass: values.filter(Boolean).length, total: values.length });
interface ReplayRow {
  id: string; turn: number; question: string; text: string; plan: Record<string, unknown>; memory: DialogueMemory;
  milliseconds: number; route?: boolean; checks: Array<{ label: string; pass: boolean }>;
  conditions: Array<{ label: string; pass: boolean }>; previous?: string; changed: boolean;
}

async function run() {
  const args = process.argv.slice(2);
  const fresh = json<Case[]>(`${directory}/questions.json`);
  const cases = args.includes("--fresh") ? fresh : [
    ...json<Case[]>("research/llm-evals/conversational-advisor/questions.json"),
    ...json<Case[]>("research/llm-evals/atoms/broad-replay/questions.json"),
    ...json<Case[]>("research/llm-evals/atoms/action-conditions/questions.json"),
    ...json<Case[]>("research/llm-evals/atoms/action-conditions/holdout.json"), ...fresh,
  ];
  const beforeRoot = args.includes("--before-root") ? args[args.indexOf("--before-root") + 1] : undefined;
  const compose: typeof composeMatchupReply = beforeRoot
    ? (await import(pathToFileURL(resolve(beforeRoot, "src/lib/advisor/matchupReply.ts")).href)).composeMatchupReply : composeMatchupReply;
  const previous = ["reviewed-results", "holdout-results"].flatMap(file => {
    const artifact = json<{ runs: Array<{ policy: string; rows: Array<{ id: string; turn: number; outputs: { guarded: { text: string } } }> }> }>(`research/llm-evals/atoms/action-conditions/${file}.json`);
    return artifact.runs.find(r => r.policy === "independent")!.rows;
  });
  const reference = new Map(previous.map(r => [`${r.id}:${r.turn}`, r.outputs.guarded.text]));
  const deps = { judge: offlineFileJudge(), search: async () => [] };
  const started = performance.now();
  const rows: ReplayRow[] = [];
  for (const item of cases) {
    const lang = item.lang ?? "ko_KR";
    const data = loadData(lang);
    const turns: DialogueHistoryTurn[] = [];
    for (const [turn, entry] of item.turns.entries()) {
      const start = performance.now();
      const ctx = { data, lang, copy: translations[lang].advisor, turns, championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" as const };
      const dialogue = await planDialogue(entry.q, ctx, deps, "combined");
      const reply = await assembleDialogueReply(dialogue, data, lang, { matchup: async (source, language, request) =>
        compose(source, language, request, pairFor(request.mine.id, request.enemy.id, language)) });
      const milliseconds = performance.now() - start;
      const plan = dialogue.clarification ? { kind: "clarify" } : dialogue.parts.length > 1
        ? { kind: "multi", parts: dialogue.parts.map(p => describe(p.plan)) } : describe(dialogue.parts[0].plan);
      const route = entry.want.kind === "supported-or-abstain" ? undefined : matchesTarget(plan, entry.want);
      const conditions = (entry.conditions ?? []).map(([owner, slot, status]) => ({ label: `${owner}:${slot}:${status}`,
        pass: reply.memory.conditions.some(c => c.owner === owner && c.slot === slot && c.status === status) }));
      rows.push({ id: item.id, turn, question: entry.q, text: reply.text, plan, memory: reply.memory, milliseconds, route,
        checks: diagnostics(entry, item.id, turn, reply.text), conditions,
        previous: reference.get(`${item.id}:${turn}`), changed: reference.has(`${item.id}:${turn}`) && reference.get(`${item.id}:${turn}`) !== reply.text });
      turns.push({ role: "user", content: entry.q }, { role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory });
    }
  }
  const durations = rows.map(r => r.milliseconds).sort((a, b) => a - b);
  const group = (selected: typeof rows) => ({ turns: selected.length,
    route: count(selected.flatMap(r => r.route === undefined ? [] : [r.route])),
    checks: count(selected.flatMap(r => r.checks.map(c => c.pass))), conditions: count(selected.flatMap(r => r.conditions.map(c => c.pass))),
    changed: selected.filter(r => r.changed).length, empty: selected.filter(r => !r.text.trim()).length });
  const summary = { total: group(rows), regression: group(rows.filter(r => !r.id.startsWith("q"))), fresh: group(rows.filter(r => r.id.startsWith("q"))),
    time: { totalSeconds: (performance.now() - started) / 1000, medianMs: durations[Math.floor(durations.length / 2)], p95Ms: durations[Math.floor(durations.length * .95)], maxMs: durations.at(-1) } };
  const output = args.find(a => a.endsWith(".json")) ?? `${directory}/latest-results.json`;
  writeFileSync(output, JSON.stringify({ patch: "26.19", judge: "offline", generation: "none", baseline: beforeRoot ? "previous composition, shared current planner" : "saved previous guarded replies", summary, rows }, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
}
await run();
