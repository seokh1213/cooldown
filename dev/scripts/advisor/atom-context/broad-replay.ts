/** 모든 하위 질문을 앱 조립기로 재생한다. 원자 후보들은 현행 기억에서 본문 선택만 비교한다. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Language } from "../../../../src/shared/i18n";
import { translations } from "../../../../src/shared/i18n/translations";
import { loadData, offlineFileJudge } from "../kev-agent/lib";
import type { AtomFile } from "../knowledge/build-note-atoms";
import { planDialogue } from "../../../../src/features/advisor/conversation/planning/dialoguePlanner";
import { assembleDialogueReply, dialogueAnswerText } from "../../../../src/features/advisor/conversation/planning/dialogueReply";
import { composeMatchupEvidence as composeMatchupReply } from "../../../../src/features/advisor/answers/builders/matchupReply";
import { emptyDialogue, type DialogueHistoryTurn, type DialogueMemory } from "../../../../src/features/advisor/conversation/memory/dialogueState";
import type { AnswerPlan } from "../../../../src/features/advisor/contracts/planTypes";
import type { PrecomputedFile, PrecomputedPair } from "../../../../src/features/advisor/retrieval/precomputed";
import { matchesTarget, checksFor } from "../conversational-advisor/score";
import { selectAtomAnswer } from "./select";
import { selectDecisionAnswer } from "./conditional";
import { buildBroadAtoms, broadDirectory } from "./broad-build";

interface Question {
  q: string; want: Record<string, unknown>; must?: string[]; avoid?: string[];
  conditions?: Array<["mine" | "enemy", string, "ready" | "down"]>;
}
interface Case { id: string; lang?: Language; category?: string; holdout?: boolean; turns: Question[] }
type Mode = "current" | "detached" | "linked" | "conditional";
interface PartSelection {
  mine: string; enemy: string; focus?: string; question: string;
  changed: boolean; atom?: string; fallback?: string; sources?: Array<{ key: string; eligible: boolean }>;
}
interface Output { text: string; parts: PartSelection[] }
interface Row {
  id: string; turn: number; question: string; lang: Language; suite: string; category?: string; holdout: boolean;
  want: Question["want"]; plan: Record<string, unknown>; route: boolean; memory: DialogueMemory;
  conditions: Array<{ label: string; pass: boolean }>;
  outputs: Record<Mode, Output & { checks: Array<{ label: string; pass: boolean }> }>;
}
const modes: Mode[] = ["current", "detached", "linked", "conditional"];
const banks = new Map<string, PrecomputedFile>();

function pairFor(mine: string, enemy: string, lang: Language): PrecomputedPair | undefined {
  const key = `${mine}:${lang}`;
  if (!banks.has(key)) {
    const file = lang === "ko_KR" ? `${mine}.json` : `${mine}.${lang}.json`;
    const bank = JSON.parse(readFileSync(`public/data/26.19/llm/matchups/${file}`, "utf8")) as PrecomputedFile;
    if (bank.patch !== "26.19") throw new Error(`은행 패치 불일치: ${key}`);
    banks.set(key, bank);
  }
  return banks.get(key)!.pairs[enemy];
}

function describe(plan: AnswerPlan): Record<string, unknown> {
  if (plan.type === "matchup") return { kind: "matchup", mine: plan.mine.id, enemy: plan.enemy.id, focus: plan.focus };
  if (plan.type === "respond" || plan.type === "retry") return { kind: plan.type };
  if (typeof plan.answer === "string") return { kind: "code" };
  const answer = plan.answer;
  if (answer.kind === "spell") return { kind: "spell", champion: answer.championId, slot: answer.spell.slot, spellFocus: answer.focus };
  if (answer.kind === "champion") return { kind: "champion", champion: answer.card.id, focus: answer.focus, view: answer.view };
  if (answer.kind === "compare") return { kind: "compare", champions: answer.cards.map(c => c.id), slot: answer.slot };
  return { kind: answer.kind };
}

function diagnostics(item: { entry: Question; id: string; turn: number }, text: string) {
  return [
    ...checksFor(item.id, item.turn).map(c => ({ label: c.label, pass: c.test(text) })),
    ...(item.entry.must ?? []).map(pattern => ({ label: `필요: ${pattern}`, pass: new RegExp(pattern, "s").test(text) })),
    ...(item.entry.avoid ?? []).map(pattern => ({ label: `금지: ${pattern}`, pass: !new RegExp(pattern, "s").test(text) })),
  ];
}

function summary(rows: Row[]) {
  const count = (checks: Array<{ pass: boolean }>) => ({ pass: checks.filter(c => c.pass).length, total: checks.length });
  return {
    turns: rows.length, conversations: new Set(rows.map(r => r.id)).size,
    route: count(rows.map(r => ({ pass: r.route }))), conditions: count(rows.flatMap(r => r.conditions)),
    methods: Object.fromEntries(modes.map(mode => {
      const outputs = rows.map(row => row.outputs[mode]);
      const parts = outputs.flatMap(output => output.parts);
      const lengths = outputs.map(o => o.text.length).sort((a, b) => a - b);
      return [mode, { checks: count(outputs.flatMap(o => o.checks)),
        allChecksPass: outputs.filter(o => o.checks.length && o.checks.every(c => c.pass)).length,
        checkedTurns: outputs.filter(o => o.checks.length).length,
        changedTurns: rows.filter(r => r.outputs[mode].text !== r.outputs.current.text).length,
        selectedParts: parts.filter(p => p.changed).length,
        ineligibleSources: parts.flatMap(p => p.sources ?? []).filter(s => !s.eligible).length,
        fallbacks: Object.fromEntries([...new Set(parts.map(p => p.fallback).filter(Boolean))].map(f => [f, parts.filter(p => p.fallback === f).length])),
        emptyAnswers: outputs.filter(o => !o.text.trim()).length, medianCharacters: lengths[Math.floor(lengths.length / 2)] }];
    })),
  };
}

export async function runBroadReplay() {
  const cases = [
    ...JSON.parse(readFileSync("dev/research/llm-evals/conversational-advisor/questions.json", "utf8")) as Case[],
    ...JSON.parse(readFileSync(`${broadDirectory}/questions.json`, "utf8")) as Case[],
  ];
  const files = new Map(readdirSync("dev/data/knowledge/atoms").filter(f => f.endsWith(".json")).map(f => {
    const file = JSON.parse(readFileSync(`dev/data/knowledge/atoms/${f}`, "utf8")) as AtomFile;
    return [file.champion, file] as const;
  }));
  const { atoms } = buildBroadAtoms();
  const deps = { judge: offlineFileJudge(), search: async () => [] };
  const rows: Row[] = [];
  for (const item of cases) {
    const lang = item.lang ?? "ko_KR";
    const data = loadData(lang);
    const turns: DialogueHistoryTurn[] = [];
    for (const [turn, entry] of item.turns.entries()) {
      const ctx = { data, lang, copy: translations[lang].advisor, turns, championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" as const };
      const dialogue = await planDialogue(entry.q, ctx, deps, "combined");
      const plan = dialogue.clarification ? { kind: "clarify" } : dialogue.parts.length > 1
        ? { kind: "multi", parts: dialogue.parts.map(p => describe(p.plan)) } : describe(dialogue.parts[0].plan);
      const outputs = {} as Row["outputs"];
      let baselineMemory = emptyDialogue(data.patch);
      let baselineAnswer;
      for (const mode of modes) {
        const parts: PartSelection[] = [];
        const reply = await assembleDialogueReply(dialogue, data, lang, { matchup: async (source, language, request) => {
          const pair = pairFor(request.mine.id, request.enemy.id, language);
          const baseline = composeMatchupReply(source, language, request, pair);
          const text = dialogueAnswerText(baseline.answer, language);
          const memory = { ...structuredClone(dialogue.memory), conditions: request.conditions ?? [] };
          const input = { ...request, memory, baseline: text };
          const inScope = language === "ko_KR" && request.continuation !== "advance" && ["skill", "general", "escape-window", "combo"].includes(request.focus ?? "general");
          const selected = mode === "current" ? { text } : !inScope ? { text, fallback: "scope" }
            : mode === "conditional" ? selectDecisionAnswer(source, atoms, { ...input, mine: request.mine.id, enemy: request.enemy.id, pair: pair ?? {} })
            : selectAtomAnswer(source, files, input, mode);
          parts.push({ mine: request.mine.id, enemy: request.enemy.id, focus: request.focus, question: request.question,
            changed: selected.text !== text, ...("atom" in selected ? { atom: selected.atom } : {}),
            ...("fallback" in selected ? { fallback: selected.fallback } : {}), ...("sources" in selected ? { sources: selected.sources } : {}) });
          return { ...baseline, answer: baseline.answer.kind === "compare" ? { ...baseline.answer, precomputed: selected.text } : baseline.answer };
        } });
        outputs[mode] = { text: reply.text, parts, checks: diagnostics({ entry, id: item.id, turn }, reply.text) };
        if (mode === "current") { baselineMemory = reply.memory; baselineAnswer = reply.answer; }
      }
      const conditions = (entry.conditions ?? []).map(([owner, slot, status]) => ({
        label: `${owner} ${slot} ${status}`, pass: baselineMemory.conditions.some(c => c.owner === owner && c.slot === slot && c.status === status)
          && !baselineMemory.conditions.some(c => c.owner === owner && c.slot === slot && c.status !== status),
      }));
      const route = entry.want.kind === "supported-or-abstain" ? outputs.current.checks.every(c => c.pass) : matchesTarget(plan, entry.want);
      rows.push({ id: item.id, turn, question: entry.q, lang, suite: /^[nh]/.test(item.id) ? "new" : "regression", category: item.category,
        holdout: item.holdout ?? false, want: entry.want, plan, route, memory: structuredClone(baselineMemory), conditions, outputs });
      turns.push({ role: "user", content: entry.q }, { role: "assistant", content: outputs.current.text, answer: baselineAnswer, memory: baselineMemory });
    }
  }
  return { patch: "26.19", judge: "offline", generation: "none", memoryPolicy: "baseline-shared", atoms: atoms.length,
    summary: summary(rows), newQuestions: summary(rows.filter(r => r.suite === "new")), regression: summary(rows.filter(r => r.suite === "regression")),
    holdout: summary(rows.filter(r => r.holdout)), rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runBroadReplay();
  const output = process.argv[2] ?? `${broadDirectory}/latest-results.json`;
  writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify({ all: result.summary, newQuestions: result.newQuestions, holdout: result.holdout }, null, 2));
}
