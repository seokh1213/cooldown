/** Chrome DevTools에서 실행하는 현행/후보 평가. 실제 앱의 계획·자료·답 은행을 사용한다. */
import { loadAdvisorData } from "../../../../src/features/advisor/retrieval/context";
import { planAnswer, type AnswerPlan, type PlanTurn } from "../../../../src/features/advisor/application/plan";
import { buildCompareAnswer, type AdvisorAnswer } from "../../../../src/features/advisor/answers/answer";
import { matchupNotes } from "../../../../src/features/advisor/retrieval/playbookNotes";
import { loadPrecomputed, precomputedDigest, precomputedMore } from "../../../../src/features/advisor/retrieval/precomputed";
import { answerProse } from "../../../../src/features/advisor/answers/presentation/prose";
import { groundCommentary } from "../../../../src/features/advisor/retrieval/grounding/groundCommentary";
import { MAX_NEW_TOKENS } from "../../../../src/features/advisor/model/config";
import { ruleAnswerText } from "../../../../src/features/advisor/understanding/spells/ruleFocus";
import { translations } from "../../../../src/shared/i18n/translations";
import type { Language } from "../../../../src/shared/i18n";
import { createRuntime, type BrowserRuntime, type CallRecord } from "./runtime";
import { planDialogue, type DialogueVariant } from "../../../../src/features/advisor/conversation/planning/dialoguePlanner";
import { assembleDialogueReply } from "../../../../src/features/advisor/conversation/planning/dialogueReply";
import type { DialogueMemory } from "../../../../src/features/advisor/conversation/memory/dialogueState";
import { acceptedSurface, SURFACE_SYSTEM } from "../../../../src/features/advisor/conversation/planning/dialogueSurface";

export interface QuestionTurn { q: string; want: Record<string, unknown>; checks?: string[] }
export interface QuestionCase { id: string; lang?: Language; holdout?: boolean; turns: QuestionTurn[] }
export interface Result {
  id: string; turn: number; question: string; lang: Language; want: Record<string, unknown>;
  plan: Record<string, unknown>; answer?: AdvisorAnswer; text: string; seconds: number; calls: CallRecord[];
  memory?: DialogueMemory; variant?: string;
  surface?: { raw: string; accepted: boolean; seconds: number };
}

function describe(plan: AnswerPlan): Record<string, unknown> {
  if (plan.type === "matchup") return { kind: "matchup", mine: plan.mine.id, enemy: plan.enemy.id, focus: plan.focus, more: plan.more };
  if (plan.type === "card" || (plan.type === "code" && typeof plan.answer !== "string")) {
    const answer = plan.answer as AdvisorAnswer;
    if (answer.kind === "spell") return { kind: "spell", champion: answer.championId, slot: answer.spell.slot, spellFocus: answer.focus };
    if (answer.kind === "champion") return { kind: "champion", champion: answer.card.id, focus: answer.focus, view: answer.view };
    if (answer.kind === "compare") return { kind: "compare", champions: answer.cards.map(c => c.id), slot: answer.slot };
    return { kind: answer.kind };
  }
  return { kind: plan.type };
}

/** 현행 useAskAdvisor.matchupAnswer와 같은 경로. 기준선 수집 뒤 본문 생성을 공통화한다. */
async function materialize(plan: AnswerPlan, question: string, lang: Language, runtime: BrowserRuntime): Promise<{ answer?: AdvisorAnswer; text: string }> {
  if (plan.type === "matchup") {
    const data = await loadAdvisorData("26.19", lang);
    const notes = matchupNotes(data, plan.mine, plan.enemy, lang);
    if (notes.plan && plan.focus) notes.plan.focus = plan.focus;
    if (notes.plan) notes.plan.question = question;
    const answer = buildCompareAnswer([plan.mine, plan.enemy], question, undefined, { matchup: true, notes, lang });
    if (answer.kind === "compare") {
      answer.more = plan.more || undefined;
      const pair = (await loadPrecomputed(data.patch, plan.mine.id, lang))?.pairs[plan.enemy.id];
      answer.precomputed = pair ? (plan.more ? precomputedMore : precomputedDigest)(pair, notes.plan?.focus, [plan.mine, plan.enemy], lang) : undefined;
    }
    return { answer, text: answerProse(answer, lang) };
  }
  if (plan.type === "retry") throw new Error(`retry must be handled before materialize: ${plan.question}`);
  if (plan.type === "respond") {
    const generated = await runtime.generate(plan.plan.system, question, MAX_NEW_TOKENS);
    return { text: groundCommentary(generated.text, undefined, lang).text };
  }
  const answer = plan.answer;
  if (typeof answer === "string") return { text: answer };
  const prose = answerProse(answer, lang);
  const text = answer.kind === "rule" ? ruleAnswerText(answer.rule, answer.highlighted, lang)
    : answer.kind === "text" ? answer.text
    : answer.kind === "compare" && !prose ? JSON.stringify(answer.rows) : prose;
  return { answer, text };
}

export async function createEvaluation() {
  const runtime = createRuntime();
  const questions = await (await fetch("/research/llm-evals/conversational-advisor/questions.json")).json() as QuestionCase[];
  const results: Result[] = [];
  await runtime.load();

  async function runCase(id: string, variant: "current" | DialogueVariant = "current") {
    const item = questions.find(c => c.id === id);
    if (!item) throw new Error(`unknown case ${id}`);
    const lang = item.lang ?? "ko_KR";
    const data = await loadAdvisorData("26.19", lang);
    const turns: Array<PlanTurn & { content: string; memory?: DialogueMemory }> = [];
    for (const [turn, entry] of item.turns.entries()) {
      const start = performance.now();
      const callStart = runtime.calls.length;
      const ctx = { data, lang, copy: translations[lang].advisor, turns, championIds: [], consented: true, canUseModel: true, retrieval: true, judge: "model" as const };
      let output: { answer?: AdvisorAnswer; text: string; memory?: DialogueMemory };
      let description: Record<string, unknown>;
      if (variant === "current") {
        let plan = await planAnswer(entry.q, ctx, runtime);
        if (plan.type === "retry") plan = await planAnswer(plan.question, ctx, runtime);
        output = await materialize(plan, entry.q, lang, runtime);
        description = describe(plan);
      } else {
        const dialogue = await planDialogue(entry.q, ctx, runtime, variant);
        output = await assembleDialogueReply(dialogue, data, lang);
        description = dialogue.clarification ? { kind: "clarify" } : dialogue.parts.length > 1 ? { kind: "multi", parts: dialogue.parts.map(p => describe(p.plan)) } : describe(dialogue.parts[0].plan);
      }
      turns.push({ role: "user", content: entry.q }, { role: "assistant", content: output.text, answer: output.answer, memory: output.memory });
      const record = { id, turn, question: entry.q, lang, want: entry.want, variant, plan: description, ...output, seconds: (performance.now() - start) / 1000, calls: runtime.calls.slice(callStart) };
      results.push(record);
    }
    return results.filter(r => r.id === id && r.variant === variant).map(({ answer: _answer, ...r }) => r);
  }
  async function runSurface() {
    const base = results.filter(r => r.variant === "memory");
    for (const record of base) {
      if (record.lang !== "ko_KR") { results.push({ ...record, variant: "memory-surface" }); continue; }
      const generated = await runtime.generate(SURFACE_SYSTEM, record.question, 24);
      const prefix = acceptedSurface(generated.text);
      results.push({ ...record, variant: "memory-surface", text: prefix ? `${prefix}\n\n${record.text}` : record.text, surface: { raw: generated.text, accepted: Boolean(prefix), seconds: generated.seconds } });
    }
  }
  return { runtime, questions, results, runCase, runSurface };
}
