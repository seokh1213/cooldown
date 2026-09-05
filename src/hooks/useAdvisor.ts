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
  resolveModel,
  type WebGpuSupport,
} from "@/lib/advisor/config";
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
  stats?: { tokens: number; seconds: number };
  /** 사용자가 남긴 평가 */
  rating?: "up" | "down";
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
  send: (text: string, system?: string) => void;
  /**
   * 상성 조언. 확정 구간은 코드가 만든 문장을 그대로 쓰고 서술 구간만 모델을 부른다.
   * 구간마다 프롬프트가 달라 순서대로 이어 붙인다.
   */
  sendMatchup: (question: string, decided: string, sections: AdvisorChatMessage[][]) => void;
  /** 모델 없이 코드가 만든 답을 그대로 보여 준다. 동의 전이나 WebGPU 가 없을 때 쓴다. */
  answerWithoutModel: (question: string, answer: string) => void;
  /** 답변 평가. 기기 안에만 쌓인다. */
  rate: (turnId: number, rating: "up" | "down", patch: string) => void;
  stop: () => void;
  reset: () => void;
}

function readConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

export function useAdvisor(): UseAdvisorResult {
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
  const model = useRef(resolveModel()).current;

  useEffect(() => {
    void detectWebGpu().then(setWebgpu);
    void estimateStorageMb().then(setStorage);
  }, []);

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
        case "done":
          setTurns((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant" && last.id === message.id) {
              next[next.length - 1] = {
                ...last,
                content: message.text || last.content,
                stats: { tokens: message.tokens, seconds: message.seconds },
              };
            }
            return next;
          });
          setStatus("ready");
          break;
        case "error":
          setError(message.message);
          setStatus("error");
          break;
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

  const send = useCallback((text: string, system?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
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
        messages: next
          .filter((t) => t.id !== replyId)
          .map(({ role, content }) => ({ role, content })),
      });
      return next;
    });
  }, [post, model]);

  /**
   * 구간을 하나씩 돌린다.
   *
   * 한 번에 다 보내면 워커가 먼저 온 것부터 처리하다 순서가 뒤엉킨다.
   * 앞 구간이 끝난 뒤에 다음을 보내야 답변이 형식대로 쌓인다.
   */
  const sendMatchup = useCallback(
    (question: string, decided: string, sections: AdvisorChatMessage[][]) => {
      const userId = nextId.current++;
      const replyId = nextId.current++;
      setError(null);
      setStatus("generating");
      setTurns((prev) => [
        ...prev,
        { id: userId, role: "user", content: question },
        // 확정 구간은 모델을 기다리지 않고 바로 보여 준다
        { id: replyId, role: "assistant", content: decided ? `${decided}\n\n` : "" },
      ]);

      const worker = ensureWorker();
      let index = 0;
      const runNext = () => {
        if (index >= sections.length) {
          setStatus("ready");
          worker.removeEventListener("message", onSectionDone);
          return;
        }
        const messages = sections[index++];
        worker.postMessage({
          type: "generate",
          id: replyId,
          model,
          messages,
        } satisfies AdvisorRequest);
      };
      function onSectionDone(event: MessageEvent<AdvisorResponse>) {
        const message = event.data;
        if (message.type === "done" && message.id === replyId) {
          setTurns((prev) =>
            prev.map((t) => (t.id === replyId ? { ...t, content: `${t.content}\n\n` } : t)),
          );
          runNext();
        } else if (message.type === "error") {
          worker.removeEventListener("message", onSectionDone);
        }
      }
      worker.addEventListener("message", onSectionDone);
      runNext();
    },
    [ensureWorker, model],
  );

  /**
   * 모델을 부르지 않고 답을 얹는다.
   *
   * 코드 전용 답변은 평가에서 적중 63/66 으로 모델(64/66)과 거의 같았다.
   * 3GB 를 받지 않은 사용자에게도 이 답은 줄 수 있어야 한다.
   */
  const answerWithoutModel = useCallback((question: string, answer: string) => {
    setError(null);
    setTurns((prev) => [
      ...prev,
      { id: nextId.current++, role: "user", content: question },
      { id: nextId.current++, role: "assistant", content: answer },
    ]);
  }, []);

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
    sendMatchup,
    answerWithoutModel,
    rate,
    stop,
    reset,
  };
}
