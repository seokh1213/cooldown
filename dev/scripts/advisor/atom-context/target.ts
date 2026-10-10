/** 원자 실험들이 같은 스킬 주인·대상을 사용하게 한다. */
import type { AdvisorData } from "../../../../src/features/advisor/conversation/context";
import { resolveQuestion } from "../../../../src/features/advisor/understanding/resolvedQuestion";
import type { AtomRequest } from "./select";

export function atomTarget(data: AdvisorData, request: AtomRequest): { slot?: string; owner?: string; explicit: boolean } {
  const resolved = resolveQuestion(request.question, data);
  const namedSpell = [request.mine, request.enemy].flatMap(card => card.spells
    .filter(spell => spell.name.length > 1 && request.question.includes(spell.name))
    .map(spell => ({ owner: card.id, slot: spell.slot })));
  if (namedSpell.length === 1) return { ...namedSpell[0], explicit: true };
  const condition = request.memory.conditions.at(-1);
  const slot = resolved.slot ?? condition?.slot;
  const namedOwner = resolved.slotIndex === undefined ? undefined
    : resolved.mentions.filter(m => m.index < resolved.slotIndex!).at(-1)?.card.id;
  const relativeOwner = /상대|enemy|对面/i.test(request.question) ? request.enemy.id
    : /내\s*[QWER]|\bmy\b|我的/i.test(request.question) ? request.mine.id
    : condition && (!resolved.slot || condition.slot === resolved.slot) ? condition.owner === "enemy" ? request.enemy.id : request.mine.id : undefined;
  return { slot, owner: namedOwner ?? relativeOwner, explicit: resolved.slot !== undefined };
}
