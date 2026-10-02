/** 질문 하나의 자료 계획. 질문 이해 뒤 지식 → 상성 → 개별 대상 → 노트 순서로 찾는다. */
import { advisorSystemPrompt } from "./persona";
import { asksAboutHelper, isSmallTalk } from "./intent";
import { type AnswerPlan, type PlanContext, type PlanDeps, type Step } from "./planTypes";
import { resolveQuestion, type QuestionInput } from "./resolvedQuestion";
import { directFactPlan } from "./directFactPlan";
import { knowledgeFactPlan } from "./knowledgeFactPlan";
import { understand } from "./questionUnderstanding";
import { answerByVector, answerRuleQuestion, fixChampionTypo, answerGameFact, answerFromNotes } from "./knowledgePlans";
import { continueMatchup } from "./matchupPlans";
import { answerNewMatchup } from "./newMatchupPlan";
import { answerItemOrMechanics, answerChampion } from "./championPlans";

/** 자료 계획의 9개 처리기. 새 상성의 이름 수별 3개 처리기를 하나로 합쳐 기존 우선순위를 유지한다. */
const ANSWER_STAGES = {
  knowledge: [answerByVector, answerRuleQuestion, fixChampionTypo, answerGameFact],
  matchup: [continueMatchup, answerNewMatchup],
  entity: [answerItemOrMechanics, answerChampion],
  notes: [answerFromNotes],
} satisfies Record<string, Step[]>;

/** 질문을 한 번 이해하고, 각 책임의 자료 처리기를 차례로 실행한다. */
export async function planAnswer(input: QuestionInput, ctx: PlanContext, deps: PlanDeps): Promise<AnswerPlan> {
  const { data, copy } = ctx;
  const question = typeof input === "string" ? input : input.text;
  if (!data) return { type: "respond", plan: { system: advisorSystemPrompt(ctx.lang), withoutConsent: copy.noModel } };

  // 잡담·도우미 자신은 자료로 답할 것이 아니다. 상성 대화 중이어도 먼저 받는다("고마워 덕분에 이겼다" 가 상성 이어 묻기로 갔다).
  if (isSmallTalk(question)) return { type: "code", answer: copy.smallTalk };
  /*
    도우미 자신을 묻는 말을 검색으로 흘려보냈더니 모델이 아무 검색어나 만들어 내고 화면에 "찾은 자료: 와드"
    가 붙었다. 우리가 답을 아는 질문이라 모델을 부르지 않는다. 작은 모델은 페르소나를
    무시하고 "저는 Google AI입니다" 라고 답한 적이 있고, 큰 모델이라 해도
    이 답은 기다릴 이유가 없다. 화면 곳곳에 적어 둔 말과 어긋나서도 안 된다.
  */
  if (asksAboutHelper(question)) return { type: "code", answer: copy.identity };

  const resolved = resolveQuestion(input, data);
  const knowledgeFact = knowledgeFactPlan(resolved, ctx);
  if (knowledgeFact) return knowledgeFact;
  const fact = directFactPlan(resolved, ctx);
  if (fact) return fact;
  const intent = await understand(resolved, ctx, data, deps);
  for (const steps of Object.values(ANSWER_STAGES)) {
    for (const step of steps) {
      const plan = await step(intent, deps);
      if (plan) return plan;
    }
  }
  return { type: "respond", plan: { system: advisorSystemPrompt(ctx.lang), withoutConsent: copy.noModel } };
}

export type { AnswerPlan, PlanTurn, JudgeTier, PlanContext, PlanDeps, Intent } from "./planTypes";
export { ROUTE_HEAD, TOPIC_HEAD, ACT_HEAD, KEV_HEAD } from "./judgeHeads";
export { understand } from "./questionUnderstanding";
export { pickMatchupSides } from "./newMatchupPlan";
export { GENERIC_ADVICE } from "./askWords";
