/** 실험 분류기의 공통 계산. Node와 브라우저가 같은 특징과 가중치를 사용한다. */
import { nicknameMap } from "../champions/championNames";
export { correctNames } from "../champions/championNames";
import { resolveQuestion } from "../resolvedQuestion";
import { resolveStatQuery } from "../../conversation/planning/dialogueStats";
import type { AdvisorData } from "../../retrieval/context";
import type { DialogueMemory } from "../../conversation/memory/dialogueState";
import type { PlanContext } from "../../contracts/planTypes";
import type { LinearModel } from "./statClassifierTypes";

export { toJamo as jamo } from "../textDistance";
import { toJamo as jamo } from "../textDistance";

export function grams(text: string, bounds: [number, number] = [2, 5]): Map<string, number> {
  const chars = Array.from(text.toLowerCase().replace(/\s{2,}/g, " "));
  const result = new Map<string, number>();
  for (let n = bounds[0]; n <= bounds[1]; n++) {
    for (let i = 0; i + n <= chars.length; i++) {
      const gram = chars.slice(i, i + n).join("");
      result.set(gram, (result.get(gram) ?? 0) + 1);
    }
  }
  return result;
}

export function inputFeatures(question: string, memory: DialogueMemory, data: AdvisorData) {
  const nick = nicknameMap(data);
  const resolved = resolveQuestion(question, data);
  let text = question;
  for (const mention of [...resolved.mentions].sort((a, b) => b.index - a.index)) {
    const aliases = [mention.card.name, ...(data.aliases.get(mention.card.id) ?? []), ...[...nick].filter(([, card]) => card.id === mention.card.id).map(([name]) => name)];
    const name = aliases.sort((a, b) => b.length - a.length).find(alias => text.slice(mention.index).toLowerCase().startsWith(alias.toLowerCase()));
    if (!name) throw Error(`인식한 챔피언 이름 위치를 찾지 못했습니다: ${mention.card.id}`);
    text = text.slice(0, mention.index) + "◇" + text.slice(mention.index + name.length);
  }
  const features: Record<string, number> = { [`active=${memory.active ?? "none"}`]: 1,
    [`names=${Math.min(resolved.champions.length, 2)}`]: 1, [`slot=${Boolean(resolved.slot)}`]: 1 };
  return { text, features };
}

const channelSizes = new WeakMap<LinearModel, number[]>();

export function predict(model: LinearModel, input: { text: string; features: Record<string, number> }) {
  const logits = [...model.bias];
  let sizes = channelSizes.get(model);
  if (!sizes) { sizes = model.channels.map(channel => Object.keys(channel.vocabulary).length); channelSizes.set(model, sizes); }
  let offset = 0;
  for (const [channelIndex, channel] of model.channels.entries()) {
    const counts = channel.kind === "context" ? new Map(Object.entries(input.features)) : grams(channel.kind === "jamo" ? jamo(input.text) : input.text);
    const values = [...counts].flatMap(([key, count]) => {
      const id = channel.vocabulary[key];
      return id === undefined ? [] : [[id, count * (channel.idf?.[id] ?? 1)] as const];
    });
    const norm = channel.idf ? Math.sqrt(values.reduce((sum, [, value]) => sum + value * value, 0)) || 1 : 1;
    for (const [id, value] of values) model.labels.forEach((_, c) => { logits[c] += model.weights[c][offset + id] * value / norm; });
    offset += sizes[channelIndex];
  }
  const maximum = Math.max(...logits);
  const exponentials = logits.map(value => Math.exp(value - maximum));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  const ranking = model.labels.map((label, i) => ({ label, probability: exponentials[i] / total })).sort((a, b) => b.probability - a.probability);
  const accepted = ranking[0].probability >= model.confidence && ranking[0].probability - ranking[1].probability >= model.margin;
  return { label: accepted ? ranking[0].label : "other" as const, top: ranking[0], accepted, probabilities: exponentials.map(value => value / total) };
}

export function queryFor(question: string, memory: DialogueMemory, ctx: PlanContext, label?: ReturnType<typeof predict>["label"]) {
  if (label === "other") return null;
  const field = label === "inherit" ? (memory.active === "stat" || memory.active === "compare") ? memory.stat?.field : undefined : label;
  if (label === "inherit" && !field) return null;
  if (!ctx.data) return null;
  const query = resolveStatQuery(resolveQuestion(question, ctx.data), memory, ctx, field);
  if (query?.kind !== "championStat") return null;
  // 조회의 대상·레벨과 차단 규칙은 공통 코드에서 얻고, 항목은 모델의 판정을 사용한다.
  if (label === "inherit" && memory.stat?.fields) return { ...query, field: memory.stat.field, fields: memory.stat.fields };
  if (!field) return query;
  const single = { ...query, field };
  delete single.fields;
  return single;
}
