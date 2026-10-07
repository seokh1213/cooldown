import { dialogueMemoryOf } from "./dialogueState";
import type { PlanContext, PlanDeps } from "./planTypes";
import { resolveQuestion } from "./resolvedQuestion";
import { frameKey, frameTurnIndex, recordFrame, restoreFrame, usableFrames } from "./contextFrames";
import { selectContextFrame } from "./contextFrameSelection";
import type { ContextDecision, ContextFrame } from "./contextFrameTypes";
import type { answerDialogue } from "./dialogueFlow";

type Output = Awaited<ReturnType<typeof answerDialogue>>;

function clarification(frames: ContextFrame[], ctx: PlanContext): string {
  const names = frames.map(frame => {
    const state = frame.state;
    const ids = state.stat?.champions ?? (state.spell ? [state.spell.champion] : []);
    return ids.map(id => ctx.data!.cardById.get(id)?.name ?? id).join(" / ") + (state.spell ? ` ${state.spell.slot}` : "");
  }).join(" / ");
  if (ctx.lang === "en_US") return `Which earlier topic do you mean: ${names}?`;
  if (ctx.lang === "zh_CN") return `你指的是之前哪个话题：${names}？`;
  return `앞서 다룬 ${names} 중 어느 대상을 말하나요?`;
}

export async function withContextFrames(question: string, ctx: PlanContext, run: (context: PlanContext, input: string) => Promise<Output>, ranker?: PlanDeps["rankContexts"]): Promise<Output> {
  if (!ctx.data) return run(ctx, question);
  const memory = dialogueMemoryOf(ctx.turns, ctx.data);
  const frames = usableFrames(memory, ctx);
  const resolved = resolveQuestion(question, ctx.data);
  const history = { pending: memory.contextPending, omitted: memory.contextOmissions };
  if (ctx.contextPolicy === "learned" && !ranker) throw new Error("Learned context policy requires its ranker");
  const pending = memory.contextPending?.length ? selectContextFrame(resolved, frames, ctx, history) : undefined;
  const decision = pending?.action !== "keep" && pending ? pending : ctx.contextPolicy === "learned"
    ? ranker!(resolved, frames, ctx) : selectContextFrame(resolved, frames, ctx, history);
  if (decision.action === "clarify") {
    const text = decision.reason === "evicted"
      ? ctx.lang === "ko_KR" ? "어느 챔피언의 어떤 스킬·능력치를 말하나요? 챔피언 이름과 항목을 다시 알려주세요."
        : ctx.lang === "en_US" ? "Which champion and ability or stat do you mean? Please name the champion and the topic."
          : "你指的是哪个英雄的哪个技能或属性？请重新指定英雄和项目。"
      : clarification(frames.filter(frame => decision.candidates.includes(frame.key)), ctx);
    memory.contextFrames = frames;
    memory.contextPending = decision.candidates;
    return { dialogue: { parts: [], memory, clarification: text }, reply: { text, memory }, contextDecision: decision };
  }
  const selected = frames.find(frame => frame.key === decision.selected);
  const restored = selected && restoreFrame(selected, ctx);
  const confirmed = selected && memory.contextPending?.includes(selected.key) && resolved.champions.length;
  const input = confirmed ? [...ctx.turns].reverse().find(turn => turn.role === "user")?.content ?? question : question;
  const scoped = selected ? { ...ctx, resumedSpell: restored?.spell, turns: [...ctx.turns.slice(0, frameTurnIndex(selected, ctx) + 1),
    { role: "assistant" as const, memory: { ...restored!, contextFrames: frames } }] } : ctx;
  const result = await run(scoped, input);
  result.reply.memory.contextPending = undefined;
  result.reply.memory.contextOmissions = memory.contextOmissions;
  const rejected = result.dialogue.clarification || result.dialogue.trace?.rejected || result.dialogue.trace?.parts.some(part => part.rejected);
  const changed = frameKey(result.reply.memory) !== frameKey(memory) || result.dialogue.parts.some(part => part.plan.type === "card" || part.plan.type === "matchup"
    || part.plan.type === "code" && typeof part.plan.answer === "string" && part.plan.knowledge);
  if (rejected || !changed) result.reply.memory.contextFrames = frames;
  else recordFrame(result.reply.memory, frames, Math.max(ctx.turns.length + 1, ...frames.map(frame => frame.turn + 1)), ctx.contextLimit);
  return { ...result, contextDecision: decision };
}

export type ContextOutput = Output & { contextDecision?: ContextDecision };
