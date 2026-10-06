/** 승인된 스킬 규칙 조회. 확실한 단일 스킬 질문에만 기존 일반 조회보다 먼저 답한다. */
import type { PlanContext, AnswerPlan } from "../planTypes";
import type { DialogueMemory } from "../dialogueState";
import type { ResolvedQuestion } from "../resolvedQuestion";
import { resolveQuestion } from "../resolvedQuestion";
import { buildSpellAnswer } from "../spellAnswer";
import { buildItemCard } from "../context";
import { asksSkillHandling, asksScenarioAdvice, asksWholeKit } from "../askWords";
import { cooldownRemaining, isMechanicFollowup, normalizeMechanicQuestion, questionState } from "./question";
import { questionTopic, selectRules } from "./retrieval";
import { renderRules } from "./render";
import { abilitySlot, validMechanicMemory, type MechanicMemory } from "./types";

export function approvedMechanicPlan(input: ResolvedQuestion, ctx: PlanContext, memory: DialogueMemory): { plan: AnswerPlan; memory: MechanicMemory } | undefined {
  const data = ctx.data;
  if (!data?.abilityRules?.size || ctx.lang !== "ko_KR") return undefined;
  let question = normalizeMechanicQuestion(input.text);
  if (memory.mechanic && /(?:패시브|때문에|으로).*오른.*체력/.test(question)) question = question.replace(/오른/g, "증가한");
  const resolved = resolveQuestion(question, data);
  if (asksWholeKit(question)) return undefined;
  if (buildItemCard(data, question) || asksSkillHandling(question) && questionTopic(question) !== "resource" || asksScenarioAdvice(question)
    || data.runes.some(rune => rune.name.length > 1 && question.includes(rune.name))
    || data.summoners.some(spell => spell.name.length > 1 && !["회복", "방어막", "부활", "표식", "돌진"].includes(spell.name) && question.includes(spell.name))) return undefined;
  const attackOutcome = /(?:평타|공격|[한두세네1234]\s*(?:대|발))/.test(question) && /취소|쏘|치|맞|적중/.test(question);
  if (resolved.champions.length > 1 || resolved.matchup
    || /수은|정화|미카엘|강타|블랙\s*쉴드|모르가나\s*(?:쉴드|보호막)|추천|상대법|공략|비교|가격|가속|쿨타임\s*얼마/.test(question)
    || /뭐가\s*좋/.test(question) && !attackOutcome) return undefined;
  const previous = (memory.active === "spell" || ["item", "rule"].includes(memory.active ?? "") && attackOutcome)
    && memory.mechanic && validMechanicMemory(memory.mechanic, data.abilityRules) ? memory.mechanic : undefined;
  const priorAbility = previous && data.abilityRules.get(previous.abilityId);
  const champion = resolved.champions[0]?.id ?? (isMechanicFollowup(question) || questionTopic(question) || /패시브|추가\s*공격|주문력/.test(question) ? priorAbility?.job.champion : undefined);
  if (!champion) return undefined;
  const remembered = priorAbility?.job.champion === champion ? previous : undefined;
  const inherit = isMechanicFollowup(question);
  const detectedTopic = questionTopic(question);
  // 소환 조건의 “한 대면?”을 이동 속도 질문으로 바꾸지 않는다.
  const hitFollowup = inherit || /[한두세123]\s*대.*(?:치|때리|맞)/.test(question);
  const topic = hitFollowup && ["summon", "shield", "stack"].includes(remembered?.topic ?? "") && detectedTopic === "movement"
    && !/이속|이동\s*속도|취소/.test(question) ? remembered?.topic : detectedTopic ?? (inherit ? remembered?.topic : undefined);
  if (topic === "control") return undefined;
  const explicitPassive = /(?<![A-Za-z])[Pp](?![A-Za-z])/.test(question) ? "P" : undefined;
  const slot = resolved.slot ?? explicitPassive ?? (remembered && (inherit || topic || /패시브|주문력/.test(question)) ? abilitySlot(remembered.abilityId)
    : topic === "conversion" || attackOutcome || topic === "shield"
      || topic === "heal" && /비축|적(?:에게|한테)\s*보이/.test(question) ? "P" : undefined);
  const conditional = topic === "conversion" || attackOutcome || Boolean((remembered || topic === "shield") && cooldownRemaining(question) !== undefined);
  const targetDamage = resolved.spellFocus?.focus === "damage" && /미니언|몬스터|대상/.test(question);
  if (!slot || !topic && !resolved.slot && !explicitPassive && !attackOutcome || !conditional && topic !== "resource" && !explicitPassive && !targetDamage && resolved.spellFocus?.focus !== undefined && resolved.spellFocus.focus !== "effect"
    || /(?:\d+\s*레벨|능력치|기본\s*스탯)/.test(question) && !resolved.slot && !explicitPassive) return undefined;
  const ability = data.abilityRules.get(`${champion}.${slot}`);
  if (!ability || ability.job.patch !== data.patch || ability.job.slotRole === "interface_only") return undefined;
  if (topic === "conversion" && /전환|변환|치환|바뀌|공격력|주문력/.test(question)
    && !ability.draft.rules.some(rule => rule.effects.some(effect => effect.kind === "stat_conversion"))) {
    return { plan: { type: "code", answer: { kind: "text", text: "현재 자료에서 이 스킬의 능력치 전환 효과는 확인할 수 없어요." } },
      memory: { abilityId: ability.job.id, sourceHash: ability.job.sourceHash, topic, ruleIndices: [] } };
  }
  // 변신/무기 선택이 없는 질문에 특정 형태의 효과를 섞지 않는다.
  if (ability.job.variants.some(variant => variant.id !== "base")) return undefined;
  const mentions = resolved.mentions.map(m => question.slice(m.index, m.index + m.length));
  const state = questionState(question, remembered?.abilityId === ability.job.id ? remembered : undefined);
  const rules = selectRules(ability, question, topic, { championMentions: mentions, state });
  if (!rules.length) return undefined;
  const card = data.cardById.get(champion), spell = card?.spells.find(item => item.slot === slot);
  if (!card || !spell) return undefined;
  const answer = buildSpellAnswer(card, spell, question, ctx.lang);
  if (answer.kind !== "spell") return undefined;
  const text = renderRules(ability.job, rules, question, state);
  if (!text.trim()) return undefined;
  const summonName = topic === "summon" ? /정령|영혼|소환/.exec(question)?.[0] : undefined;
  const next: MechanicMemory = { abilityId: ability.job.id, sourceHash: ability.job.sourceHash, topic,
    ruleIndices: rules.map(rule => ability.draft.rules.indexOf(rule)), amount: state.amount, targetType: state.targetType,
    followupStatus: state.followupStatus, shieldReady: state.shieldReady, spellReady: state.spellReady, hitCount: state.hitCount };
  return { plan: { type: "card", answer: { ...answer, focus: "effect", headline: undefined, facts: [],
    highlighted: (summonName ? `${summonName} 생성 조건:\n${text}` : text).split("\n\n") } }, memory: next };
}
