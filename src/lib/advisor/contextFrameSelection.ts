import type { ContextBucket, ContextDecision, ContextFrame, ContextPolicy } from "./contextFrameTypes";
import type { PlanContext } from "./planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";
import { buildItemCard } from "./context";
import { detectStats, explicitStatLevel } from "./statQuery";
import { asksMatchup, asksScenarioAdvice, asksWholeKit } from "./askWords";
import { isBasicAttackMechanicQuestion } from "./basicAttackQuestion";
import { conversionAmount } from "./mechanics/question";
import { questionTopic } from "./mechanics/retrieval";

function requestedKind(input: ResolvedQuestion, ctx: PlanContext): ContextFrame["kind"] | undefined {
  const question = input.text;
  if (buildItemCard(ctx.data!, question) || /그\s*(?:아이템|템)|아이템|\bitem\b|装备|가격|골드|\bprice\b|价格/i.test(question)) return "item";
  if (input.slot || isBasicAttackMechanicQuestion(question) || questionTopic(question)
    || conversionAmount(question) !== undefined || /그\s*스킬|패시브|\b(?:cooldown|ability|passive)\b|技能|被动/i.test(question)) return "spell";
  if (detectStats(question).length || explicitStatLevel(question) !== undefined) return "stat";
  if (asksMatchup(question) || asksScenarioAdvice(question)) return "matchup";
  if (asksWholeKit(question)) return "champion";
  return undefined;
}

function targets(frame: ContextFrame): string[] {
  const state = frame.state;
  if (state.stat) return state.stat.champions;
  if (state.spell) return state.compared ?? [state.spell.champion];
  if (state.matchup) return [state.matchup.mine, state.matchup.enemy];
  return state.compared ?? (state.champion ? [state.champion] : []);
}

export function canResumeFrame(input: ResolvedQuestion, frame: ContextFrame, latest: ContextFrame): boolean {
  const reference = /아까|앞서|다시|그\s*(?:스킬|능력|기술|상성|챔피언|스탯)|\b(?:that|earlier|previous|return|back)\b|那个|之前|回到/i.test(input.text);
  if (conversionAmount(input.text) !== undefined && !reference && !input.slot && !input.spellFocus
    && !detectStats(input.text).length && explicitStatLevel(input.text) === undefined
    && !isBasicAttackMechanicQuestion(input.text) && !questionTopic(input.text)) return false;
  const active = targets(latest), prior = targets(frame);
  return !active.length || !prior.length || reference || JSON.stringify(active) === JSON.stringify(prior);
}

export function selectContextFrame(input: ResolvedQuestion, frames: ContextFrame[], ctx: PlanContext,
  history: { pending?: string[]; omitted?: ContextBucket[] } = {}): ContextDecision {
  const { pending = [], omitted = [] } = history;
  const policy: ContextPolicy = ctx.contextPolicy ?? "legacy";
  const keep: ContextDecision = { policy, action: "keep", candidates: [] };
  if (policy === "legacy") return keep;
  if (pending.length && input.champions.length) {
    const matches = frames.filter(frame => pending.includes(frame.key)
      && input.champions.every(champion => targets(frame).includes(champion.id)) && (!input.slot || frame.state.spell?.slot === input.slot));
    if (matches.length === 1) return { policy, action: "resume", selected: matches[0].key, candidates: pending };
    if (matches.length > 1) return { policy, action: "clarify", candidates: matches.map(frame => frame.key) };
  }
  const explicitItem = buildItemCard(ctx.data!, input.text);
  if (!explicitItem && !input.matchup && input.champions.length
    && /(?:아까|이전|앞서).*(?:돌아가|돌아와|다시)|\b(?:return|back)\b|回到/i.test(input.text)) {
    const kind = requestedKind(input, ctx);
    const matching = frames.filter(frame => frame.kind === kind
      && input.champions.every(champion => targets(frame).includes(champion.id))
      && (!input.slot || frame.state.spell?.slot === input.slot));
    if (matching.length === 1) return { policy, action: "resume", selected: matching[0].key, candidates: [matching[0].key] };
    if (matching.length > 1) return { policy, action: "clarify", candidates: matching.map(frame => frame.key) };
  }
  if (explicitItem || input.matchup || input.champions.length) return keep;
  const kind = requestedKind(input, ctx);
  const incomplete = omitted.some(bucket => bucket === kind || kind === "spell"
    && bucket.startsWith("spell:") && (!input.slot || bucket === `spell:${input.slot}`));
  if (!frames.length) return policy === "guarded" && incomplete
    ? { policy, action: "clarify", reason: "evicted", candidates: [] } : keep;
  const latest = frames[frames.length - 1];
  if (policy === "lifo") {
    const previous = ["item", "rule"].includes(latest.kind) ? frames[frames.length - 2] : undefined;
    return previous ? { policy, action: "resume", selected: previous.key, candidates: [previous.key] } : keep;
  }
  if (!kind || latest.kind === kind) return keep;
  const candidates = frames.filter(frame => frame.kind === kind && (!input.slot || frame.state.spell?.slot === input.slot)
    && canResumeFrame(input, frame, latest)).reverse();
  if (policy === "guarded" && incomplete) return { policy, action: "clarify", reason: "evicted", candidates: candidates.map(frame => frame.key) };
  if (!candidates.length) return keep;
  const identities = new Set(candidates.map(frame => JSON.stringify(targets(frame))));
  if (policy === "guarded" && identities.size > 1) return { policy, action: "clarify", candidates: candidates.map(frame => frame.key) };
  return { policy, action: "resume", selected: candidates[0].key, candidates: candidates.map(frame => frame.key) };
}
