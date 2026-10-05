/** 명시적 콤보와 바로 이어지는 스킬 상태 질문을 같은 자료로 답한다. */
import { asksCombo } from "./comboIntent";
import { asksSkillHandling } from "./askWords";
import { mentionsAbilityState, abilityStatus } from "./abilityStatus";
import { selectComboNotes } from "./comboNotes";
import { scenarioConditions, type DialogueMemory } from "./dialogueState";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { AnswerPlan, PlanContext } from "./planTypes";

function unavailableAbilities(question: string, previous: string[]): string[] {
  // “R이 없는데 콤보 있어?”의 ‘있어’는 콤보 유무이며 R의 준비 상태가 아니다.
  const stateQuestion = question.replace(/(?:콤보|연계)(?:가|는|도)?\s*(?:있|없).*$/i, "");
  const states = scenarioConditions(stateQuestion, previous.filter(slot => slot !== "점멸").map(slot => ({
    owner: "mine" as const, slot, status: "down" as const, hypothetical: false, turn: 0,
  })), 0, { owner: "mine" });
  const unavailable = new Set(states.filter(state => state.owner === "mine" && state.status === "down").map(state => state.slot));
  if (previous.includes("점멸")) unavailable.add("점멸");
  const flash = /(?:점멸|flash|闪现)(.*)/i.exec(stateQuestion);
  const flashState = flash ? abilityStatus(flash[1]) : undefined;
  if (flashState === "down") unavailable.add("점멸");
  if (flashState === "ready") unavailable.delete("점멸");
  for (const match of question.matchAll(/without\s+(?:my\s+)?(R|ult(?:imate)?|flash)\b/gi)) {
    unavailable.add(/^flash$/i.test(match[1]) ? "점멸" : "R");
  }
  return [...unavailable];
}

export function comboAdvicePlan(resolved: ResolvedQuestion, ctx: PlanContext, memory?: DialogueMemory): AnswerPlan | undefined {
  const { text: question, champions } = resolved;
  const explicit = asksCombo(question);
  const followup = memory?.active === "champion" && memory.combo
    && (mentionsAbilityState(question) || /without\s+(?:my\s+)?(?:ult|R|flash)/i.test(question))
    && !/쿨타임|몇\s*초|사거리|계수|cooldown|range|ratio/i.test(question);
  if (!ctx.data || (!explicit && !followup) || resolved.matchup || champions.length > 1 || asksSkillHandling(question)) return undefined;
  if (!champions.length && memory?.active === "matchup") return undefined;
  const id = champions[0]?.id ?? memory?.combo?.champion ?? memory?.champion ?? ctx.championIds[0];
  if (!id || (!explicit && id !== memory?.combo?.champion)) return undefined;
  const card = ctx.data.cardById.get(id);
  const book = ctx.data.playbooks.get(id);
  if (!card || !book) return undefined;
  const previous = memory?.combo?.champion === id ? memory.combo.unavailable : [];
  const notes = selectComboNotes(book.playing.filter(entry => !entry.when), {
    question, locale: ctx.data.locale, translations: ctx.data.noteTranslations,
    unavailable: unavailableAbilities(question, previous),
  });
  return { type: "card", answer: { kind: "champion", card, notes }, notice: ctx.notice };
}
