import { matchesMechanicsQuestion } from "@/domain/knowledge/notes/mechanics";
import { mentionsSearchDocument } from "../searchFallback";
import { detectStats } from "../../understanding/stats/statQuery";
import type { ResolvedQuestion } from "../../understanding/resolvedQuestion";
import type { DialogueMemory } from "../../conversation/memory/dialogueState";
import type { PlanContext } from "../../contracts/planTypes";

export function mechanicsContinuation(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): ResolvedQuestion {
  const previous = ctx.data?.mechanics.find(note => note.evidence && note.topic && `mech:${note.id}` === memory.rule?.id);
  if (!previous?.topic || !memory.rule?.context || memory.active !== "rule" && !memory.control) return resolved;
  const champions = resolved.champions.length ? resolved.champions
    : memory.rule.context.champions.map(id => ctx.data!.cardById.get(id)!).filter(Boolean);
  const slot = resolved.slot ?? (resolved.champions.length ? undefined : memory.rule.context.slot);
  const scoped = { ...resolved, champions, slot };
  const namedTopics = ctx.data!.mechanics.filter(note => note.topic
    && matchesMechanicsQuestion({ questionGroups: [note.topic.terms] }, resolved.text));
  const numeric = resolved.spellFocus && ["cooldown", "cost", "ratio", "range"].includes(resolved.spellFocus.focus);
  if (namedTopics.length || numeric || !resolved.slot && detectStats(resolved.text).length) return scoped;
  const related = ctx.data!.mechanics.some(note => note.topic?.id === previous.topic!.id
    && note.subjects?.some(subject => champions.some(champion => champion.id === subject.champion)
      && subject.slot === slot));
  const follows = resolved.champions.length || resolved.slot || mentionsSearchDocument(previous, resolved.text);
  if (!related || !follows) return resolved;
  // 주제를 이어도 새 챔피언·슬롯의 근거를 다시 조회한다. 이전 O/X를 그대로 복사하지 않는다.
  return { ...scoped, text: `${resolved.text} ${previous.topic.terms[0]}` };
}
