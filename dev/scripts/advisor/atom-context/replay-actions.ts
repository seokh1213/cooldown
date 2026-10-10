/** 수정 전 답과 실행 조건 검사 답을 비교한다. 내용 검사에 구현의 스킬 추출기를 사용하지 않는다. */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { translations } from "../../../../src/shared/i18n/translations";
import type { Language } from "../../../../src/shared/i18n";
import { loadData, offlineFileJudge } from "../kev-agent/lib";
import { planDialogue } from "../../../../src/features/advisor/conversation/dialoguePlanner";
import { assembleDialogueReply, dialogueAnswerText } from "../../../../src/features/advisor/conversation/dialogueReply";
import { composeMatchupEvidence, composeMatchupReply } from "../../../../src/features/advisor/answers/matchupReply";
import { conditionMatchupText } from "../../../../src/features/advisor/application/conditionedMatchup";
import type { DialogueHistoryTurn, DialogueMemory } from "../../../../src/features/advisor/conversation/dialogueState";
import type { AnswerPlan } from "../../../../src/features/advisor/contracts/planTypes";
import type { PrecomputedFile } from "../../../../src/features/advisor/retrieval/precomputed";
import { checksFor, matchesTarget } from "../conversational-advisor/score";
import { selectDecisionAnswer } from "./conditional";
import { buildBroadAtoms } from "./broad-build";
import type { AdvisorAnswer } from "../../../../src/features/advisor/answers/answer";

const directory = "dev/research/llm-evals/atoms/action-conditions";
type Mode = "before" | "guarded" | "guardedAtoms";
type MemoryPolicy = "baseline-shared" | "independent";
export interface Question { q: string; want: Record<string, unknown>; must?: string[]; avoid?: string[]; conditions?: Array<["mine" | "enemy", string, "ready" | "down"]> }
export interface Case { id: string; lang?: Language; holdout?: boolean; turns: Question[] }
interface Output {
  text: string; plan: Record<string, unknown>; memory: DialogueMemory; route?: boolean;
  checks: Array<{ label: string; pass: boolean }>; conditions: Array<{ label: string; pass: boolean }>;
  rejected: number; alternatives: number; abstained: boolean;
}
interface Row { id: string; turn: number; question: string; outputs: Record<Mode, Output> }
const modes: Mode[] = ["before", "guarded", "guardedAtoms"];
const json = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const banks = new Map<string, PrecomputedFile>();
const knownFailures: Record<string, RegExp> = {
  "n06:3": /E 매혹(?:을|으로).*?(맞히|맞힙|끊)/s,
  "n07:2": /Q 사형 선고(?:를|로).*?(맞히|맞힙|좁)/s,
  "h03:2": /Q로 각을 잡|Q 강화 평타로 얹|Q로 물러나/s,
  "h04:2": /E 매혹(?:을|으로).*?(맞히|맞힙|끊)/s,
};

export function pairFor(mine: string, enemy: string, lang: Language) {
  const key = `${mine}:${lang}`;
  if (!banks.has(key)) {
    const file = lang === "ko_KR" ? `${mine}.json` : `${mine}.${lang}.json`;
    const bank = json<PrecomputedFile>(`public/data/26.19/llm/matchups/${file}`);
    if (bank.patch !== "26.19") throw new Error(`은행 패치 불일치: ${key}`);
    banks.set(key, bank);
  }
  return banks.get(key)!.pairs[enemy];
}

export function describe(plan: AnswerPlan): Record<string, unknown> {
  if (plan.type === "matchup") return { kind: "matchup", mine: plan.mine.id, enemy: plan.enemy.id, focus: plan.focus };
  if (plan.type === "respond" || plan.type === "retry") return { kind: plan.type };
  if (typeof plan.answer === "string") return { kind: "code" };
  const a = plan.answer;
  if (a.kind === "spell") return { kind: "spell", champion: a.championId, slot: a.spell.slot, spellFocus: a.focus };
  if (a.kind === "champion") return { kind: "champion", champion: a.card.id, focus: a.focus, view: a.view };
  if (a.kind === "compare") return { kind: "compare", champions: a.cards.map(c => c.id), slot: a.slot };
  return { kind: a.kind };
}

export function diagnostics(entry: Question, id: string, turn: number, text: string) {
  const bad = knownFailures[`${id}:${turn}`];
  return [...checksFor(id, turn).map(c => ({ label: c.label, pass: c.test(text) })),
    ...(entry.must ?? []).map(p => ({ label: `필요: ${p}`, pass: new RegExp(p, "s").test(text) })),
    ...(entry.avoid ?? []).map(p => ({ label: `금지: ${p}`, pass: !new RegExp(p, "s").test(text) })),
    ...(bad ? [{ label: "알려진 실행 불가능한 조언", pass: !bad.test(text) }] : [])];
}

function summarize(rows: Row[]) {
  const count = (checks: Array<{ pass: boolean }>) => ({ pass: checks.filter(c => c.pass).length, total: checks.length });
  return Object.fromEntries(modes.map(mode => {
    const outputs = rows.map(r => r.outputs[mode]);
    return [mode, { turns: outputs.length, route: count(outputs.flatMap(o => o.route === undefined ? [] : [{ pass: o.route }])),
      conditions: count(outputs.flatMap(o => o.conditions)), checks: count(outputs.flatMap(o => o.checks)),
      knownFailures: count(outputs.flatMap(o => o.checks.filter(c => c.label === "알려진 실행 불가능한 조언"))),
      rejectedTurns: outputs.filter(o => o.rejected).length, alternativeTurns: outputs.filter(o => o.alternatives).length,
      abstentions: outputs.filter(o => o.abstained).length, empty: outputs.filter(o => !o.text.trim()).length,
      changed: rows.filter(r => r.outputs[mode].text !== r.outputs.before.text).length }];
  }));
}

async function replay(cases: Case[], policy: MemoryPolicy) {
  const { atoms } = buildBroadAtoms();
  const deps = { judge: offlineFileJudge(), search: async () => [] };
  const rows: Row[] = [];
  for (const item of cases) {
    const lang = item.lang ?? "ko_KR";
    const data = loadData(lang);
    const histories = Object.fromEntries(modes.map(mode => [mode, [] as DialogueHistoryTurn[]])) as Record<Mode, DialogueHistoryTurn[]>;
    for (const [turn, entry] of item.turns.entries()) {
      const outputs = {} as Record<Mode, Output>;
      let baselineAnswer: AdvisorAnswer | undefined;
      for (const mode of modes) {
        const turns = histories[policy === "baseline-shared" ? "before" : mode];
        const ctx = { data, lang, copy: translations[lang].advisor, turns, championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" as const };
        const dialogue = await planDialogue(entry.q, ctx, deps, "combined");
        const plan = dialogue.clarification ? { kind: "clarify" } : dialogue.parts.length > 1
          ? { kind: "multi", parts: dialogue.parts.map(p => describe(p.plan)) } : describe(dialogue.parts[0].plan);
        let rejected = 0, alternatives = 0, abstained = false;
        const reply = await assembleDialogueReply(dialogue, data, lang, { matchup: async (source, language, request) => {
          const pair = pairFor(request.mine.id, request.enemy.id, language);
          const baseline = composeMatchupEvidence(source, language, request, pair);
          if (mode === "before") return baseline;
          const baselineText = dialogueAnswerText(baseline.answer, language);
          const checked = conditionMatchupText(source, language, request, baselineText);
          rejected += checked.rejected; alternatives += checked.alternatives; abstained ||= checked.abstained;
          const guarded = composeMatchupReply(source, language, request, pair);
          if (mode !== "guardedAtoms" || language !== "ko_KR" || guarded.answer.kind !== "compare") return guarded;
          const selected = selectDecisionAnswer(source, atoms, { ...request, mine: request.mine.id, enemy: request.enemy.id,
            pair: pair ?? {}, baseline: dialogueAnswerText(guarded.answer, language), memory: { ...dialogue.memory, conditions: request.conditions ?? [] } });
          return { ...guarded, answer: { ...guarded.answer, precomputed: selected.text } };
        } });
        const conditions = (entry.conditions ?? []).map(([owner, slot, status]) => ({ label: `${owner}:${slot}:${status}`,
          pass: reply.memory.conditions.some(c => c.owner === owner && c.slot === slot && c.status === status) }));
        outputs[mode] = { text: reply.text, plan, memory: reply.memory, rejected, alternatives, abstained, conditions,
          route: entry.want.kind === "supported-or-abstain" ? undefined : matchesTarget(plan, entry.want), checks: diagnostics(entry, item.id, turn, reply.text) };
        if (mode === "before") baselineAnswer = reply.answer;
        // 공유 기억에서는 다음 방법이 같은 입력 기억을 쓰도록 before도 모든 방법이 끝난 뒤 추가한다.
        if (policy === "independent") histories[mode].push({ role: "user", content: entry.q }, { role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory });
      }
      if (policy === "baseline-shared") histories.before.push({ role: "user", content: entry.q }, { role: "assistant", content: outputs.before.text, answer: baselineAnswer, memory: outputs.before.memory });
      rows.push({ id: item.id, turn, question: entry.q, outputs });
    }
  }
  return { policy, summary: summarize(rows), regression: summarize(rows.filter(r => !/^[au]/.test(r.id))), fresh: summarize(rows.filter(r => /^[au]/.test(r.id))), rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const holdout = process.argv.includes("--holdout");
  const cases = holdout ? json<Case[]>(`${directory}/holdout.json`) : [
    ...json<Case[]>("dev/research/llm-evals/conversational-advisor/questions.json"),
    ...json<Case[]>("dev/research/llm-evals/atoms/broad-replay/questions.json"), ...json<Case[]>(`${directory}/questions.json`),
  ];
  const results = { patch: "26.19", judge: "offline", generation: "none", conversations: cases.length,
    runs: holdout ? [await replay(cases, "independent")] : [await replay(cases, "baseline-shared"), await replay(cases, "independent")] };
  const output = process.argv.find(a => a.endsWith(".json")) ?? `${directory}/${holdout ? "holdout-results" : "latest-results"}.json`;
  writeFileSync(output, JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results.runs.map(r => ({ policy: r.policy, summary: r.summary, fresh: r.fresh })), null, 2));
}
