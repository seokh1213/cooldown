/** 대상과 수치 칸이 명확한 조회는 판정·검색보다 먼저 카드로 답한다. */
import { buildCompareAnswer, buildRuleAnswer, buildSpellAnswer } from "./answer";
import { asksSkillHandling, asksWholeKit } from "./askWords";
import type { AnswerPlan, PlanContext } from "./planTypes";
import { askedRules, ruleCooldown } from "./questionDocs";
import type { ResolvedQuestion } from "./resolvedQuestion";

const ADVICE = /빠졌|빠진|없으면|대신|들어가|진입|상대법|교환|언제|어떻게|피하|피해\s*버|좋아|추천|\b(when|should|instead|without|bait|avoid|engage)\b|怎么|何时|没了|没有|换成|推荐/i;

export function directFactPlan(resolved: ResolvedQuestion, ctx: PlanContext): AnswerPlan | undefined {
  const { text: question, champions, slot, spellFocus } = resolved;
  if (!ctx.data || !spellFocus || ADVICE.test(question) || asksSkillHandling(question) || asksWholeKit(question)) return undefined;
  if (!["cooldown", "cost", "range", "ratio"].includes(spellFocus.focus)) return undefined;
  const rules = askedRules(ctx.data, question);
  if (rules.length === 1 && rules[0].subject !== "gameplay" && spellFocus.focus === "cooldown" && !champions.length) {
    const rule = rules[0];
    return { type: "card", answer: buildRuleAnswer(rule, [rule.name], ctx.lang, rules, ruleCooldown(ctx.data, rule, question)), notice: ctx.notice };
  }
  if (rules.length || !champions.length) return undefined;
  // 복합 계산과 정정은 숫자 기억을 다루는 대화 조회에 맡긴다.
  if (/가속|랭크|레벨|haste|rank|level|急速|等级/i.test(question)) return undefined;
  if (champions.length > 1 && (slot || spellFocus.focus === "cooldown")) {
    return { type: "card", answer: buildCompareAnswer(champions, question, slot, { lang: ctx.lang }), notice: ctx.notice };
  }
  if (champions.length !== 1 || !slot) return undefined;
  const spell = champions[0].spells.find(s => s.slot === slot);
  return spell ? { type: "card", answer: buildSpellAnswer(champions[0], spell, question, ctx.lang), notice: ctx.notice } : undefined;
}
