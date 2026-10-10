/** 생성과 검증에 같은 정의를 쓴다. 모르는 키를 버리지 않고 오류로 처리한다. */
import Ajv from "ajv";
import { CC_TYPES, EFFECTS, EVENTS, FIELDS, GAPS, PARAM_ROLES, STATS, SUBJECTS, VALUES, type Draft } from "../../../../src/domain/knowledge/notes/mechanicsContract";

type Schema = Record<string, unknown>;
const object = (properties: Record<string, Schema>): Schema => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const enumOf = (values: readonly string[]): Schema => ({ type: "string", enum: values });
const text = (minLength = 1): Schema => ({ type: "string", minLength });
const array = (items: Schema, minItems = 0): Schema => ({ type: "array", items, minItems });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });
const literal = (value: string): Schema => ({ type: "string", const: value });
const evidence = object({ sourceId: text(), quote: text() });
const value = { anyOf: [object({ kind: literal("enum"), value: enumOf(VALUES) }), object({ kind: literal("boolean"), value: { type: "boolean" } }),
  object({ kind: literal("number_ref"), ref: text() }), object({ kind: literal("text"), value: text() })] };
const parameter = object({ role: enumOf(PARAM_ROLES), numberRefs: array(text(), 1), stat: nullable(enumOf(STATS)),
  statSubject: nullable(enumOf(SUBJECTS)),
  shape: enumOf(["scalar", "rank_values", "level_range", "formula_components", "unknown"]) });
const effect = object({ kind: enumOf(EFFECTS), subject: enumOf(SUBJECTS), text: text(), damageType: nullable(enumOf(["physical", "magic", "true"])),
  crowdControl: nullable(enumOf(CC_TYPES)), statFrom: nullable(enumOf(STATS)), statTo: nullable(enumOf(STATS)), parameters: array(parameter),
  flags: { ...array(enumOf(["replace_input", "replaces_base", "decays", "per_target", "unknown"])), uniqueItems: true } });
export const DRAFT_SCHEMA = object({ summary: text(), rules: array(object({ variant: text(),
  trigger: object({ event: enumOf(EVENTS), subject: enumOf(SUBJECTS) }),
  conditions: array(object({ subject: enumOf(SUBJECTS), field: enumOf(FIELDS), operator: enumOf(["eq", "neq", "lt", "lte", "gt", "gte", "present", "absent"]), value })),
  effects: array(effect, 1), evidence: array(evidence, 1),
})), gaps: array(object({ reason: enumOf(GAPS), detail: text(), evidence: array(evidence) })) });
const ajv = new Ajv({ allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const validate = ajv.compile(DRAFT_SCHEMA);
export function parseDraft(input: unknown): Draft {
  if (!validate(input)) throw new Error(ajv.errorsText(validate.errors));
  return input as Draft;
}
