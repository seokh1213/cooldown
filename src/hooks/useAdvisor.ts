/**
 * 상성 코치 상태 관리
 *
 * 동의 → 모델 내려받기 → 적재 → 대화 순서를 한 곳에서 다룬다.
 * **동의 전에는 워커를 만들지 않는다.** 워커를 만드는 순간 모델을 받기 시작하므로,
 * 사용자가 허락하기 전에 수 기가바이트를 내려받는 일이 없어야 한다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONSENT_STORAGE_KEY,
  detectWebGpu,
  estimateStorageMb,
  autoModel,
  currentModelChoice,
  modelChoiceKey,
  resolveModel,
  writeModelChoice,
  type AdvisorModel,
  type WebGpuSupport,
} from "@/lib/advisor/config";
import { deleteModelCache, fetchJudgeFile } from "@/lib/advisor/storage";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { answerProse } from "@/lib/advisor/prose";
import { readJudgeHead, scoreJudge, type JudgeHead, type JudgeHeadMeta, type JudgeQuestion } from "@/lib/advisor/judge";
import { useTranslation } from "@/i18n";
import type {
  AdvisorChatMessage,
  AdvisorFileProgress,
  AdvisorRequest,
  AdvisorResponse,
} from "@/lib/advisor/protocol";

export type AdvisorStatus =
  /** 아직 동의를 받지 않았다 */
  | "idle"
  /** 모델 파일을 내려받는 중 */
  | "downloading"
  /** 내려받기는 끝났고 GPU 에 올리는 중 */
  | "warming"
  | "ready"
  /** 답변을 만드는 중 */
  | "generating"
  | "error";

export interface AdvisorTurn extends AdvisorChatMessage {
  id: number;
  /** 생성이 끝난 뒤 붙는 실측치 */
  /** ttft 는 프롬프트를 읽는 데 쓴 시간이다. 나머지가 글을 쓰는 시간이다. */
  stats?: { tokens: number; seconds: number; ttft?: number; promptTokens?: number };
  /** 사용자가 남긴 평가 */
  rating?: "up" | "down";
  /**
   * 지금 무엇을 하는 중인지. 답이 나오면 지운다.
   *
   * 검색 폴백은 모델을 두 번 부르고 그 사이에 코드가 찾는다. 그동안 화면에는
   * 도는 점만 있어서 멈춘 것처럼 보였다. 무슨 일이 도는지 한 줄로 알린다.
   */
  activity?: string;
  /**
   * 답의 근거가 된 자료 이름.
   *
   * "자료에 있는 것만 답한다" 가 설계인데 어느 자료인지 안 보이면 사용자가
   * 맞는지 가릴 수 없다. 틀린 자료를 물어 온 경우에도 그 사실이 드러나야 한다.
   */
  sources?: string[];
  /**
   * 코드가 만든 구조화된 답. 화면이 종류별 카드로 그린다.
   * 이것이 있으면 `content` 는 카드 위에 놓이는 모델 해설이다.
   */
  answer?: AdvisorAnswer;
  /** 답 위에 작게 붙는 알림. "럼블로 이해했습니다" 같은 것. */
  notice?: string;
  /**
   * `content` 를 코드가 썼는가.
   *
   * 모델이 쓴 글은 카드 위에 얹히는 **해설**이라 "해설" 딱지와 세로줄을 달고 나간다.
   * 코드가 쓴 글은 해설이 아니라 **답 자체**라 그 딱지를 달면 거짓말이 된다.
   * 근거 검사도 모델이 쓴 글에만 돌린다 — 코드가 쓴 글은 카드에서 옮긴 값이다.
   */
  byCode?: boolean;
}

/**
 * 답변 평가 기록.
 *
 * 지금은 평가 케이스 10건으로 내가 재는 게 전부다. 실제로 어떤 질문이 어떤 답을 받았고
 * 사용자가 어떻게 봤는지는 알 방법이 없다. 기기 안에만 쌓고 서버로 보내지 않는다.
 */
export interface AdvisorFeedback {
  at: string;
  question: string;
  answer: string;
  rating: "up" | "down";
  patch: string;
}

const FEEDBACK_KEY = "cooldown.advisor.feedback.v1";
const FEEDBACK_LIMIT = 200;

export function readFeedback(): AdvisorFeedback[] {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? "[]") as AdvisorFeedback[];
  } catch {
    return [];
  }
}

export interface SearchRoundOptions {
  /** 검색어를 만들게 할 때 쓸 지시문. */
  querySystem: string;
  /** 회차마다 모델에게 건넬 글. 앞서 헛물켠 검색어를 함께 넘긴다. */
  buildPrompt: (tried: string[]) => string;
  /** 모델이 뱉은 글에서 검색어만 추린다. */
  extract: (text: string) => string;
  /**
   * 검색을 실제로 한다. 코드가 한다.
   * 아무것도 못 찾으면 undefined 를 돌려준다. 그때만 다시 찾는다.
   * 찾긴 찾았는데 엉뚱한 경우는 가려낼 수 없다 — 점수로 맞고 틀림이 안 갈렸다.
   */
  search: (query: string) => { context: string; titles: string[] } | undefined;
  /** 진행 상태에 붙일 말. 회차마다 화면에 보인다. */
  labels: { searching: string; searched: string };
  /** 못 찾았을 때 검색어를 몇 번까지 다시 만들지. */
  maxRounds: number;
  /** 끝내 못 찾았을 때 쓸 지시문. */
  fallbackSystem: string;
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
  /** tools 를 넘기면 모델이 조회 도구를 부를 수 있다. 복합 질문에만 쓴다. */
  /**
   * `notice` 를 주면 동의 전에는 모델을 부르지 않고 그 글을 대신 답으로 얹는다.
   * 주지 않으면 예전처럼 바로 보낸다.
   */
  send: (text: string, system?: string, tools?: unknown[], notice?: string) => void;
  /**
   * 판정기로 고른다. 글을 쓰지 않는다. 질문마다 선택지 확률을 돌려준다.
   * 헤드가 지금 모델용이 아니거나 모델이 없으면 거절하므로 부르는 쪽이 규칙으로 되돌아간다.
   */
  judge: (headName: string, state: string, questions: JudgeQuestion[]) => Promise<number[][]>;
  /** 모델 없이 코드가 만든 답을 그대로 보여 준다. 동의 전이나 WebGPU 가 없을 때 쓴다. */
  answerWithoutModel: (question: string, answer: string | AdvisorAnswer, notice?: string) => void;
  /**
   * 카드는 지금, 해설은 나중에.
   * 구조화된 답을 먼저 얹고 모델에게 해설만 만들게 한다. 해설은 카드 위에 스트리밍된다.
   */
  sendWithAnswer: (question: string, system: string, answer: AdvisorAnswer, notice?: string, maxTokens?: number) => void;
  /** 도구를 주고 여러 번 오간다. 복합 질문에만 쓴다. */
  sendWithTools: (
    question: string,
    system: string,
    tools: unknown[],
    execute: (calls: Array<{ name: string; args: Record<string, string> }>) => string,
    parse: (text: string) => Array<{ name: string; args: Record<string, string> }>,
    fallbackSystem?: string,
    lookingLabel?: string,
  ) => void;
  /**
   * 모델에게 검색어를 만들게 해서 자료를 찾은 뒤 답한다.
   * 개체가 안 잡혀 자료 없이 나갈 질문에만 쓴다.
   */
  sendWithSearch: (question: string, system: string, options: SearchRoundOptions) => void;
  /**
   * 질문이 무엇을 묻는지 모델에게 묻는다. 화면에는 아무것도 남지 않는다.
   * 모델이 없거나 실패하면 거절하므로 부르는 쪽이 규칙으로 되돌아간다.
   */
  classify: (system: string, question: string, maxTokens?: number) => Promise<string>;
  /** 답변 평가. 기기 안에만 쌓인다. */
  rate: (turnId: number, rating: "up" | "down", patch: string) => void;
  /**
   * 내려받은 모델을 삭제하고 처음 상태로 되돌린다.
   *
   * 캐시만 지우면 안 된다. 워커가 모델을 메모리에 들고 있어서 그대로면 계속 답한다.
   * 동의도 거둬야 다음에 열 때 "3GB 를 받겠습니까" 를 다시 묻는다.
   */
  deleteModel: () => Promise<void>;
  /** 지금 쓰는 모델. 화면이 용량과 이름을 보여 준다. */
  model: AdvisorModel;
  /** 쓸 모델을 바꾼다. 받아 둔 것을 지우고 워커를 새로 올린다. 대화는 남는다. */
  chooseModel: (key: string) => Promise<void>;
  /** 지금 쓰는 모델이 목록의 어느 줄인가. */
  modelChoice: string;
  stop: () => void;
  reset: () => void;
  /** 저장된 대화를 통째로 올린다. id 가 겹치지 않게 다음 id 를 그 뒤로 옮긴다. */
  replaceTurns: (turns: AdvisorTurn[]) => void;
}

/** 가벼운 모델이 쓰는 판정 헤드. 모델을 올리면 미리 받아 둔다. */
const LITE_JUDGE_HEADS = ["route-v2", "topic-v1"];

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
  const [status, setStatus] = useState<AdvisorStatus>("idle");
  const [webgpu, setWebgpu] = useState<WebGpuSupport | null>(null);
  const [storage, setStorage] = useState<{ quotaMb?: number; usageMb?: number }>({});
  const [progress, setProgress] = useState({ loadedBytes: 0, totalBytes: 0, files: [] as AdvisorFileProgress[] });
  const [turns, setTurns] = useState<AdvisorTurn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const nextId = useRef(1);
  /** 판정 요청을 기다리는 쪽. 답 id 로 찾는다. */
  const judgeWaiters = useRef(new Map<number, { resolve: (features: Float32Array[]) => void; reject: (error: Error) => void }>());
  /** 받아 둔 판정 헤드. 이름으로 찾는다. */
  const judgeHeads = useRef(new Map<string, Promise<JudgeHead>>());
  // 모델은 화면에서 바꿀 수 있으므로 상태다. 바꾸면 워커를 내렸다 새로 올린다.
  const [model, setModel] = useState(resolveModel);

  useEffect(() => {
    void detectWebGpu().then(setWebgpu);
    void estimateStorageMb().then(setStorage);
  }, []);

  /*
    어댑터를 확인하고 나서 기본 모델을 정한다.

    16비트 셰이더가 없는 기기에 q4f16 을 주면 내려받기부터 막힌다. 그런 기기에는
    가벼운 쪽을 대신 준다. **사용자가 이미 고른 것이 있으면 건드리지 않는다** —
    직접 고른 것을 기기 사정으로 되돌리면 그것도 고장이다.
  */
  useEffect(() => {
    if (webgpu === null) return;
    if (currentModelChoice() !== "default") return;
    setModel((prev) => {
      const next = autoModel(webgpu);
      return next.id === prev.id && next.dtype === prev.dtype ? prev : next;
    });
  }, [webgpu]);

  /** 워커는 동의 후에만 만든다 */
  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../workers/advisor.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<AdvisorResponse>) => {
      const message = event.data;
      switch (message.type) {
        case "progress":
          setStatus((prev) => (prev === "generating" ? prev : "downloading"));
          setProgress({
            loadedBytes: message.loadedBytes,
            totalBytes: message.totalBytes,
            files: message.files,
          });
          // 내려받기가 끝나면 GPU 적재 구간으로 넘어간다
          if (message.totalBytes > 0 && message.loadedBytes >= message.totalBytes) {
            setStatus((prev) => (prev === "generating" ? prev : "warming"));
          }
          break;
        case "loaded":
          setModelReady(true);
          // 적재를 기다리는 동안 이미 질문을 받았을 수 있다. 그때는 생성 상태를 유지한다.
          setStatus((prev) => (prev === "generating" ? prev : "ready"));
          break;
        case "chunk":
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && last.id === message.id) {
              next[next.length - 1] = { ...last, content: last.content + message.text };
            }
            return next;
          });
          break;
        case "done": {
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && last.id === message.id) {
              next[next.length - 1] = {
                ...last,
                content: message.text || last.content,
                stats: {
                  tokens: message.tokens,
                  seconds: message.seconds,
                  ttft: message.ttftSeconds,
                  promptTokens: message.promptTokens,
                },
              };
            }
            return next;
          });
          setStatus("ready");
          break;
        }
        case "judged": {
          const waiter = judgeWaiters.current.get(message.id);
          judgeWaiters.current.delete(message.id);
          waiter?.resolve(message.features);
          break;
        }
        case "error": {
          // 판정 요청이 실패했으면 부르는 쪽에 알린다. 화면 오류로는 띄우지 않는다 — 규칙으로 되돌아간다.
          const waiter = message.id !== undefined ? judgeWaiters.current.get(message.id) : undefined;
          if (waiter) {
            judgeWaiters.current.delete(message.id!);
            waiter.reject(new Error(message.message));
            break;
          }
          setError(message.message);
          setStatus("error");
          break;
        }
        default:
          break;
      }
    });
    workerRef.current = worker;
    return worker;
  }, []);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const post = useCallback((request: AdvisorRequest) => {
    ensureWorker().postMessage(request);
  }, [ensureWorker]);

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
  }, [post, model]);

  /**
   * 동의는 이미 받았고 아직 적재하지 않았으면 지금 시작한다.
   * 위젯이 늘 떠 있으므로 화면을 켜자마자 받게 하지 않고, 대화창을 연 시점에 시작한다.
   */
  const ensureLoaded = useCallback(() => {
    if (!consented || modelReady || workerRef.current) return;
    setStatus("downloading");
    post({ type: "load", model });
  }, [consented, modelReady, post, model]);

  /**
   * 동의 없이 모델을 부르려 했는지 본다.
   *
   * `send` 계열은 워커를 만들고, 워커를 만드는 순간 3GB 를 받기 시작한다.
   * "모델 없이 써보기" 를 고른 사용자가 코드가 못 답하는 질문을 던지면 실제로 그 일이
   * 벌어졌다. 내려받기를 거절했는데 받아 버리는 셈이라 여기서 막는다.
   */
  const refuseWithoutConsent = useCallback((question: string, notice: string): boolean => {
    if (consented) return false;
    setError(null);
    setTurns((prev) => [
      ...prev,
      { id: nextId.current++, role: "user", content: question },
      { id: nextId.current++, role: "assistant", content: notice },
    ]);
    return true;
  }, [consented]);

  const send = useCallback((text: string, system?: string, tools?: unknown[], notice?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (notice !== undefined && refuseWithoutConsent(trimmed, notice)) return;
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setError(null);
    setStatus("generating");
    setTurns((prev) => {
      const next: AdvisorTurn[] = [
        ...prev,
        { id: userId, role: "user", content: trimmed },
        { id: replyId, role: "assistant", content: "" },
      ];
      // 워커에는 사용자 발화까지만 넘긴다
      post({
        type: "generate",
        id: replyId,
        model,
        system,
        ...(tools && tools.length ? { tools } : {}),
        messages: next
          .filter((t) => t.id !== replyId)
          .map(({ role, content }) => ({ role, content })),
      });
      return next;
    });
  }, [post, model, refuseWithoutConsent]);

  /**
   * 구간을 하나씩 돌린다.
   *
   * 한 번에 다 보내면 워커가 먼저 온 것부터 처리하다 순서가 뒤엉킨다.
   * 앞 구간이 끝난 뒤에 다음을 보내야 답변이 형식대로 쌓인다.
   */
  /**
   * 도구를 주고 여러 번 오간다.
   *
   * 모델이 `<|tool_call>call:이름{…}` 을 뱉으면 그 자리에서 실행해 결과를 되먹이고
   * 다시 부른다. 도구를 더 부르지 않으면 그 답을 그대로 쓴다.
   *
   * 오갈 때마다 프롬프트를 처음부터 다시 읽으므로 느리다. 호출 수를 3회로 묶어 둔다.
   */
  const sendWithTools = useCallback(
    (
      question: string,
      system: string,
      tools: unknown[],
      execute: (calls: Array<{ name: string; args: Record<string, string> }>) => string,
      parse: (text: string) => Array<{ name: string; args: Record<string, string> }>,
      /** 모델이 도구를 한 번도 부르지 않았을 때 대신 쓸 자료. */
      fallbackSystem?: string,
      /** 회차 사이에 보여 줄 말. 무엇을 조회하는지 알린다. */
      lookingLabel?: string,
    ) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      const userId = nextId.current++;
      const replyId = nextId.current++;
      setError(null);
      setStatus("generating");
      setTurns((prev) => [
        ...prev,
        { id: userId, role: "user", content: trimmed },
        { id: replyId, role: "assistant", content: "" },
      ]);

      const worker = ensureWorker();
      const history: AdvisorChatMessage[] = [{ role: "user", content: trimmed }];
      let rounds = 0;

      const ask = () => {
        worker.postMessage({
          type: "generate",
          id: replyId,
          model,
          system,
          tools,
          messages: history,
        } satisfies AdvisorRequest);
      };

      function onDone(event: MessageEvent<AdvisorResponse>) {
        const message = event.data;
        if (message.type === "error") {
          worker.removeEventListener("message", onDone);
          return;
        }
        if (message.type !== "done" || message.id !== replyId) return;

        const calls = parse(message.text);
        // 브라우저 모델은 도구를 부르지 않고 그냥 답할 때가 있다. 그러면 자료가 없어
        // "비교할 수 없습니다" 가 나간다. 한 번도 안 불렀으면 자료를 붙여 다시 묻는다.
        if (calls.length === 0 && rounds === 0 && fallbackSystem) {
          rounds += 1;
          setTurns((prev) =>
            prev.map((t) => (t.id === replyId ? { ...t, content: "", activity: lookingLabel } : t)),
          );
          worker.postMessage({
            type: "generate",
            id: replyId,
            model,
            system: fallbackSystem,
            messages: [{ role: "user", content: trimmed }],
          } satisfies AdvisorRequest);
          return;
        }
        if (calls.length === 0 || rounds >= 3) {
          // 도구 표식은 사용자에게 보일 글이 아니므로 지운다.
          const clean = message.text.replace(/<\|tool_call>[^\n]*/g, "").trim();
          setTurns((prev) =>
            prev.map((t) => (t.id === replyId ? { ...t, content: clean, activity: undefined } : t)),
          );
          setStatus("ready");
          worker.removeEventListener("message", onDone);
          return;
        }

        rounds += 1;
        history.push({ role: "assistant", content: message.text });
        history.push({ role: "user", content: `[조회 결과]\n${execute(calls)}` });
        // 다음 회차 출력이 앞 회차에 이어 붙지 않도록 비운다. 그냥 비우면 글이 나왔다가
        // 사라지는 것처럼 보이므로, 무엇을 조회했는지 그 자리에 대신 보여 준다.
        const looked = calls.map((call) => Object.values(call.args).join(" ")).join(", ");
        setTurns((prev) =>
          prev.map((t) =>
            t.id === replyId
              ? { ...t, content: "", activity: lookingLabel ? `${lookingLabel}: ${looked}` : undefined }
              : t,
          ),
        );
        ask();
      }

      worker.addEventListener("message", onDone);
      ask();
    },
    [ensureWorker, model],
  );

  /**
   * 검색어를 만들게 한 뒤 코드가 찾아서 답한다.
   *
   * 검색 도구를 쥐여 주고 알아서 하라고 두면 안 됐다. 재 보니 여덟 문항 중 셋은
   * 도구를 부르지도 않았고(`search:…` 를 그냥 글자로 뱉었다), 네 턴을 줘도
   * 다시 찾은 적이 한 번도 없었다. 되먹임을 못 쓴다.
   *
   * 그래서 고르게 두지 않고 **시킨다.** 검색어를 내놓게 하고, 찾는 일은 코드가 한다.
   * 아무것도 못 찾았을 때만 "다른 말로" 를 코드가 밀어 넣는다. 찾긴 찾았는데 엉뚱한
   * 경우는 가려내지 않는다 — 점수로 맞고 틀림이 안 갈렸기 때문이다. 대신 상위 세 건을
   * 다 실어서 어느 것이 답인지는 모델이 고르게 한다.
   *
   * 검색어를 만드는 회차는 화면에 보이지 않는다. 48토큰짜리 짧은 생성이고
   * 사용자가 볼 글이 아니다. 그래서 보이는 답과 다른 id 로 돌린다.
   */
  const sendWithSearch = useCallback(
    (question: string, system: string, options: SearchRoundOptions) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      const userId = nextId.current++;
      const replyId = nextId.current++;
      setError(null);
      setStatus("generating");
      setTurns((prev) => [
        ...prev,
        { id: userId, role: "user", content: trimmed },
        { id: replyId, role: "assistant", content: "", activity: options.labels.searching },
      ]);

      const worker = ensureWorker();
      // 검색어 회차는 보이는 답과 다른 id 로 돈다. 같은 id 면 화면에 검색어가 찍힌다.
      const queryId = nextId.current++;
      const tried: string[] = [];
      let found: { context: string; titles: string[] } | undefined;
      let round = 0;

      /** 말풍선에 붙은 진행 상태를 바꾼다. */
      const setActivity = (activity: string | undefined, sources?: string[]) => {
        setTurns((prev) =>
          prev.map((turn) => (turn.id === replyId ? { ...turn, activity, sources } : turn)),
        );
      };

      /** 찾은 자료를 싣고(또는 못 찾은 채로) 진짜 답을 만들게 한다. */
      const answer = () => {
        // 근거는 답이 나오기 전에 붙여 둔다. 무엇을 보고 쓰는 중인지 먼저 보여야 한다.
        setActivity(undefined, found?.titles);
        worker.postMessage({
          type: "generate",
          id: replyId,
          model,
          system: found ? `${system}\n\n${found.context}` : options.fallbackSystem,
          messages: [{ role: "user", content: trimmed }],
        } satisfies AdvisorRequest);
      };

      /** 검색어를 내놓게 한다. 이 회차의 출력은 화면에 얹지 않는다. */
      const askForQuery = () => {
        worker.postMessage({
          type: "generate",
          id: queryId,
          model,
          system: options.querySystem,
          messages: [{ role: "user", content: options.buildPrompt(tried) }],
          maxTokens: 48,
        } satisfies AdvisorRequest);
      };

      function onDone(event: MessageEvent<AdvisorResponse>) {
        const message = event.data;
        if (message.type === "error") {
          worker.removeEventListener("message", onDone);
          return;
        }
        if (message.type !== "done") return;

        // 보이는 답이 끝났으면 이 흐름도 끝이다.
        if (message.id === replyId) {
          worker.removeEventListener("message", onDone);
          return;
        }
        if (message.id !== queryId) return;

        // 검색어 회차가 끝났다. 화면은 건드리지 않았으므로 상태만 되돌린다.
        setStatus("generating");

        const query = options.extract(message.text);
        if (!query || tried.includes(query)) {
          answer();
          return;
        }
        tried.push(query);
        found = options.search(query);

        round += 1;
        if (found || round >= options.maxRounds) {
          if (found) setActivity(`${options.labels.searched}: ${found.titles.join(", ")}`);
          answer();
          return;
        }
        // 못 찾았으니 다시 만든다. 몇 번째인지 보이게 한다.
        setActivity(`${options.labels.searching} (${round + 1})`);
        askForQuery();
      }

      worker.addEventListener("message", onDone);
      askForQuery();
    },
    [ensureWorker, model],
  );

  /**
   * 값 하나만 받아 온다. 화면에는 아무것도 남기지 않는다.
   *
   * 질문이 무엇을 묻는지 가르는 일을 모델에게 맡기려고 둔 길이다. 지금까지는 한국어
   * 낱말 목록이 그 일을 했는데, 세 언어로 재 보니 한국어 5/6, 영어 1/6, 중국어 1/6
   * 이었다. 같은 문항에서 4B 는 6/6, 4/6, 6/6 이다. 낱말을 늘리는 것으로는 언어가
   * 늘 때마다 같은 일을 다시 해야 한다.
   *
   * 답을 스트리밍하지 않고 끝난 글만 돌려준다. 짧은 생성이고 사용자가 볼 글이 아니라
   * `turns` 를 건드리지 않는다. 실패하면 거절하고, 부르는 쪽이 규칙으로 되돌아간다.
   */
  const classify = useCallback(
    (system: string, question: string, maxTokens = 16): Promise<string> => {
      const worker = ensureWorker();
      const id = nextId.current++;
      return new Promise<string>((resolve, reject) => {
        const onMessage = (event: MessageEvent<AdvisorResponse>) => {
          const message = event.data;
          if (!("id" in message) || message.id !== id) return;
          if (message.type === "done") {
            worker.removeEventListener("message", onMessage);
            resolve(message.text.trim());
          } else if (message.type === "error") {
            worker.removeEventListener("message", onMessage);
            reject(new Error(message.message));
          }
        };
        worker.addEventListener("message", onMessage);
        post({
          type: "generate",
          id,
          model,
          messages: [{ role: "user", content: question }],
          system,
          maxTokens,
        });
      });
    },
    [ensureWorker, post, model],
  );

  /**
   * 모델을 부르지 않고 답을 얹는다.
   *
   * 코드 전용 답변은 평가에서 적중 63/66 으로 모델(64/66)과 거의 같았다.
   * 3GB 를 받지 않은 사용자에게도 이 답은 줄 수 있어야 한다.
   *
   * 카드만 얹으면 대화에는 칩 하나만 남아 답을 못 받은 화면이 된다. 그래서
   * `answerProse` 로 **카드 안의 값을 문장으로도** 적는다. 모델이 쓰는 글이 아니라
   * 카드에 이미 있는 값을 옮기는 것이라 틀릴 자리가 없다.
   */
  const answerWithoutModel = useCallback(
    (question: string, answer: string | AdvisorAnswer, notice?: string) => {
      setError(null);
      const reply: AdvisorTurn =
        typeof answer === "string"
          ? { id: nextId.current++, role: "assistant", content: answer, notice }
          : { id: nextId.current++, role: "assistant", content: answerProse(answer, lang), answer, notice, byCode: true };
      setTurns((prev) => [...prev, { id: nextId.current++, role: "user", content: question }, reply]);
    },
    [lang],
  );

  /**
   * 카드는 0초에, 해설은 그 위에서 자라난다.
   *
   * 자료를 통째로 모델에게 넘겨 받아 적게 하면 잘리고 빠뜨린다(럼블 2,654자).
   * 대신 코드가 만든 카드를 먼저 얹고, 모델에게는 "왜 중요한가" 두세 문장만 시킨다.
   * 수치는 카드에 있으니 모델이 숫자를 입에 담을 일이 없다.
   */
  const sendWithAnswer = useCallback(
    (question: string, system: string, answer: AdvisorAnswer, notice?: string, maxTokens?: number) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      const userId = nextId.current++;
      const replyId = nextId.current++;
      setError(null);
      setStatus("generating");
      setTurns((prev) => [
        ...prev,
        { id: userId, role: "user", content: trimmed },
        { id: replyId, role: "assistant", content: "", answer, notice },
      ]);
      post({
        type: "generate",
        id: replyId,
        model,
        system,
        messages: [{ role: "user", content: trimmed }],
        maxTokens,
      });
    },
    [post, model],
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
      if (head.model.id !== model.id || head.model.dtype !== model.dtype) {
        throw new Error(`판정 헤드 ${headName} 는 ${head.model.id} 용입니다`);
      }
      const id = nextId.current++;
      const features = await new Promise<Float32Array[]>((resolve, reject) => {
        judgeWaiters.current.set(id, { resolve, reject });
        post({ type: "judge", id, model, state, questions, subset: head.subset });
      });
      return features.map((flat, index) => {
        const positions = questions[index].options.length + 1;
        const rows = Array.from({ length: positions }, (_, k) => flat.subarray(k * head.dim, (k + 1) * head.dim));
        return scoreJudge(head, rows);
      });
    },
    [consented, model, post, loadJudgeHead],
  );

  /*
   * 가벼운 모델을 다 올렸으면 판정 헤드를 미리 받아 둔다.
   *
   * 처음 판정할 때 받으면, 모델만 받아 두고 오프라인이 된 사용자는 판정기를 한 번도
   * 못 쓴다. 모델 적재가 끝난 때가 네트워크가 확실히 있던 마지막 순간이다.
   */
  useEffect(() => {
    if (!modelReady || !model.lite) return;
    for (const name of LITE_JUDGE_HEADS) void loadJudgeHead(name).catch(() => undefined);
  }, [modelReady, model, loadJudgeHead]);

  const rate = useCallback((turnId: number, rating: "up" | "down", patch: string) => {
    setTurns((prev) => {
      const index = prev.findIndex((t) => t.id === turnId);
      if (index < 0) return prev;
      const next = [...prev];
      // 같은 버튼을 다시 누르면 평가를 물린다
      const current = next[index].rating;
      next[index] = { ...next[index], rating: current === rating ? undefined : rating };

      if (next[index].rating) {
        // 바로 앞 사용자 발화가 이 답의 질문이다
        const question = [...prev.slice(0, index)].reverse().find((t) => t.role === "user");
        try {
          const log = readFeedback();
          log.push({
            at: new Date().toISOString(),
            question: question?.content ?? "",
            answer: next[index].content,
            rating,
            patch,
          });
          localStorage.setItem(
            FEEDBACK_KEY,
            JSON.stringify(log.slice(-FEEDBACK_LIMIT)),
          );
        } catch {
          // 저장에 실패해도 화면 표시는 유지한다
        }
      }
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    workerRef.current?.postMessage({ type: "stop" } satisfies AdvisorRequest);
    setStatus("ready");
  }, []);

  const reset = useCallback(() => {
    setTurns([]);
    setError(null);
  }, []);

  const replaceTurns = useCallback((next: AdvisorTurn[]) => {
    const maxId = next.reduce((max, turn) => Math.max(max, turn.id), 0);
    if (maxId >= nextId.current) nextId.current = maxId + 1;
    setTurns(next);
    setError(null);
  }, []);

  /**
   * 올려 둔 모델을 내린다.
   *
   * 워커를 먼저 내린다. 살아 있으면 모델을 메모리에 든 채로 계속 답해서, 지웠는데도
   * 지워지지 않은 것처럼 보인다. 그다음 캐시를 지우고 동의를 거둔다 — 다음에 받을
   * 것은 용량이 다를 수 있으므로 다시 물어야 한다.
   */
  const teardown = useCallback(async () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setModelReady(false);
    setStatus("idle");
    setProgress({ loadedBytes: 0, totalBytes: 0, files: [] });
    setError(null);
    await deleteModelCache();
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // 못 지워도 캐시는 비었으므로 다시 받게 된다
    }
    setConsented(false);
    void estimateStorageMb().then(setStorage);
  }, []);

  /** 내려받은 모델을 삭제한다. 보고 있던 대화도 치운다 — 지우겠다는 뜻이 그것이다. */
  const deleteModel = useCallback(async () => {
    setTurns([]);
    await teardown();
  }, [teardown]);

  /**
   * 쓸 모델을 바꾼다.
   *
   * 화면을 다시 띄우지 않는다. 예전에는 `location.reload()` 로 했는데 패널이 닫히고
   * 보던 대화가 사라져, 모델 하나 바꾸려다 하던 일을 잃었다. 워커만 내렸다 올리면
   * 되는 일이다. **대화는 그대로 둔다.**
   *
   * 주소에 남은 `?advisorModel=` 도 지운다. 그쪽이 저장값보다 앞서기 때문에, 남겨
   * 두면 고른 것이 다음 새로고침에 뒤집힌다.
   */
  const chooseModel = useCallback(
    async (key: string) => {
      writeModelChoice(key);
      try {
        const url = new URL(location.href);
        if (url.searchParams.has("advisorModel")) {
          url.searchParams.delete("advisorModel");
          history.replaceState(null, "", url.toString());
        }
      } catch {
        // 주소를 못 고쳐도 저장값은 바뀌었다
      }
      setModel(resolveModel());
      await teardown();
    },
    [teardown],
  );

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
    send,
    judge,
    answerWithoutModel,
    classify,
    sendWithAnswer,
    sendWithTools,
    sendWithSearch,
    rate,
    deleteModel,
    model,
    chooseModel,
    modelChoice: modelChoiceKey(model),
    stop,
    reset,
    replaceTurns,
  };
}
