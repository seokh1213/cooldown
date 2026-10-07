import { fnv1a32 } from "./offlineJudge";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { ContextFrame, ContextDecision } from "./contextFrameTypes";
import type { PlanContext } from "./planTypes";
import { buildItemCard } from "./context";
import { canResumeFrame } from "./contextFrameSelection";

const KINDS = ["spell", "stat", "item", "matchup", "champion", "compare", "rule"] as const;
const BUCKETS = 4096;
export const CONTEXT_FEATURE_COUNT = BUCKETS * KINDS.length + 8;
export interface ContextRankModel { featureVersion: 1; weights: number[]; intercept: number; confidence: number; margin: number }

export function contextFeatures(input: ResolvedQuestion, frame: ContextFrame, index: number, frames: ContextFrame[]): Array<[number, number]> {
  const offset = KINDS.indexOf(frame.kind) * BUCKETS;
  const text = `^${input.text.toLowerCase().replace(/\d+(?:\.\d+)?/g, "#").replace(/\s+/g, " ").trim().slice(0, 512)}$`;
  const points = Array.from(text), buckets = new Set<number>();
  for (const size of [1, 2, 3, 4]) for (let start = 0; start + size <= points.length; start++) {
    buckets.add(offset + fnv1a32(points.slice(start, start + size).join("")) % BUCKETS);
  }
  const features: Array<[number, number]> = [...buckets].map(bucket => [bucket, 1 / Math.sqrt(buckets.size)]);
  const base = BUCKETS * KINDS.length;
  const state = frame.state, last = frames[frames.length - 1];
  const targets = state.stat?.champions ?? (state.spell ? [state.spell.champion] : state.champion ? [state.champion]
    : state.matchup ? [state.matchup.mine, state.matchup.enemy] : state.compared ?? []);
  const extras = [Number(frame.key === last.key), (index + 1) / frames.length,
    frames.filter(candidate => candidate.kind === frame.kind).length / frames.length, Number(last.kind === frame.kind),
    Number(input.champions.some(champion => targets.includes(champion.id))),
    Number(input.champions.length > 0 && !input.champions.some(champion => targets.includes(champion.id))),
    Number(Boolean(input.slot && input.slot === state.spell?.slot)), Number(Boolean(input.slot && input.slot !== state.spell?.slot))];
  extras.forEach((value, column) => { if (value) features.push([base + column, value]); });
  return features;
}

export function contextProbability(model: ContextRankModel, features: Array<[number, number]>): number {
  const score = features.reduce((sum, [column, value]) => sum + model.weights[column] * value, model.intercept);
  return 1 / (1 + Math.exp(-score));
}

export function learnedContextRanker(model: ContextRankModel) {
  if (model.featureVersion !== 1 || model.weights.length !== CONTEXT_FEATURE_COUNT
    || !model.weights.every(Number.isFinite) || !Number.isFinite(model.intercept)
    || !Number.isFinite(model.confidence) || !Number.isFinite(model.margin)
    || model.confidence < 0 || model.confidence > 1 || model.margin < 0 || model.margin > 1) throw new Error("Invalid context rank model");
  return (input: ResolvedQuestion, frames: ContextFrame[], ctx: PlanContext): ContextDecision => {
    const keep: ContextDecision = { policy: "learned", action: "keep", candidates: [] };
    if (!frames.length || input.champions.length || input.matchup || buildItemCard(ctx.data!, input.text)) return keep;
    const scores = frames.map((frame, index) => ({ key: frame.key, probability: contextProbability(model, contextFeatures(input, frame, index, frames)) }))
      .sort((a, b) => b.probability - a.probability);
    const [best, second] = scores, latest = frames[frames.length - 1];
    if (best.probability < model.confidence || best.key === latest.key) return { ...keep, scores };
    if (!canResumeFrame(input, frames.find(frame => frame.key === best.key)!, latest)) return { ...keep, scores };
    const candidates = scores.filter(candidate => candidate.probability >= model.confidence).map(candidate => candidate.key);
    if (second && best.probability - second.probability < model.margin) return { policy: "learned", action: "clarify", candidates, scores };
    return { policy: "learned", action: "resume", selected: best.key, candidates, scores };
  };
}
