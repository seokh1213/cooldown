/**
 * 상성 코치 상태 관리
 *
 * 동의 → 모델 내려받기 → 적재 → 대화 순서를 한 곳에서 다룬다.
 * **동의 전에는 워커를 만들지 않는다.** 워커를 만드는 순간 모델을 받기 시작하므로,
 * 사용자가 허락하기 전에 수백 MB 를 내려받는 일이 없어야 한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONSENT_STORAGE_KEY,
  detectWebGpu,
  estimateStorageMb,
  ADVISOR_MODEL,
  type AdvisorModel,
  type WebGpuSupport,
} from "@/lib/advisor/config";
import { deleteModelCache, fetchJudgeFile, pruneOtherModels } from "@/lib/advisor/storage";
import { loadDocVectors, ranked, type DocVectors } from "@/lib/advisor/docVectors";
import { questionLanguage } from "@/lib/advisor/questionLanguage";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import type { AdvisorFileProgress } from "@/lib/advisor/protocol";
import { readJudgeHead, scoreJudge, type JudgeHead, type JudgeHeadMeta, type JudgeQuestion } from "@/lib/advisor/judge";
import { useTranslation } from "@/i18n";
import { useAdvisorTurns, type AdvisorTurn } from "./useAdvisorTurns";
import { useAdvisorWorker, type AdvisorStatus } from "./useAdvisorWorker";

/** `respond` 한 번에 필요한 것. 자료는 부르는 쪽(코드)이 모아서 `system` 에 싣는다. */
export interface RespondPlan {
  /** 페르소나 + 코드가 모은 자료 */
  system: string;
  /** 코드가 만든 카드. 주면 답보다 먼저 얹고, 모델은 그 위에 해설만 쓴다. */
  answer?: AdvisorAnswer;
  /** 말풍선에 붙일 안내(오타를 고쳤다는 등) */
  notice?: string;
  /** 동의 전이면 모델을 부르지 않고 이 글을 답으로 얹는다. 주지 않으면 그냥 보낸다. */
  withoutConsent?: string;
  maxTokens?: number;
}

export interface UseAdvisorResult {
  status: AdvisorStatus;
  /** 모델이 GPU 에 올라갔는지. 적재 전에 질문하면 생성 상태와 겹치므로 따로 둔다. */
  modelReady: boolean;
  consented: boolean;
  webgpu: WebGpuSupport | null;
  storage: { quotaMb?: number; usageMb?: number };
  progress: { loadedBytes: number; totalBytes: number; files: AdvisorFileProgress[] };
  turns: AdvisorTurn[];
  error: string | null;
  accept: () => void;
  /** 이미 동의한 사용자가 대화창을 열었을 때 적재를 시작한다 */
  ensureLoaded: () => void;
  /**
   * 모델이 답을 쓰는 유일한 길. 자세한 것은 구현의 주석.
   */
  respond: (question: string, plan: RespondPlan) => void;
  /**
   * 판정기로 고른다. 글을 쓰지 않는다. 질문마다 선택지 확률을 돌려준다.
   * 헤드가 지금 모델용이 아니거나 모델이 없으면 거절하므로 부르는 쪽이 규칙으로 되돌아간다.
   */
  judge: (headName: string, state: string, questions: JudgeQuestion[]) => Promise<number[][]>;
  /**
   * 이름 없는 질문의 자료를 검색 LoRA 벡터로 찾는다(`model.retrieval`). 질문 언어의 문서 전부를 코사인 순으로(가까운 것이 맨 앞).
   * 낱말 점수와 합치고 문턱을 보는 것은 부르는 쪽(`hybridSearch`)이다. 모델에 검색 가지가 없거나 동의 전이면 거절하므로 부르는 쪽이 낱말 검색으로 되돌아간다.
   */
  search: (question: string, lang: string) => Promise<Array<{ id: string; score: number }>>;
  /** 모델 없이 코드가 만든 답을 그대로 보여 준다. 동의 전이나 WebGPU 가 없을 때 쓴다. */
  answerWithoutModel: (question: string, answer: string | AdvisorAnswer, notice?: string, related?: AdvisorTurn["related"]) => void;
  /**
   * 질문을 받자마자 말풍선 자리를 띄우고 "생각하는 중" 을 보인다. 답(`answerWithoutModel`·`respond`)이 이 자리를 채운다.
   * 판정기·노트 찾기가 1~3초 걸리는 동안 화면이 멈춘 것처럼 보이지 않게 한다. 이미 띄운 자리가 있으면 아무것도 안 한다.
   */
  begin: (question: string, label: string) => void;
  /** 질문을 다 풀었는데 띄운 자리를 쓰지 않았으면 걷는다. */
  settle: () => void;
  /** 자리를 띄워 두고 답을 찾는 중이거나, 코드가 쓴 답을 흘려 보이는 중 */
  working: boolean;
  /** 답변 평가. 기기 안에만 쌓인다. */
  rate: (turnId: number, rating: "up" | "down", patch: string) => void;
  /**
   * 내려받은 모델을 삭제하고 처음 상태로 되돌린다.
   *
   * 캐시만 지우면 안 된다. 워커가 모델을 메모리에 들고 있어서 그대로면 계속 답한다.
   * 동의도 거둬야 다음에 열 때 "모델(570MB)을 받겠습니까" 를 다시 묻는다.
   */
  deleteModel: () => Promise<void>;
  /** 지금 쓰는 모델. 화면이 용량과 이름을 보여 준다. */
  model: AdvisorModel;
  stop: () => void;
  reset: () => void;
  /** 저장된 대화를 통째로 올린다. id 가 겹치지 않게 다음 id 를 그 뒤로 옮긴다. */
  replaceTurns: (turns: AdvisorTurn[]) => void;
}

/** 판정 헤드. kev LoRA 헤드 하나로 모든 판정을 한다. 모델을 올리면 미리 받아 둔다. */
const KEV_JUDGE_HEADS = ["kev-b3e"];

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

export function useAdvisor(): UseAdvisorResult {
  // 코드가 쓰는 답문도 화면 언어를 따라야 한다.
  const { lang } = useTranslation();
  const [consented, setConsented] = useState(readConsent);
  const [webgpu, setWebgpu] = useState<WebGpuSupport | null>(null);
  const [storage, setStorage] = useState<{ quotaMb?: number; usageMb?: number }>({});
  const [error, setError] = useState<string | null>(null);
  const {
    turns,
    setTurns,
    takeId,
    begin,
    place,
    settle,
    reveal,
    finishReveal,
    working,
    appendChunk,
    completeReply,
    answerWithoutModel,
    rate,
    reset,
    replaceTurns,
  } = useAdvisorTurns(lang, setError);
  const { status, setStatus, progress, modelReady, post, requestJudge, requestEmbed, interrupt, hasWorker, shutdown } = useAdvisorWorker({
    onChunk: appendChunk,
    onDone: completeReply,
    setError,
  });

  /** 문서 벡터(주소마다 한 번만 받는다) */
  const docVectors = useRef(new Map<string, Promise<DocVectors>>());
  /** 받아 둔 판정 헤드. 이름으로 찾는다. */
  const judgeHeads = useRef(new Map<string, Promise<JudgeHead>>());
  const model = ADVISOR_MODEL;

  useEffect(() => {
    void detectWebGpu().then(setWebgpu);
    void estimateStorageMb().then(setStorage);
  }, []);

  const accept = useCallback(() => {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    } catch {
      // 저장에 실패해도 이번 세션에서는 쓸 수 있게 둔다
    }
    setConsented(true);
    setError(null);
    setStatus("downloading");
    post({ type: "load", model });
  }, [post, model, setStatus]);

  /**
   * 동의는 이미 받았고 아직 적재하지 않았으면 지금 시작한다.
   * 위젯이 늘 떠 있으므로 화면을 켜자마자 받게 하지 않고, 대화창을 연 시점에 시작한다.
   */
  const ensureLoaded = useCallback(() => {
    if (!consented || modelReady || hasWorker()) return;
    setStatus("downloading");
    post({ type: "load", model });
  }, [consented, modelReady, hasWorker, post, model, setStatus]);

  /**
   * 동의 없이 모델을 부르려 했는지 본다.
   *
   * `send` 계열은 워커를 만들고, 워커를 만드는 순간 모델(570MB)을 받기 시작한다.
   * "모델 없이 써보기" 를 고른 사용자가 코드가 못 답하는 질문을 던지면 실제로 그 일이
   * 벌어졌다. 내려받기를 거절했는데 받아 버리는 셈이라 여기서 막는다.
   */
  const refuseWithoutConsent = useCallback((question: string, notice: string): boolean => {
    if (consented) return false;
    setError(null);
    const id = place(question, { role: "assistant", content: "" });
    reveal(id, notice);
    return true;
  }, [consented, place, reveal]);

  /**
   * 모델이 답을 쓰는 유일한 길.
   *
   * 예전에는 네 갈래였다. `send`(대화 전체를 넘기고 알아서), `sendWithAnswer`(카드 먼저, 해설만),
   * `sendWithTools`(도구를 쥐여 주고 고르게), `sendWithSearch`(검색어만 짓게 하고 찾기는 코드가).
   * 재 보니 이긴 쪽은 늘 **코드가 자료를 모으고 모델은 마지막에 한 번 쓰는** 쪽이었다.
   *   - 도구: 여덟 문항 중 셋은 도구를 부르지 않았고, 네 턴을 줘도 다시 찾은 적이 없다. 쓰는 곳도 없어 지웠다.
   *   - 대화 전체: 앞 턴 글이 쌓이면 작은 모델이 맥락을 놓친다. 맥락(상성·최근 챔피언)은 코드가 쥐고
   *     자료로 싣는다. 그래서 질문 한 줄만 넘긴다.
   * 모델이 검색어를 짓고 코드가 찾던 길(`search`)도 있었으나 이름 없는 질문을 검색 LoRA 벡터(`search`)가 맡으면서 지웠다.
   */
  const respond = useCallback(
    (question: string, plan: RespondPlan) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      if (plan.withoutConsent !== undefined && refuseWithoutConsent(trimmed, plan.withoutConsent)) return;
      const { system, answer, notice, maxTokens } = plan;
      setError(null);
      setStatus("generating");
      const replyId = place(trimmed, { role: "assistant", content: "", answer, notice });
      post({ type: "generate", id: replyId, model, system, messages: [{ role: "user", content: trimmed }], maxTokens });
    },
    [post, model, refuseWithoutConsent, place, setStatus],
  );

  /** 판정 헤드를 한 번만 받아 둔다. 실패하면 다음에 다시 받는다. */
  const loadJudgeHead = useCallback((headName: string): Promise<JudgeHead> => {
    let pending = judgeHeads.current.get(headName);
    if (!pending) {
      const base = `${import.meta.env.BASE_URL}models/judge/${headName}`;
      pending = Promise.all([fetchJudgeFile(`${base}.json`), fetchJudgeFile(`${base}.bin`)]).then(async ([metaRes, binRes]) => {
        if (!metaRes.ok || !binRes.ok) throw new Error(`판정 헤드 ${headName} 를 받지 못했습니다`);
        return readJudgeHead((await metaRes.json()) as JudgeHeadMeta, await binRes.arrayBuffer());
      });
      judgeHeads.current.set(headName, pending);
      pending.catch(() => judgeHeads.current.delete(headName));
    }
    return pending;
  }, []);

  /**
   * 판정기로 고른다.
   *
   * 헤드는 처음 쓸 때 한 번 받아 둔다(수 MB). 헤드가 배운 모델과 지금 모델이 다르면
   * 거절한다 — 다른 모델의 속내에 붙이면 확률이 뜻을 잃는다.
   */
  const judge = useCallback(
    async (headName: string, state: string, questions: JudgeQuestion[]): Promise<number[][]> => {
      if (!consented) throw new Error("동의 전에는 모델을 부르지 않습니다");
      const head = await loadJudgeHead(headName);
      if (head.model.id !== model.id || head.model.dtype !== model.dtype || (head.model.graph ?? "") !== (model.graph ?? "")) {
        throw new Error(`판정 헤드 ${headName} 는 ${head.model.id} 용입니다`);
      }
      const id = takeId();
      const features = await requestJudge({ type: "judge", id, model, state, questions, subset: head.subset, feature: head.feature });
      return features.map((flat, index) => {
        const positions = questions[index].options.length + 1;
        const rows = Array.from({ length: positions }, (_, k) => flat.subarray(k * head.dim, (k + 1) * head.dim));
        return scoreJudge(head, rows);
      });
    },
    [consented, model, requestJudge, loadJudgeHead, takeId],
  );

  const search = useCallback(
    async (question: string, lang: string): Promise<Array<{ id: string; score: number }>> => {
      const retrieval = model.retrieval;
      if (!consented || !retrieval) throw new Error("검색 벡터가 없는 모델입니다");
      let pending = docVectors.current.get(retrieval.vectors);
      if (!pending) {
        pending = loadDocVectors(`${import.meta.env.BASE_URL}${retrieval.vectors}`);
        docVectors.current.set(retrieval.vectors, pending);
        pending.catch(() => docVectors.current.delete(retrieval.vectors));
      }
      const vectors = await pending;
      // 질문 글자로 언어를 정한다. 화면 언어로 찾았더니 한국어 화면의 "Does ignite work with conqueror?" 가 한국어 문서 벡터와
      // 멀어 아무것도 못 찾았다(낱말 찾기는 세 언어 이름을 다 본다).
      const asked = questionLanguage(question) ?? lang;
      const block = vectors.languages[asked] ?? vectors.languages[lang] ?? vectors.languages.ko_KR;
      const prompt = (vectors.prompt[asked] ?? vectors.prompt[lang] ?? vectors.prompt.ko_KR).replace("{}", question);
      const id = takeId();
      const query = await requestEmbed({ type: "embed", id, model, text: prompt });
      return ranked(query, block.matrix, block.ids);
    },
    [consented, model, requestEmbed, takeId],
  );

  /*
   * 모델을 다 올렸으면 판정 헤드를 미리 받아 둔다.
   *
   * 처음 판정할 때 받으면, 모델만 받아 두고 오프라인이 된 사용자는 판정기를 한 번도
   * 못 쓴다. 모델 적재가 끝난 때가 네트워크가 확실히 있던 마지막 순간이다.
   */
  useEffect(() => {
    if (!modelReady) return;
    for (const name of KEV_JUDGE_HEADS) void loadJudgeHead(name).catch(() => undefined);
    // 예전 모델(Qwen3 4B)을 받아 둔 기기라면 그 파일을 치운다(`pruneOtherModels`)
    void pruneOtherModels(model.id);
  }, [modelReady, model.id, loadJudgeHead]);

  const stop = useCallback(() => {
    finishReveal();
    interrupt();
    setStatus("ready");
  }, [finishReveal, interrupt, setStatus]);

  /**
   * 올려 둔 모델을 내린다.
   *
   * 워커를 먼저 내린다. 살아 있으면 모델을 메모리에 든 채로 계속 답해서, 지웠는데도
   * 지워지지 않은 것처럼 보인다. 그다음 캐시를 지우고 동의를 거둔다 — 다음에 받을
   * 것은 용량이 다를 수 있으므로 다시 물어야 한다.
   */
  const teardown = useCallback(async () => {
    shutdown();
    await deleteModelCache();
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // 못 지워도 캐시는 비었으므로 다시 받게 된다
    }
    setConsented(false);
    void estimateStorageMb().then(setStorage);
  }, [shutdown]);

  /** 내려받은 모델을 삭제한다. 보고 있던 대화도 치운다 — 지우겠다는 뜻이 그것이다. */
  const deleteModel = useCallback(async () => {
    setTurns([]);
    await teardown();
  }, [setTurns, teardown]);

  return {
    status,
    modelReady,
    consented,
    webgpu,
    storage,
    progress,
    turns,
    error,
    accept,
    ensureLoaded,
    respond,
    judge,
    search,
    answerWithoutModel,
    begin,
    settle,
    working,
    rate,
    deleteModel,
    model,
    stop,
    reset,
    replaceTurns,
  };
}
