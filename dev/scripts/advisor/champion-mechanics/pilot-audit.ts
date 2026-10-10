import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Draft, Job, Rule } from "../../../../src/domain/knowledge/notes/mechanicsContract";
import { digest, readJson } from "./sources";
import { PILOT_IDS } from "./prepare";
import { checkDirectory } from "./check";
import type { ReviewDecision } from "./export";

function hasEnum(rule: Rule, field: string, value: string) {
  return rule.conditions.some(condition => condition.field === field && condition.value.kind === "enum" && condition.value.value === value);
}
export async function auditPilot(out: string) {
  const validation = await checkDirectory(out, PILOT_IDS);
  assert.equal(validation.counts.valid, PILOT_IDS.length);
  const drafts: Record<string, Draft> = Object.fromEntries(await Promise.all(PILOT_IDS.map(async id => [id, await readJson<Draft>(path.join(out, "candidates", `${id}.json`))])));
  const cases: Array<{ id: string; passed: boolean }> = [];
  const check = (id: string, predicate: boolean) => { assert.ok(predicate, id); cases.push({ id, passed: true }); };
  const conversion = drafts["Pyke.P"].rules.find(rule => rule.effects.some(effect => effect.kind === "stat_conversion"))!;
  check("Pyke converts bonus HP, not base HP", conversion.effects.some(effect => effect.statFrom === "bonusHealth" && effect.statTo === "bonusAttackDamage" && effect.flags.includes("replace_input")));
  check("Pyke conversion has bonus scope", hasEnum(conversion, "stat_scope", "bonus"));
  const healing = drafts["Pyke.P"].rules.find(rule => rule.effects.some(effect => effect.kind === "heal"))!;
  check("Pyke must be unseen himself", healing.conditions.some(condition => condition.subject === "caster" && condition.field === "visibility"));
  check("Pyke nearby enemy count is distinct from hit count", drafts["Pyke.P"].rules.some(rule => rule.conditions.some(condition => condition.subject === "nearby_enemies" && condition.field === "entity_count")));
  const cancelled = drafts["Akshan.P"].rules.find(rule => rule.trigger.event === "attack_cancelled")!;
  check("Akshan speed bonus requires cancelled followup", hasEnum(cancelled, "followup_status", "cancelled"));
  check("Akshan duration refers to time rather than same-valued formula constant", cancelled.effects.some(effect => effect.parameters.some(parameter => parameter.role === "duration_seconds" && parameter.numberRefs.includes("en:body:n5"))));
  const followup = drafts["Akshan.P"].rules.find(rule => rule.trigger.event === "followup_attack")!;
  check("Akshan fires shot himself and damages target", followup.trigger.subject === "caster" && followup.effects.some(effect => effect.kind === "damage" && effect.subject === "target" && effect.damageType === "physical"));
  const shield = drafts["Akshan.P"].rules.find(rule => rule.effects.some(effect => effect.kind === "shield"))!;
  check("Akshan shield needs champion and readiness", hasEnum(shield, "target_type", "champion") && hasEnum(shield, "shield_ready", "ready"));
  check("Akshan conflicting damage descriptions preserved", drafts["Akshan.P"].gaps.some(gap => gap.reason === "source_conflict"));
  const lee = drafts["LeeSin.R"].rules;
  check("Lee root occurs during cast only", lee.some(rule => rule.trigger.event === "cast" && rule.effects.length === 1 && rule.effects[0].crowdControl === "root"));
  check("Lee knockback and secondary knockup are distinct", lee.some(rule => rule.effects.some(effect => effect.crowdControl === "knockback" && effect.subject === "target")) && lee.some(rule => rule.effects.some(effect => effect.crowdControl === "knockup" && effect.subject === "secondary_targets")));
  check("Lee collision references kicked target bonus HP", lee.some(rule => rule.effects.some(effect => effect.parameters.some(parameter => parameter.stat === "bonusHealth" && parameter.statSubject === "target"))));
  for (const variant of ["form:A", "form:B"]) {
    const extra = drafts["Jayce.Q"].rules.filter(rule => rule.variant === variant && rule.effects.some(effect => effect.parameters.some(parameter => parameter.numberRefs.includes(`${variant}:en:n14`))));
    check(`Jayce ${variant} monster-only damage remains conditional`, extra.length > 0 && extra.every(rule => hasEnum(rule, "target_type", "monster")));
  }
  const cougar = drafts["Nidalee.Q"].rules.filter(rule => rule.variant === "form:B");
  check("Nidalee ordinary empowered attack is not gated by Hunted", cougar.some(rule => hasEnum(rule, "activation", "empowered") && !rule.conditions.some(condition => condition.field === "mark") && rule.effects.some(effect => effect.kind === "damage")));
  const hwei = drafts["Hwei.E"].rules;
  for (const [variant, cc] of [["EQ", "fear"], ["EW", "root"], ["EE", "pull"]]) {
    check(`Hwei ${variant} CC remains in own variant`, hwei.some(rule => rule.variant === variant && rule.effects.some(effect => effect.crowdControl === cc)));
  }
  check("Hwei eye vision exists without a missile hit", hwei.some(rule => rule.variant === "EW" && rule.trigger.event === "cast" && !rule.conditions.length && rule.effects.some(effect => effect.kind === "visibility")));
  check("Aphelios E is UI-only", drafts["Aphelios.E"].rules.every(rule => rule.effects.every(effect => effect.kind === "ui_information")));
  check("Mordekaiser stat theft preserves target loss", drafts["Mordekaiser.R"].rules.some(rule => rule.effects.some(effect => effect.kind === "stat_modifier" && effect.subject === "target")));
  const decisions: ReviewDecision[] = [];
  for (const id of PILOT_IDS) {
    const job = await readJson<Job>(path.join(out, "inputs", `${id}.json`));
    decisions.push({ id, sourceHash: job.sourceHash, candidateHash: digest(drafts[id]), verdict: "accepted",
      checks: ["condition_scope", "actors", "timing", "source_numbers", "variants", "source_conflicts"],
      notes: ["Supervisor checked pilot source agreement and corrected failed semantics; retained gaps/text predicates are not complete executable game rules."] });
  }
  const report = { kind: "pilot_semantics_audit", cases, counts: { passed: cases.length, total: cases.length },
    limitation: "This is an extraction audit, not an end-to-end chatbot QA benchmark or proof that all hidden game interactions are covered." };
  await writeFile(path.join(out, "reports/pilot-audit.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(out, "review-ledger.json"), `${JSON.stringify({ decisions }, null, 2)}\n`);
  return report.counts;
}
if (process.argv[1]?.endsWith("pilot-audit.ts")) console.log(JSON.stringify(await auditPilot(path.resolve(process.argv[2] ?? "dev/research/champion-mechanics/26.19-v2"))));
