import { matchesTarget, checksFor, memoryChecks } from "../conversational-advisor/score";
import type { Result } from "../conversational-advisor/browser";
import { grade as schemaGrade, type Case as SchemaCase } from "../mechanic-schema/cases";
import { translateStat } from "../../../src/lib/advisor/promptLocale";
import { answerChampionIds, type AdvisorAnswer } from "../../../src/lib/advisor/answer";
import type { PlanContext, AnswerPlan } from "../../../src/lib/advisor/planTypes";
import type { StatName } from "../../../src/lib/knowledge/facts";
import type { QualityStory, Check } from "./types";
import { isDeepStrictEqual } from "node:util";
import { statFields, validStatFields, type ChampionStatQuery } from "../../../src/lib/advisor/statQuery";
import { buildItemCard } from "../../../src/lib/advisor/context";

export function routeCheck(input: { output: Output; ctx: PlanContext; expected: Record<string, unknown> }): Check[] {
  const kind = deliveredRoute(input.output, input.ctx);
  return [{ label: "route-kind", pass: input.expected.coarseOther ? !["matchup", "guide", "skills", "spellStat"].includes(kind)
    : kind === input.expected.routeGold }];
}

function deliveredRoute(output: Output, ctx: PlanContext): string {
  const plan = output.dialogue.parts[0]?.plan;
  if (!plan) return "other";
  if (plan.type === "matchup") return "matchup";
  const answer = plan.type === "card" || plan.type === "code" ? plan.answer : undefined;
  if (answer && typeof answer !== "string") {
    if (answer.kind === "item") return "item";
    if (answer.kind === "rule") return answer.rule.subject === "summoner" ? "spell" : answer.rule.subject === "gameplay" ? "game" : "rune";
    if (answer.kind === "spell") return "spellStat";
    if (answer.kind === "champion") return answer.view === "skills" ? "skills" : answer.focus || answer.statQuery ? "spellStat" : "guide";
    if (answer.kind === "compare") return answer.matchup ? "matchup" : answer.slot || answer.statQuery ? "spellStat" : "skills";
  }
  if (plan.type === "code" && plan.knowledge) {
    if (plan.controlContext && ctx.data && buildItemCard(ctx.data, output.dialogue.parts[0].question)) return "item";
    if (plan.knowledge.context?.champions.length === 1 && plan.knowledge.context.slot) return "spellStat";
    if (plan.knowledge.id.startsWith("meta:") || plan.knowledge.id.startsWith("mech:")) return "game";
    const rule = [...new Set(ctx.data?.ruleIndex.values())].find(rule => `rule:${rule.name}` === plan.knowledge!.id);
    if (rule) return rule.subject === "summoner" ? "spell" : rule.subject === "gameplay" ? "game" : "rune";
  }
  if (plan.controlContext?.champions.length) return ctx.data && buildItemCard(ctx.data, output.dialogue.parts[0].question) ? "item" : "spellStat";
  const text = output.reply.text;
  return [ctx.copy.smallTalk, ctx.copy.identity].includes(text) ? "chat" : "other";
}

export function sameStatQuery(actual: ChampionStatQuery | undefined, expected: unknown): boolean {
  if (!actual || !expected) return (actual ?? null) === expected;
  const wanted = expected as ChampionStatQuery;
  return validStatFields(actual) && validStatFields(wanted) && actual.kind === wanted.kind
    && actual.level === wanted.level && isDeepStrictEqual(actual.champions, wanted.champions)
    && isDeepStrictEqual(statFields(actual), statFields(wanted));
}

type Output = Awaited<ReturnType<typeof import("../../../src/lib/advisor/dialogueFlow").answerDialogue>>;
export function describe(plan: AnswerPlan): Record<string, unknown> {
  if (plan.type === "matchup") return { kind: "matchup", mine: plan.mine.id, enemy: plan.enemy.id, focus: plan.focus, topic: plan.focus, more: plan.more };
  if (plan.type !== "card" && (plan.type !== "code" || typeof plan.answer === "string")) return { kind: plan.type };
  const answer = plan.answer;
  if (typeof answer === "string") return { kind: "code" };
  if (answer.kind === "spell") return { kind: "spell", champion: answer.championId, slot: answer.spell.slot, spellFocus: answer.focus };
  if (answer.kind === "champion") return { kind: "champion", champion: answer.card.id, focus: answer.focus, view: answer.view };
  if (answer.kind === "compare") return { kind: "compare", champions: answer.cards.map(card => card.id), slot: answer.slot };
  return { kind: answer.kind };
}

export function scopeMatches(answer: AdvisorAnswer | undefined, scope: string): boolean {
  if (scope === "overview" || scope === "skills") return answer?.kind === "champion" && answer.view === scope;
  if (scope === "statsAll") return answer?.kind === "compare" && Boolean(answer.statQuery && (answer.statQuery.fields ?? [answer.statQuery.field]).length === 7);
  if (scope === "stats") return Boolean((answer?.kind === "compare" || answer?.kind === "champion") && answer.statQuery
    && statFields(answer.statQuery).length === 1 && statFields(answer.statQuery)[0] === "attackSpeed");
  if (scope === "combo") return answer?.kind === "champion" && answer.notes?.topic === "combo";
  if (scope === "counterplay") return answer?.kind === "champion" && answer.notes?.perspective === "against";
  if (scope === "against") return Boolean(answer?.kind === "champion" && answer.notes?.perspective === "against"
    || answer?.kind === "compare" && answer.matchup && answer.cards[1]?.id === "Fiora");
  if (/^[PQWER]$/.test(scope)) return answer?.kind === "spell" && answer.spell.slot === scope;
  return false;
}

export function observedAnswer(answer: AdvisorAnswer | undefined): Record<string, unknown> | undefined {
  if (!answer) return undefined;
  if (answer.kind === "champion") return { kind: answer.kind, card: { id: answer.card.id }, view: answer.view,
    statQuery: answer.statQuery, notes: answer.notes && { topic: answer.notes.topic, perspective: answer.notes.perspective } };
  if (answer.kind === "compare") return { kind: answer.kind, cards: answer.cards.map(card => ({ id: card.id })),
    matchup: answer.matchup, statQuery: answer.statQuery };
  if (answer.kind === "spell") return { kind: answer.kind, championId: answer.championId, spell: { slot: answer.spell.slot } };
  return { kind: answer.kind };
}

function numericStatChecks(expected: Record<string, unknown>, answers: AdvisorAnswer[], ctx: PlanContext, text: string): Check[] {
  const entries = expected.stats as Array<{ fields: StatName[]; targets: string[]; level: 1 | 6 | 11 | 18 }> | undefined;
  return (entries ?? []).map(entry => ({ label: "stats/facts", pass: answers.some(answer => {
    if (!("statQuery" in answer) || !answer.statQuery) return false;
    const query = answer.statQuery;
    if (JSON.stringify([query.champions, query.level, query.fields ?? [query.field]]) !== JSON.stringify([entry.targets, entry.level, entry.fields])) return false;
    const headlines = answer.kind === "compare" ? answer.headlines ?? (answer.headline ? [answer.headline] : [])
      : answer.kind === "champion" && answer.headline ? [answer.headline] : [];
    return entry.fields.every(field => headlines.some(fact => fact.label.includes(translateStat(field, ctx.lang)) && text.includes(fact.label) && text.includes(fact.value))
      && entry.targets.every(id => text.includes(String(ctx.data!.cardById.get(id)!.stats[field][`lv${entry.level}`]))));
  }) }));
}

export function gradeTurn(input: { story: QualityStory; turn: number; output: Output; ctx: PlanContext }): Check[] {
  const { story, turn, output, ctx } = input, expected = story.turns[turn].expected;
  const { dialogue, reply } = output, text = reply.text;
  const checks: Check[] = [];
  const add = (label: string, pass: unknown) => checks.push({ label, pass: Boolean(pass) });
  const patterns = (key: string, forbidden: boolean, regex: boolean) => {
    for (const pattern of expected[key] as string[] ?? []) add(`${key}:${pattern}`,
      (regex ? new RegExp(pattern, "i").test(text) : text.includes(pattern)) !== forbidden);
  };
  patterns("contains", false, false); patterns("must", false, true); patterns("require", false, true);
  patterns("avoid", true, story.suites.some(suite => suite.startsWith("atoms/"))); patterns("forbid", true, true);
  const description = dialogue.clarification ? { kind: "clarify" } : dialogue.parts.length > 1
    ? { kind: "multi", parts: dialogue.parts.map(part => describe(part.plan)) } : dialogue.parts[0] ? describe(dialogue.parts[0].plan) : { kind: "empty" };
  const pairs = dialogue.parts.flatMap(part => part.matchup ? [[part.matchup.mine, part.matchup.enemy]] : []);
  const answers = reply.answers ?? (reply.answer ? [reply.answer] : []);
  if (expected.want) {
    const want = expected.want as Record<string, unknown>;
    const content = checksFor(story.sources[0].row, turn).map(check => ({ label: check.label, pass: check.test(text) }));
    add("target", want.kind === "supported-or-abstain" ? content.every(check => check.pass) : matchesTarget(description, want));
    if (story.suites.includes("conversational-advisor/questions")) {
      checks.push(...content, ...memoryChecks({ id: story.sources[0].row, turn, memory: reply.memory } as Result));
    }
  }
  if (expected.pairs) add("pairs", JSON.stringify(pairs) === JSON.stringify(expected.pairs));
  if (expected.memoryPair) add("memory-pair", isDeepStrictEqual(expected.memoryPair,
    reply.memory.matchup && [reply.memory.matchup.mine, reply.memory.matchup.enemy]));
  if (expected.parts) add("parts", dialogue.parts.length === expected.parts);
  if (expected.targets) add("targets", JSON.stringify(reply.answer ? answerChampionIds(reply.answer) : []) === JSON.stringify(expected.targets));
  const query = reply.answer && "statQuery" in reply.answer ? reply.answer.statQuery : undefined;
  if (expected.stat) add("stat", query?.field === expected.stat);
  if ("statQuery" in expected) add("statQuery", sameStatQuery(query, expected.statQuery));
  if (expected.kind || expected.answerKind) add("kind", reply.answer?.kind === (expected.kind ?? expected.answerKind));
  if (expected.itemId) add("item-id", reply.answer?.kind === "item" && reply.answer.itemId === expected.itemId);
  if (expected.replyScope) add("replyScope", scopeMatches(reply.answer, String(expected.replyScope)));
  if (expected.guidance) add("guidance", /예:/.test(text));
  if (expected.guide) add("guide", !pairs.length && !(reply.answer ? answerChampionIds(reply.answer) : []).length && text.length > 35
    && /예:|example|예시|예를|Try|例如/.test(text) && /줄|범위|확인|못|어느|누구|챔피언|어려|보장/.test(text));
  checks.push(...numericStatChecks(expected, answers, ctx, text));
  for (const [id, slot, focus] of expected.spells as string[][] ?? []) add("spell/fact", answers.some(answer => answer.kind === "spell"
    && answer.championId === id && answer.spell.slot === slot && answer.focus === focus && Boolean(answer.headline)
    && text.includes(answer.headline!.value) && answer.headline!.value.includes(focus === "range"
      ? String(Array.isArray(answer.spell.range) ? answer.spell.range.join("/") : answer.spell.range) : answer.spell.recharge ?? answer.spell.cooldown ?? "missing")));
  for (const condition of expected.conditions as string[][] ?? []) {
    const [mine, enemy, owner, slot, status] = condition.length === 5 ? condition : [undefined, undefined, ...condition];
    add(`condition:${condition.join(":")}`, dialogue.parts.some(part => part.matchup && (!mine || part.matchup.mine === mine)
      && (!enemy || part.matchup.enemy === enemy) && part.matchup.conditions.some(c => c.owner === owner && c.slot === slot && c.status === status)));
  }
  if (expected.schemaCase) add("schema-contract", schemaGrade(text, expected.schemaCase as SchemaCase).pass);
  if (expected.legacyGold) {
    const gold = expected.legacyGold as { kind: string; champions: string[]; mine?: string; enemy?: string; topic?: string };
    const first = dialogue.parts[0]?.plan, answer = reply.answer;
    const kind = first?.type === "matchup" ? "matchup" : answer?.kind === "champion" ? answer.view === "skills" ? "skills" : answer.focus ? "spellStat" : "guide"
      : answer?.kind === "spell" ? "spellStat" : answer?.kind === "compare" ? "compare" : answer?.kind === "suggestion" ? "suggestion" : "other";
    add("legacy-target", gold.kind === "matchup" ? first?.type === "matchup" && first.mine.id === gold.mine && first.enemy.id === gold.enemy
      && (!gold.topic || (first.focus ?? "general") === gold.topic) : gold.kind === kind
        && (gold.kind === "other" || isDeepStrictEqual([...gold.champions].sort(), [...(answer ? answerChampionIds(answer) : [])].sort())));
  }
  if (expected.flowGold) {
    const gold = expected.flowGold as { mine: string; enemy: string; act: string; named: string; want?: string };
    const first = dialogue.parts[0]?.plan;
    if (gold.want) {
      const answer = reply.answer;
      const shape = first?.type === "matchup" ? "matchup" : answer?.kind === "compare"
        ? isDeepStrictEqual(answer.cards.map(card => card.id).sort(), [gold.mine, gold.enemy].sort()) ? `compare${answer.slot ? `:${answer.slot}` : ""}` : "compare-other"
        : answer?.kind === "spell" || answer?.kind === "champion" ? "pass" : answer ? `${first?.type}:${answer.kind}` : first?.type;
      add("lookup-flow", gold.want === "compare" ? shape?.startsWith("compare") && shape !== "compare-other" : shape === gold.want);
    } else {
      const pair = first?.type === "matchup" ? [first.mine.id, first.enemy.id].join(">") : "pass";
      const target = gold.act === "new" || gold.act === "lookup" ? "pass" : gold.act === "flip" ? `${gold.enemy}>${gold.mine}`
        : gold.act === "enemy" ? `${gold.mine}>${gold.named}` : gold.act === "mine" ? `${gold.named}>${gold.enemy}` : `${gold.mine}>${gold.enemy}`;
      add("act-flow", pair === target);
    }
  }
  if (checks.length) add("nonempty", text.trim().length > 0);
  return checks;
}
