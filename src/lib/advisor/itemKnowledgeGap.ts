import type { AnswerPlan, PlanContext } from "./planTypes";
import { buildItemCard } from "./context";

/** 아이템을 지목하지 않은 중첩 질문은 다른 게임 규칙이나 챔피언 스탯으로 채우지 않는다. */
export function itemKnowledgeGap(question: string, ctx: PlanContext): AnswerPlan | undefined {
  if (!ctx.data || buildItemCard(ctx.data, question)) return undefined;
  if (/치유\s*감소|치감|重伤|grievous wounds/i.test(question)
    && /누가|谁(?:出|买)|who.*(?:buy|build)/i.test(question)
    && /우리\s*팀|아군|我们队|我们.*(?:中单|辅助)|our team/i.test(question)) {
    const text = ctx.lang === "en_US" ? "Your team's champions and the enemy's healing alone don't establish who should buy Grievous Wounds. Which items and main damage patterns are you considering? Those determine whether the debuff can be applied."
      : ctx.lang === "zh_CN" ? "仅凭队伍英雄和对方回血量，还不能确认重伤装备由谁购买。请补充考虑的具体装备和主要输出方式，才能核对减疗触发条件。"
        : "아군 챔피언과 상대의 회복량만으로는 치유 감소 아이템을 누가 사야 할지 확인할 수 없어요. 고려 중인 아이템과 주로 피해를 주는 방식을 알려주시면 발동 조건을 확인할 수 있어요.";
    return { type: "code", answer: { kind: "text", text } };
  }
  if (!/오라|aura|光环/i.test(question) || !/중첩|겹|stack|叠加/i.test(question)) return undefined;
  const text = ctx.lang === "en_US" ? "Which item do you mean? I need its exact name to check whether the aura stacks."
    : ctx.lang === "zh_CN" ? "你指的是哪件装备？请给出具体装备名称，才能核对光环是否叠加。"
      : "어떤 아이템의 오라를 말하나요? 정확한 아이템 이름을 알려주시면 중첩 규칙을 확인할 수 있어요.";
  return { type: "code", answer: { kind: "text", text } };
}
