import { digest } from "./sources";
import { parseDraft } from "./schema";
import type { Draft, Evidence, Job, Rule } from "../../../../src/domain/knowledge/notes/mechanicsContract";

export interface Finding { code: string; path: string; detail: string }
export interface ValidationResult { valid: boolean; errors: Finding[]; warnings: Finding[]; draft?: Draft }

function evidenceErrors(job: Job, evidence: Evidence[], at: string): Finding[] {
  return evidence.flatMap((item, index) => {
    const source = job.sources.find(doc => doc.id === item.sourceId);
    if (!source || !source.text.includes(item.quote)) return [{ code: "evidence", path: `${at}.${index}`, detail: "Quote is not an exact source substring" }];
    return [];
  });
}
function quotedNumber(job: Job, ref: string, evidence: Evidence[]): boolean {
  const number = job.numbers.find(value => value.id === ref);
  if (!number) return false;
  return evidence.some(item => {
    if (item.sourceId !== number.sourceId) return false;
    const source = job.sources.find(doc => doc.id === item.sourceId)!;
    for (let start = source.text.indexOf(item.quote); start >= 0; start = source.text.indexOf(item.quote, start + 1)) {
      if (start <= number.start && number.end <= start + item.quote.length) return true;
    }
    return false;
  });
}
function ruleErrors(job: Job, rule: Rule, at: string): Finding[] {
  const errors = evidenceErrors(job, rule.evidence, `${at}.evidence`);
  const fail = (code: string, detail: string) => errors.push({ code, path: at, detail });
  const variant = job.variants.find(item => item.id === rule.variant);
  if (!variant) fail("variant", "Unknown variant");
  else if (variant.id !== "base" && !rule.evidence.some(item => variant.sourceIds.includes(item.sourceId))) fail("variant_source", "Variant needs its own source evidence");
  const refs = rule.conditions.flatMap(condition => condition.value.kind === "number_ref" ? [condition.value.ref] : []);
  const quotations = rule.evidence.map(item => item.quote).join(" ");
  if (new Set(rule.conditions.map(condition => JSON.stringify(condition))).size !== rule.conditions.length) fail("duplicate_condition", "Duplicate predicates are not distinct requirements");
  for (const condition of rule.conditions) {
    if (condition.field === "hit_order" && condition.value.kind === "enum" && condition.value.value === "first" && !/\bfirst\b|첫|처음|최초/i.test(quotations)) {
      fail("first_hit", "First-hit restriction is not stated by this rule's evidence");
    }
    if (condition.value.kind !== "number_ref") continue;
    const number = job.numbers.find(item => item.id === (condition.value.kind === "number_ref" ? condition.value.ref : ""));
    if (!number) continue;
    if (["hit_count", "entity_count", "distance"].includes(condition.field) && number.percent) fail("condition_unit", "A percentage cannot be a hit/entity count or distance");
    const source = job.sources.find(item => item.id === number.sourceId)!;
    if (condition.field === "distance" && /^\s*(?:seconds?|s\b)/i.test(source.text.slice(number.end))) fail("condition_unit", "A time duration cannot be a distance condition");
  }
  const optionalCast = /can use (?:this|the) (?:ability|skill) while/i.test(quotations) && rule.trigger.event === "cast"
    && rule.conditions.some(condition => condition.field === "other" || condition.field === "time") && rule.effects.some(effect => effect.kind === "movement");
  if (optionalCast) fail("optional_permission", "Can also cast while another ability winds up is permission, not a prerequisite for ordinary movement");
  for (const effect of rule.effects) {
    refs.push(...effect.parameters.flatMap(parameter => parameter.numberRefs));
    for (const parameter of effect.parameters) {
      if ((parameter.stat === null) !== (parameter.statSubject === null)) fail("stat_owner", "A stat reference needs its owner; a constant uses null");
      const countFormula = parameter.shape === "formula_components" && parameter.stat !== null;
      if (parameter.role === "count" && !countFormula && parameter.numberRefs.some(ref => job.numbers.find(number => number.id === ref)?.percent)) {
        fail("count_unit", "A plain count cannot refer to a percentage; stat-scaled formulas must identify their stat");
      }
    }
    if (job.slotRole === "interface_only" && effect.kind !== "ui_information") fail("interface_only", "Interface slot is not a castable skill");
    if ((effect.kind === "crowd_control") !== (effect.crowdControl !== null)) fail("crowd_control", "CC type belongs only on a CC effect");
    if (effect.kind === "damage" && effect.damageType === null) fail("damage_type", "Damage effect needs an explicit source damage type");
    if (effect.kind !== "damage" && effect.damageType !== null) fail("damage_type", "Non-damage effect must use null damageType");
    if (effect.kind === "stat_conversion") {
      if (!effect.statFrom || !effect.statTo) fail("conversion", "Conversion needs input/output stats");
      for (const role of ["ratio_input", "ratio_output"]) {
        if (!effect.parameters.some(parameter => parameter.role === role)) fail("conversion", `Conversion needs ${role}`);
      }
    }
  }
  for (const ref of refs) if (!quotedNumber(job, ref, rule.evidence)) fail("number_evidence", `Number reference lacks quoted evidence: ${ref}`);
  if (rule.evidence.every(item => job.sources.find(source => source.id === item.sourceId)?.tier === "curated_note")) fail("note_only", "A gameplay note alone cannot certify a mechanic");
  return errors;
}
export function validateDraft(job: Job, input: unknown): ValidationResult {
  let draft: Draft;
  try { draft = parseDraft(input); }
  catch (error) { return { valid: false, errors: [{ code: "schema", path: "draft", detail: String(error) }], warnings: [] }; }
  const errors = draft.rules.flatMap((rule, index) => ruleErrors(job, rule, `rules.${index}`));
  errors.push(...draft.gaps.flatMap((gap, index) => evidenceErrors(job, gap.evidence, `gaps.${index}.evidence`)));
  const warnings: Finding[] = [];
  if (!draft.rules.length && !draft.gaps.length) errors.push({ code: "empty", path: "draft", detail: "No rules or documented source gaps" });
  for (const variant of job.variants.filter(item => item.id !== "base")) {
    if (!draft.rules.some(rule => rule.variant === variant.id)) warnings.push({ code: "missing_variant", path: variant.id, detail: "Variant has no extracted rule" });
  }
  draft.rules.forEach((rule, index) => {
    if (rule.trigger.event === "other" || rule.conditions.some(condition => condition.value.kind === "text" || condition.field === "other")) {
      warnings.push({ code: "text_condition", path: `rules.${index}`, detail: "Condition is retained as text; do not execute it as a complete typed predicate" });
    }
    if (rule.effects.some(effect => effect.kind === "other" || effect.subject === "unknown" || effect.parameters.some(parameter => parameter.statSubject === "unknown"))) {
      warnings.push({ code: "unresolved_effect", path: `rules.${index}`, detail: "Effect or stat owner is not completely typed; requires semantic review" });
    }
  });
  if (draft.gaps.length) warnings.push({ code: "source_gaps", path: "gaps", detail: `${draft.gaps.length} unresolved source gaps` });
  return { valid: errors.length === 0, errors, warnings, draft };
}
export function validatedRecord(job: Job, draft: Draft) {
  const result = validateDraft(job, draft);
  if (!result.valid) throw new Error(JSON.stringify(result.errors));
  return { schemaVersion: 2, id: job.id, champion: job.champion, slot: job.slot, patch: job.patch,
    sourceHash: job.sourceHash, promptHash: job.promptHash, status: "validated", facts: job.facts,
    sourceRefs: job.sources, numbers: job.numbers, variants: job.variants,
    ...draft, rules: draft.rules.map(rule => ({ id: digest({ job: job.id, rule }).slice(0, 20), ...rule })) };
}
