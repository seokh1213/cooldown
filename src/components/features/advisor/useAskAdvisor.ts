/**
 * 질문을 받아 코드 기억에서 대상을 복원하고, 질문별 검증 문장과 카드를 대화에 얹는다.
 *
 * 오타 후보·관점을 고르면 원래 질문을 고쳐 다시 묻는다. 그 원래 질문을 여기서 들고 있다.
 */
import { useRef } from "react";
import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";
import type { UseAdvisorResult } from "@/hooks/useAdvisor";
import type { AdvisorData } from "@/lib/advisor/context";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { suggestChampions } from "@/lib/advisor/championTypo";
import { nicknames } from "@/lib/advisor/intent";
import type { JudgeTier, PlanDeps } from "@/lib/advisor/planTypes";
import { answerDialogue } from "@/lib/advisor/dialogueFlow";
import type { DialogueReply } from "@/lib/advisor/dialogueReply";
import { dialogueMemoryOf, rememberAnswer } from "@/lib/advisor/dialogueState";
import { offlineJudge } from "@/lib/advisor/offlineJudge";
import { fetchJudgeFile } from "@/lib/advisor/storage";
import { docAnswer } from "@/lib/advisor/questionDocs";
import { josa } from "@/lib/knowledge/text";

interface AskAdvisorOptions {
  advisor: UseAdvisorResult;
  data: AdvisorData | null;
  /** 지금 화면에 떠 있는 챔피언. 이름을 생략한 질문이 여기에 기댄다. */
  championIds: string[];
  canUseModel: boolean;
}

/**
 * 오프라인 판정기(`public/models/offline/judge.{json,bin}`, 0.8MB) — 모델을 받지 않았거나 동의 전인 기기, 그리고 모델 판정이
 * 거절된 때의 판정기. 정적 파일이고 기기 밖으로 나가는 것이 없어 동의를 묻지 않는다. 처음 판정할 때 한 번 받아 들고 있고,
 * 판정 헤드와 같은 캐시(`fetchJudgeFile`)에 두어 한 번 받은 기기는 네트워크 없이도 돈다. 못 받으면 거절하고 낱말 규칙이 받는다.
 */
const offline = offlineJudge(async (file) => {
  const response = await fetchJudgeFile(`${import.meta.env.BASE_URL}${file}`);
  if (!response.ok) throw new Error(`오프라인 판정기 ${file} 를 받지 못했습니다`);
  return response.arrayBuffer();
});

const inferStatQuery: PlanDeps["inferStatQuery"] = import.meta.env.DEV && import.meta.env.VITE_STAT_CLASSIFIER_EXPERIMENT === "1"
  ? async (question, memory, ctx) => {
    const experiment = await import("../../../../scripts/llm/stat-classifier/browser");
    return experiment.inferStatQuery(question, memory, ctx);
  } : undefined;

/** 모델 판정기가 거절하면(헤드를 못 받음·다른 모델용·워커 오류) 오프라인 판정기로. 그마저 거절하면 부르는 단계가 낱말 규칙으로 간다. */
/** 모델 판정기가 시간 초과로 거절된 뒤에는 이 세션에서 다시 부르지 않는다 — 부를 때마다 30초를 기다리게 된다(판정 6회 연속 시간 초과, 2026-09-30). */
let modelJudgeStalled = false;
const modelThenOffline =
  (model: PlanDeps["judge"]): PlanDeps["judge"] =>
  (headName, state, questions) =>
    modelJudgeStalled
      ? offline(headName, state, questions)
      : model(headName, state, questions).catch((error: unknown) => {
          console.warn("[advisor] 모델 판정기 거절 — 오프라인 판정기로", error);
          if (/timeout/.test(String((error as Error)?.message ?? error))) modelJudgeStalled = true;
          return offline(headName, state, questions);
        });

export function useAskAdvisor({ advisor, data, championIds, canUseModel }: AskAdvisorOptions) {
  const { t, lang } = useTranslation();
  const copy = t.advisor;
  // 오타 후보를 물었을 때의 원래 질문. 고르면 그 말만 바꿔 다시 묻는다.
  const pendingQuestion = useRef<string>("");

  // 카드 위 해설은 모델이 쓰지 않는다. 답은 코드가 노트로 조립한다(`answerProse`).
  const deliver = (question: string, answer: AdvisorAnswer, notice?: string) => advisor.answerWithoutModel(question, answer, notice);

  /** 답변과 해당 시점의 기억을 같은 대화 턴에 기록한다. */
  const recordReply = (question: string, reply: DialogueReply, notice?: string) => {
    if (reply.respond) advisor.respond(question, reply.respond.plan);
    else advisor.answerWithoutModel(question, reply.answer ?? reply.text, reply.notice ?? notice, reply.related);
    if (reply.memory.patch) advisor.remember(reply.memory);
  };

  /** "혹시 이 자료를?" 에서 고른 자료를 보인다. 검색을 다시 돌리지 않는다. */
  const showDoc = (id: string, title: string) => {
    const answer = data ? docAnswer(data, lang, id, title) : undefined;
    if (!data || !answer) return;
    const previous = dialogueMemoryOf(advisor.turns, data);
    if (typeof answer === "string") {
      advisor.answerWithoutModel(title, answer);
      advisor.remember({ ...previous, active: "rule", rule: { title, text: answer } });
    } else {
      deliver(title, answer);
      advisor.remember(rememberAnswer(previous, answer));
    }
  };

  /** 오타를 고쳐 다시 들어올 수 있어 submit 과 분리했다. */
  const ask = async (question: string, notice?: string) => {
    // 질문을 받자마자 자리를 띄운다. 답이 정해지면 그 자리가 채워진다(`begin`).
    advisor.begin(question, copy.status.generating);
    // 모델을 받아 동의한 기기는 모델 판정기(거절하면 오프라인), 그 밖은 오프라인 판정기. 판정기가 아예 없는 길은 앱에 없다.
    const judge: JudgeTier = canUseModel && advisor.consented ? "model" : "offline";
    try {
      const ctx = {
        data,
        lang,
        copy,
        turns: advisor.turns,
        championIds,
        consented: advisor.consented,
        canUseModel,
        retrieval: Boolean(advisor.model.retrieval),
        judge,
        notice,
      };
      const deps = { judge: judge === "model" ? modelThenOffline(advisor.judge) : offline, search: advisor.search, inferStatQuery };
      const { dialogue, reply } = await answerDialogue(question, ctx, deps);
      if (dialogue.parts.some(p => p.plan.type === "code" && p.plan.pending)) pendingQuestion.current = question;
      recordReply(question, reply, notice);
    } finally {
      advisor.settle();
    }
  };

  /**
   * 관점을 골라 줬을 때. 물었던 문장에 그 말만 덧붙여 다시 묻는다.
   *
   * 새 문장을 지으면 "라인전" 같은 주제가 날아간다. 그리고 이 함수는 **컴포넌트
   * 수준에 둔다.** 렌더 안에서 만들면 `ask` 를 거쳐 ref 에 닿아 렌더 중 ref 접근으로
   * 잡힌다.
   */
  const askPerspective = (index: number, side: "playing" | "against") => {
    const asked = advisor.turns[index - 1];
    const original = asked?.role === "user" ? asked.content : "";
    if (!original) return;
    const suffix = side === "against" ? copy.card.perspectiveAgainst : copy.card.perspectivePlaying;
    void ask(`${original} (${suffix})`);
  };

  /** 오타 후보를 골랐을 때. 원래 질문에서 그 말만 바꿔 다시 묻는다. */
  const pickChampion = (championId: string) => {
    const card = data?.cardById.get(championId);
    const original = pendingQuestion.current;
    if (!data || !card || !original) return;
    pendingQuestion.current = "";
    const typo = suggestChampions(original, data.cards, nicknames(data.cards));
    // 오타였으면 그 말을 바꾸고, 화면의 둘 중 하나를 고른 것이면 이름을 앞에 붙인다.
    const fixed = typo ? original.replace(typo.original, card.name) : `${card.name} ${original}`;
    void ask(fixed, fill(copy.card.understoodAs, { name: card.name, nameWith: josa(card.name, "로/으로") }));
  };

  return { ask, showDoc, askPerspective, pickChampion };
}
