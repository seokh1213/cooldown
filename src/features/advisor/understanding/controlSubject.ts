/** 이름 생략은 직전 스킬 또는 CC 판정의 대상에만 연결한다. 이전 상성·아이템을 임의로 고르지 않는다. */
import type { DialogueMemory } from "../conversation/dialogueState";
import type { PlanContext, ControlContext } from "../contracts/planTypes";
import type { ResolvedQuestion } from "./resolvedQuestion";
import { controlQuery, askedCleansers, asksCrowdControl } from "./crowdControlQuestion";
import { asksWholeKit } from "./askWords";
import { buildItemCard } from "../conversation/context";

export function controlSubject(resolved: ResolvedQuestion, ctx: PlanContext, memory: DialogueMemory): ControlContext | undefined {
  if (resolved.champions.length) {
    const same = resolved.champions.length === 1 && memory.control?.champions.length === 1
      && memory.control.champions[0] === resolved.champions[0].id && controlQuery(resolved.text) !== "types"
      && !asksWholeKit(resolved.text);
    return { champions: resolved.champions.map(card => card.id), slot: resolved.slot ?? (same ? memory.control?.slot : undefined) };
  }
  // 소환사 주문/아이템 자체의 조회와 새로운 일반 규칙 질문은 앞 스킬에 붙이지 않는다.
  if (/효과|설명|가격|골드|원리|전체|일반|\b(effect|description|cost|price|general)\b|效果|价格|原理/i.test(resolved.text)) return undefined;
  const item = ctx.data && buildItemCard(ctx.data, resolved.text);
  if (item?.kind === "item" && !askedCleansers(item.itemName).length) return undefined;
  const refersBack = /그럼|그때|그거|이때|이거|그\s*스킬|\b(it|that|then)\b|那么|那|这个/i.test(resolved.text);
  if (!resolved.slot && !refersBack && asksCrowdControl(resolved.text)) return undefined;
  const replies = ctx.turns.filter(turn => turn.role === "assistant");
  const prior = replies[replies.length - 1]?.answer;
  const reference = memory.control ?? (prior?.kind === "spell" ? { champions: [prior.championId], slot: prior.spell.slot } : undefined);
  return reference ? { ...reference, champions: [...reference.champions], slot: resolved.slot ?? reference.slot } : undefined;
}

export function controlClarification(subject: ControlContext, lang: PlanContext["lang"]): string | undefined {
  if (subject.champions.length === 1 && subject.slot) return undefined;
  return lang === "ko_KR" ? "어느 챔피언의 어떤 스킬 판정인지 알려주세요. 예: ‘나미 Q 수은으로 풀려?’"
    : lang === "en_US" ? "Which champion and ability do you mean? For example: 'Can QSS remove Nami Q?'"
    : "你指的是哪个英雄的哪个技能？例如：‘水银能解除娜美Q吗？’";
}
