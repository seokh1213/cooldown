/** JSON Schema が生成制約と実行時検証の唯一の定義。未知キーを削除したり値を補正しない。 */
import Ajv from "ajv";
import { ASKS, STATS, TOPICS, ruleSignature, type MechanicRecord, type Query, type RulePayload } from "./types";

type Schema = Record<string, unknown>;
const object = (properties: Record<string, Schema>): Schema => ({ type: "object", properties,
  required: Object.keys(properties), additionalProperties: false });
const literal = (value: string | number): Schema => ({ const: value });
const number = (minimum = 0): Schema => ({ type: "number", minimum });
const enumOf = (values: readonly string[]): Schema => ({ type: "string", enum: values });
const nullable = (value: Schema): Schema => ({ anyOf: [value, { type: "null" }] });
const stat = enumOf(STATS);
const boolean = { type: "boolean" };
const counter = { trigger: literal("stack_threshold"), scope: literal("same_target"), threshold: { type: "integer", minimum: 1 } };
export const RULE_SCHEMA: Schema = { oneOf: [
  object({ type: literal("stat_conversion"), from: stat, to: stat, inputPerOutput: { type: "number", exclusiveMinimum: 0 }, replaceInput: boolean }),
  object({ type: literal("followup_attack"), trigger: literal("basic_attack"), attack: literal("followup") }),
  object({ type: literal("stat_buff"), trigger: literal("cancel_followup"), stat, decaySeconds: number() }),
  object({ type: literal("damage_proc"), ...counter, damageType: enumOf(["magic", "physical", "true"]) }),
  object({ type: literal("shield"), ...counter, target: literal("champion"), requiresReady: boolean }),
  object({ type: literal("damage_storage"), damageSource: literal("enemy_champion"), resource: literal("grey_health"), capacityBonusADRatio: number() }),
  object({ type: literal("recovery"), condition: literal("unseen_by_enemies"), resource: literal("grey_health") }),
] };
export const PAYLOAD_SCHEMA = object({ rules: { type: "array", items: RULE_SCHEMA, minItems: 1, maxItems: 16 } });
export const RECORD_SCHEMA = object({
  schemaVersion: literal(1), patch: { type: "string", pattern: "^[0-9]+\\.[0-9]+$" },
  champion: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9]+$" }, slot: literal("P"), coverage: literal("partial"),
  reviewStatus: enumOf(["candidate", "reviewed"]),
  crowdControl: object({ status: literal("known"), effects: { type: "array", items: { type: "string" }, uniqueItems: true } }),
  source: object({ file: { type: "string", minLength: 1 }, sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
    text: { type: "string", minLength: 1 }, urls: { type: "array", minItems: 1, items: { type: "string", format: "uri" } } }),
  rules: { type: "array", items: RULE_SCHEMA, minItems: 1, maxItems: 16 },
});
export const QUERY_SCHEMA = object({ topic: enumOf(TOPICS), asked: enumOf(ASKS), scenario: object({
  healthAmount: nullable(number()), healthKind: nullable(enumOf(["bonus", "base", "growth"])),
  followup: nullable(enumOf(["cancelled", "fired"])), hits: nullable({ type: "integer", minimum: 0 }),
  target: nullable(enumOf(["champion", "minion"])), shieldReady: nullable(boolean), visibleToEnemies: nullable(boolean),
}) });
export const MEMORY_SCHEMA = object({ ...(QUERY_SCHEMA.properties as Record<string, Schema>),
  schemaVersion: literal(1), champion: { type: "string", minLength: 1 }, patch: { type: "string", pattern: "^[0-9]+\\.[0-9]+$" },
});
const ajv = new Ajv({ allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const payloadValidator = ajv.compile(PAYLOAD_SCHEMA);
const recordValidator = ajv.compile(RECORD_SCHEMA);
const queryValidator = ajv.compile(QUERY_SCHEMA);
const memoryValidator = ajv.compile(MEMORY_SCHEMA);

function parse<T>(value: unknown, validator: Ajv.ValidateFunction): T {
  if (!validator(value)) throw new Error(ajv.errorsText(validator.errors));
  return value as T;
}
function uniqueRules<T extends RulePayload>(value: T): T {
  if (new Set(value.rules.map(rule => rule.type)).size !== value.rules.length) throw new Error("duplicate rule type in v1");
  return value;
}
export const parsePayload = (value: unknown): RulePayload => uniqueRules(parse<RulePayload>(value, payloadValidator));
export const parseRecord = (value: unknown): MechanicRecord => uniqueRules(parse<MechanicRecord>(value, recordValidator));
export const parseQuery = (value: unknown): Query => parse(value, queryValidator);
export const validateMemory = (value: unknown): boolean => Boolean(memoryValidator(value));

/** 형식 합격과 출처에 맞는 내용을 구분한다. 새 규칙은 별도 검수가 필요하다. */
export function auditCandidate(candidate: unknown, reviewed: MechanicRecord): string[] {
  let payload: RulePayload;
  try { payload = parsePayload(candidate); }
  catch (error) { return [`schema: ${error instanceof Error ? error.message : String(error)}`]; }
  const actual = payload.rules.map(ruleSignature).sort();
  const expected = reviewed.rules.map(ruleSignature).sort();
  return JSON.stringify(actual) === JSON.stringify(expected) ? [] : ["source_review: 승인된 규칙과 조건·수치·범위가 다름"];
}
