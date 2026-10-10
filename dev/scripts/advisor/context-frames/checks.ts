import type { DialogueOutput } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { statFields, statQueryFromAnswer } from "../../../../src/features/advisor/understanding/statQuery";
import type { Check, QualityStory } from "../quality/types";

export function contextChecks(output: DialogueOutput, expected: QualityStory["turns"][number]["expected"]): Check[] {
  const contract = expected.context as { kind?: string; champion?: string; slot?: string; champions?: string[];
    fields?: string[]; level?: number; clarify?: boolean; pair?: string[] } | undefined;
  if (!contract) return [];
  const checks: Check[] = [], answer = output.reply.answer;
  const add = (label: string, pass: unknown) => checks.push({ label, pass: Boolean(pass) });
  if (contract.clarify !== undefined) add("context:clarify", Boolean(output.dialogue.clarification) === contract.clarify);
  if (contract.kind === "spell") add("context:spell", answer?.kind === "spell"
    && answer.championId === contract.champion && answer.spell.slot === contract.slot);
  if (contract.kind === "stat") {
    const query = answer && statQueryFromAnswer(answer);
    add("context:stat", query && JSON.stringify([query.champions, statFields(query), query.level])
      === JSON.stringify([contract.champions, contract.fields, contract.level]));
  }
  if (contract.pair) {
    const plan = output.dialogue.parts[0]?.plan;
    add("context:pair", plan?.type === "matchup" && JSON.stringify([plan.mine.id, plan.enemy.id]) === JSON.stringify(contract.pair));
  }
  return checks;
}
