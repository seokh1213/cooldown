/**
 * 질문을 받아 답을 낸다 — 답 고르기(`planAnswer`)를 부르고, 고른 길(`AnswerPlan`)대로 대화에 얹는다.
 *
 * 오타 후보·관점을 고르면 원래 질문을 고쳐 다시 묻는다. 그 원래 질문을 여기서 들고 있다.
 */
import { useRef } from "react";
import { useTranslation, type Language } from "@/i18n";
import { fill } from "@/i18n/fill";
import type { UseAdvisorResult } from "@/hooks/useAdvisor";
import type { AdvisorData } from "@/lib/advisor/context";
import { buildCompareAnswer as buildCompareCard, type AdvisorAnswer } from "@/lib/advisor/answer";
import { matchupNotes } from "@/lib/advisor/playbookNotes";
import { suggestChampions } from "@/lib/advisor/championTypo";
import { nicknames } from "@/lib/advisor/intent";
import { loadPrecomputed, precomputedDigest, precomputedMore } from "@/lib/advisor/precomputed";
import { planAnswer, type AnswerPlan, type JudgeTier, type PlanDeps } from "@/lib/advisor/plan";
import { offlineJudge } from "@/lib/advisor/offlineJudge";
import { fetchJudgeFile } from "@/lib/advisor/storage";
import { docAnswer } from "@/lib/advisor/questionDocs";
import { josa } from "@/lib/knowledge/text";
import type { ChampionCard } from "@/lib/knowledge/facts";

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

/** 모델 판정기가 거절하면(헤드를 못 받음·다른 모델용·워커 오류) 오프라인 판정기로. 그마저 거절하면 부르는 단계가 낱말 규칙으로 간다. */
const modelThenOffline =
  (model: PlanDeps["judge"]): PlanDeps["judge"] =>
  (headName, state, questions) =>
    model(headName, state, questions).catch((error: unknown) => {
      console.warn("[advisor] 모델 판정기 거절 — 오프라인 판정기로", error);
      return offline(headName, state, questions);
    });

export function useAskAdvisor({ advisor, data, championIds, canUseModel }: AskAdvisorOptions) {
  const { t, lang } = useTranslation();
  const copy = t.advisor;
  // 오타 후보를 물었을 때의 원래 질문. 고르면 그 말만 바꿔 다시 묻는다.
  const pendingQuestion = useRef<string>("");

  const deliverMatchup = async (question: string, mine: ChampionCard, enemy: ChampionCard, notice?: string, focus?: string, more = false) => {
    if (!data) return;
    advisor.answerWithoutModel(question, await matchupAnswer(data, lang, question, mine, enemy, focus, more), notice);
  };

  // 카드 위 해설은 모델이 쓰지 않는다. 답은 코드가 노트로 조립한다(`answerProse`).
  const deliver = (question: string, answer: AdvisorAnswer, notice?: string) => advisor.answerWithoutModel(question, answer, notice);

  /** "혹시 이 자료를?" 에서 고른 자료를 보인다. 검색을 다시 돌리지 않는다. */
  const showDoc = (id: string, title: string) => {
    const answer = data ? docAnswer(data, lang, id, title) : undefined;
    if (typeof answer === "string") advisor.answerWithoutModel(title, answer);
    else if (answer) deliver(title, answer);
  };

  /** 오타를 고쳐 다시 들어올 수 있어 submit 과 분리했다. */
  const ask = async (question: string, notice?: string) => {
    // 질문을 받자마자 자리를 띄운다. 답이 정해지면 그 자리가 채워진다(`begin`).
    advisor.begin(question, copy.status.generating);
    // 모델을 받아 동의한 기기는 모델 판정기(거절하면 오프라인), 그 밖은 오프라인 판정기. 판정기가 아예 없는 길은 앱에 없다.
    const judge: JudgeTier = canUseModel && advisor.consented ? "model" : "offline";
    try {
      const plan = await planAnswer(
        question,
        {
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
        },
        { judge: judge === "model" ? modelThenOffline(advisor.judge) : offline, search: advisor.search },
      );
      await execute(question, plan);
    } finally {
      advisor.settle();
    }
  };

  const execute = async (question: string, plan: AnswerPlan) => {
    switch (plan.type) {
      case "card":
        deliver(question, plan.answer, plan.notice);
        return;
      case "matchup":
        await deliverMatchup(question, plan.mine, plan.enemy, plan.notice, plan.focus, plan.more);
        return;
      case "code":
        if (plan.pending) pendingQuestion.current = question;
        advisor.answerWithoutModel(question, plan.answer, plan.notice, plan.related);
        return;
      case "retry":
        void ask(plan.question, plan.notice);
        return;
      case "respond":
        advisor.respond(question, plan.plan);
        return;
      default: {
        const exhaustive: never = plan;
        return exhaustive;
      }
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

/**
 * 상성 카드 + 내 챔피언 시점 해설. 재료는 사람이 검증한 지식 카드만.
 *
 * **모델 크기로 갈래를 두지 않는다.**
 *
 * 한때 가벼운 모델에게는 해설을 맡기지 않았다. 0.8B 가 상성에서 카드를 통째로
 * 되읊길래 뺐는데, 그러면 상성 질문에 카드만 뜨고 한 글자도 안 나온다. 모델을
 * 올려 두었는데 말을 안 하는 것은 고장으로 보인다.
 *
 * 그래서 모델마다 재료를 달리 주는 쪽을 재 봤다. 스킬 표를 빼고 할 일을 두세
 * 문장으로 좁히는 판본이다. 0.8B 는 덜 망가졌지만(걷어냄 71 → 48, 고리 5 → 1)
 * 나아진 것이 아니라 조용해진 것이었다 — 남은 문장의 54% 가 노트 베끼기이고
 * 시점 놓침은 오히려 가장 나빴다(5/14). 같은 판본을 4B 에 주니 529 자 답이
 * 194 자로 깎였다. 좋은 모델을 망가뜨려 나쁜 모델을 덜 티 나게 만드는 거래다.
 *
 * 게다가 저 `고리 5` 는 재는 도구 탓이 크다. 워커에는 같은 문장이 세 번 나오면
 * 끊는 장치가 있는데 평가 하네스에는 없다.
 *
 * 모델과 무관한 장치가 뒤를 받친다 — 근거 검사가 틀린 문장을 걷어내고 슬롯을
 * 바로잡으며, 워커가 반복을 끊는다.
 *
 * 가벼운 모델(0.8B)은 **해설을 쓰지 않는다.** 칸 나눠 쓰기, 짧은 프롬프트와 예시,
 * 바꿔 쓰기, int8 판본까지 재 봤지만 14쌍 1~5점 채점에서 전부 1~2점이었다. 대신
 * 검증된 노트를 코드가 골라 조립한다(`matchupDigest`, 3.8점). 모델이 없는 기기와 같은
 * 길이다. 0.8B 는 판정기로만 쓴다(`judge.ts`). (4B 를 쓰던 때에는 4B 가 그대로 해설을 썼다.)
 */
async function matchupAnswer(
  data: AdvisorData,
  lang: Language,
  question: string,
  mine: ChampionCard,
  enemy: ChampionCard,
  focus: string | undefined,
  more: boolean,
): Promise<AdvisorAnswer> {
  const notes = matchupNotes(data, mine, enemy, lang);
  if (notes.plan && focus) notes.plan.focus = focus;
  if (notes.plan) notes.plan.question = question;
  const answer = buildCompareCard([mine, enemy], question, undefined, { matchup: true, notes, lang });
  // 미리 써 둔 답이 있으면 그것을 보인다. 없으면 아래에서 노트를 조립한다.
  if (answer.kind === "compare") {
    answer.more = more || undefined;
    const pair = (await loadPrecomputed(data.patch, mine.id, lang))?.pairs[enemy.id];
    // "더 자세히" 는 처음 답에 싣지 않은 칸을 보인다. 남은 칸이 없으면 노트를 펼친다.
    const text = pair
      ? more
        ? precomputedMore(pair, notes.plan?.focus, [mine, enemy], lang)
        : precomputedDigest(pair, notes.plan?.focus, [mine, enemy], lang)
      : undefined;
    // 큰 모델이 검증된 재료로 미리 쓴 글이다
    if (text) answer.precomputed = text;
  }
  return answer;
}
