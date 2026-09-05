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
    stop,
    reset,
  };
}
