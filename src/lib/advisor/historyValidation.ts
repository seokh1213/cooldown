import type { StoredAnswer, StoredTurn } from "./history";

type RecordValue = Record<string, unknown>;
type Validator = (value: unknown) => boolean;

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const string = (value: unknown): value is string => typeof value === "string";
const boolean = (value: unknown): boolean => typeof value === "boolean";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonNegative = (value: unknown): boolean => finite(value) && value >= 0;
const integer = (value: unknown): value is number => finite(value) && Number.isInteger(value) && value >= 0;
const optional = (value: unknown, check: Validator): boolean => value === undefined || check(value);
function array(value: unknown, check: Validator): boolean {
  if (!Array.isArray(value)) return false;
  for (const entry of value) if (!check(entry)) return false;
  return true;
}
const strings = (value: unknown): value is string[] => array(value, string);
const oneOf = (value: unknown, choices: readonly unknown[]): boolean => choices.includes(value);
const focus = (value: unknown): boolean => oneOf(value, ["cooldown", "cost", "ratio", "damage", "range", "effect"]);
const statField = (value: unknown): boolean => oneOf(value, ["health", "healthRegen", "armor", "magicResist", "attackDamage", "attackSpeed", "moveSpeed"]);
const statLevel = (value: unknown): boolean => oneOf(value, [1, 6, 11, 18]);
const guidance = (value: unknown): boolean => oneOf(value, ["scope", "perspective", "evidence", "unsupported", "guarantee", "answerMismatch"]);

function fact(value: unknown): boolean {
  return record(value) && string(value.label) && string(value.value);
}

function statQuery(value: unknown): boolean {
  return record(value) && value.kind === "championStat" && strings(value.champions) && value.champions.length > 0
    && statField(value.field) && optional(value.fields, fields => array(fields, statField)
      && (fields as unknown[]).length > 0) && statLevel(value.level);
}

function championNotes(value: unknown): boolean {
  return record(value) && strings(value.playing) && strings(value.against)
    && optional(value.perspective, entry => oneOf(entry, ["playing", "against", "both"]))
    && optional(value.detail, entry => entry === "full") && optional(value.topic, entry => entry === "combo")
    && optional(value.sources, strings) && optional(value.unavailable, strings);
}

function compareRow(value: unknown, columns: number): boolean {
  return record(value) && string(value.label) && strings(value.values) && value.values.length === columns
    && optional(value.hit, boolean) && optional(value.winner, winner => integer(winner) && winner < columns);
}

function compareNotes(value: unknown): boolean {
  return record(value) && strings(value.mine) && strings(value.enemy) && optional(value.derived, integer)
    && optional(value.plan, plan => record(plan) && optional(plan.focus, string) && optional(plan.question, string)
      && array(plan.claims, claim => record(claim) && string(claim.text)
        && oneOf(claim.kind, ["offense", "defense", "pinned", "scaling"]))
      && array(plan.mine, noteEntry) && array(plan.enemy, noteEntry));
}

function noteEntry(value: unknown): boolean {
  return record(value) && string(value.category) && string(value.text);
}

function itemEffect(value: unknown): boolean {
  return record(value) && string(value.name) && boolean(value.active) && string(value.text);
}

function itemVerdict(value: unknown): boolean {
  return record(value) && string(value.tag) && boolean(value.yes) && optional(value.evidence, string);
}

export function isStoredAnswer(value: unknown): value is StoredAnswer {
  if (!record(value)) return false;
  switch (value.kind) {
    case "spell":
      return string(value.championId) && string(value.slot) && optional(value.focus, focus)
        && optional(value.headline, fact) && array(value.facts, fact) && strings(value.highlighted);
    case "champion":
      return string(value.cardId) && optional(value.statQuery, statQuery) && optional(value.headline, fact)
        && optional(value.focus, focus) && optional(value.view, entry => oneOf(entry, ["skills", "overview"]))
        && optional(value.notes, championNotes);
    case "rule":
      return string(value.ruleName) && strings(value.highlighted) && strings(value.rest);
    case "suggestion":
      return string(value.original) && strings(value.candidateIds)
        && optional(value.reason, entry => oneOf(entry, ["typo", "ambiguous"]));
    case "compare": {
      if (!strings(value.cardIds) || value.cardIds.length === 0) return false;
      const columns = value.cardIds.length;
      return array(value.rows, row => compareRow(row, columns)) && optional(value.statQuery, statQuery)
        && optional(value.level, statLevel) && optional(value.slot, string) && optional(value.focus, focus)
        && optional(value.headline, fact) && optional(value.headlines, entries => array(entries, fact))
        && optional(value.matchup, boolean) && (!value.matchup || columns >= 2)
        && optional(value.notes, compareNotes);
    }
    case "item":
      return string(value.itemId) && string(value.itemName) && optional(value.price, nonNegative)
        && array(value.stats, fact) && array(value.effects, itemEffect) && array(value.verdicts, itemVerdict);
    case "text":
      return string(value.text);
    default:
      return false;
  }
}

function pair(value: unknown): boolean {
  return record(value) && string(value.mine) && string(value.enemy)
    && optional(value.focus, string) && optional(value.shownTopics, strings);
}

function condition(value: unknown): boolean {
  return record(value) && oneOf(value.owner, ["mine", "enemy"]) && string(value.slot)
    && oneOf(value.status, ["ready", "down"]) && boolean(value.hypothetical) && integer(value.turn);
}

function spellReference(value: unknown): boolean {
  return record(value) && string(value.champion) && string(value.slot) && optional(value.focus, focus)
    && optional(value.relation, entry => entry === "penetration");
}

function control(value: unknown): boolean {
  return record(value) && strings(value.champions) && optional(value.slot, string) && optional(value.types, strings);
}

function mechanic(value: unknown): boolean {
  if (!record(value) || !string(value.abilityId) || !string(value.sourceHash) || !array(value.ruleIndices, integer)) return false;
  return optional(value.topic, entry => oneOf(entry, ["control_resistance", "conversion", "shield", "movement", "control", "heal", "stats", "stack", "summon", "mark", "resource", "activation"]))
    && optional(value.amount, amount => record(amount) && nonNegative(amount.value)
      && oneOf(amount.stat, ["bonusHealth", "abilityPower"]) && integer(amount.count) && amount.count > 0)
    && optional(value.targetType, entry => oneOf(entry, ["champion", "minion", "monster", "structure"]))
    && optional(value.followupStatus, entry => oneOf(entry, ["cancelled", "fired"]))
    && optional(value.shieldReady, entry => oneOf(entry, ["ready", "down"]))
    && optional(value.spellReady, entry => oneOf(entry, ["ready", "down"])) && optional(value.hitCount, integer);
}

function memory(value: unknown): boolean {
  return record(value) && string(value.patch)
    && optional(value.active, entry => oneOf(entry, ["matchup", "champion", "spell", "compare", "stat", "item", "rule"]))
    && optional(value.champion, string) && optional(value.matchup, pair)
    && optional(value.matchups, entries => array(entries, entry => pair(entry)
      && array((entry as RecordValue).conditions, condition)))
    && optional(value.matchupGroup, entries => array(entries, pair))
    && optional(value.matchupScope, entry => oneOf(entry, ["single", "group"]))
    && optional(value.spell, spellReference) && optional(value.control, control)
    && optional(value.compared, strings) && optional(value.stat, statQuery) && optional(value.item, string)
    && optional(value.rule, rule => record(rule) && string(rule.title) && string(rule.text) && optional(rule.id, string))
    && optional(value.numeric, numeric => record(numeric) && optional(numeric.haste, finite) && optional(numeric.rank, finite))
    && optional(value.mechanic, mechanic)
    && optional(value.combo, combo => record(combo) && string(combo.champion) && strings(combo.unavailable))
    && optional(value.conditions, entries => array(entries, condition))
    && optional(value.pending, pending => record(pending) && string(pending.slot)
      && optional(pending.focus, focus) && strings(pending.candidates))
    && optional(value.lastReply, reply => record(reply) && string(reply.question) && string(reply.text) && optional(reply.focus, string));
}

function requestContract(value: unknown): boolean {
  return record(value) && oneOf(value.operation, ["lookup", "advice", "explain", "unknown"])
    && strings(value.targets) && optional(value.pair, pair) && optional(value.stat, statQuery);
}

function trace(value: unknown): boolean {
  return record(value) && oneOf(value.judge, ["model", "offline", "none"])
    && array(value.parts, part => record(part) && string(part.question) && requestContract(part.request)
      && oneOf(part.plan, ["card", "matchup", "code", "retry", "respond"])
      && optional(part.topics, strings) && optional(part.rejected, guidance))
    && optional(value.rejected, guidance);
}

export function isStoredTurn(value: unknown): value is StoredTurn {
  return record(value) && integer(value.id) && oneOf(value.role, ["user", "assistant"]) && string(value.content)
    && optional(value.stats, stats => record(stats) && nonNegative(stats.tokens) && nonNegative(stats.seconds)
      && optional(stats.ttft, nonNegative) && optional(stats.promptTokens, nonNegative))
    && optional(value.rating, entry => oneOf(entry, ["up", "down"])) && optional(value.sources, strings)
    && optional(value.notice, string) && optional(value.byCode, boolean)
    && optional(value.answer, isStoredAnswer) && optional(value.answers, answers => array(answers, isStoredAnswer))
    && optional(value.memory, memory) && optional(value.trace, trace);
}

export function validStoredTurns(values: readonly unknown[]): StoredTurn[] {
  const turns: StoredTurn[] = [];
  let invalidQuestion = false;
  for (const value of values) {
    if (!isStoredTurn(value)) {
      if (record(value) && value.role === "assistant" && turns[turns.length - 1]?.role === "user") turns.pop();
      invalidQuestion = record(value) && value.role === "user";
      continue;
    }
    if (value.role !== "assistant" || !invalidQuestion) turns.push(value);
    invalidQuestion = false;
  }
  return turns;
}
