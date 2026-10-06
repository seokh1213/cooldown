import { useCallback, useEffect, useRef, useState } from "react";
import type { AdvisorFileProgress, AdvisorRequest, AdvisorResponse } from "@/lib/advisor/protocol";

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

interface WorkerListeners {
  onChunk: (id: number, text: string) => void;
  onDone: (message: Extract<AdvisorResponse, { type: "done" }>) => void;
  setError: (error: string | null) => void;
  failureMessage?: string;
}

export function useAdvisorWorker({ onChunk, onDone, setError, failureMessage = "Advisor worker failed" }: WorkerListeners) {
  const [status, setStatus] = useState<AdvisorStatus>("idle");
  const [progress, setProgress] = useState({ loadedBytes: 0, totalBytes: 0, files: [] as AdvisorFileProgress[] });
  const [modelReady, setModelReady] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  /** 판정 요청을 기다리는 쪽. 답 id 로 찾는다. */
  const judgeWaiters = useRef(new Map<number, { resolve: (features: Float32Array[]) => void; reject: (error: Error) => void }>());
  const embedWaiters = useRef(new Map<number, { resolve: (vector: Float32Array) => void; reject: (error: Error) => void }>());
  const generateWaiters = useRef(new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>());
  const rejectGeneration = useCallback((error: Error) => {
    for (const waiter of generateWaiters.current.values()) waiter.reject(error);
    generateWaiters.current.clear();
  }, []);

  const closeWorker = useCallback((error: Error) => {
    rejectGeneration(error);
    const worker = workerRef.current;
    workerRef.current = null;
    worker?.terminate();
    for (const waiters of [judgeWaiters.current, embedWaiters.current]) {
      for (const waiter of waiters.values()) waiter.reject(error);
      waiters.clear();
    }
  }, [rejectGeneration]);

  const failWorker = useCallback((error: Error) => {
    closeWorker(error);
    setModelReady(false);
    setProgress({ loadedBytes: 0, totalBytes: 0, files: [] });
    setError(error.message);
    setStatus("error");
  }, [closeWorker, setError]);

  /** 워커는 동의 후에만 만든다 */
  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current;
    const worker = new Worker(new URL("../workers/advisor.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.addEventListener("message", (event: MessageEvent<AdvisorResponse>) => {
      if (workerRef.current !== worker) return;
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
          if (message.id < 0) break;
          onChunk(message.id, message.text);
          break;
        case "done": {
          if (message.id < 0) {
            const waiter = generateWaiters.current.get(message.id);
            generateWaiters.current.delete(message.id);
            waiter?.resolve(message.text);
            break;
          }
          onDone(message);
          setStatus("ready");
          break;
        }
        case "judged": {
          const waiter = judgeWaiters.current.get(message.id);
          judgeWaiters.current.delete(message.id);
          waiter?.resolve(message.features);
          break;
        }
        case "embedded": {
          const waiter = embedWaiters.current.get(message.id);
          embedWaiters.current.delete(message.id);
          waiter?.resolve(message.vector);
          break;
        }
        case "error": {
          if (message.id === undefined) {
            failWorker(new Error(message.message));
            break;
          }
          // 판정 요청이 실패했으면 부르는 쪽에 알린다. 화면 오류로는 띄우지 않는다 — 규칙으로 되돌아간다.
          const waiter = message.id !== undefined ? judgeWaiters.current.get(message.id) ?? embedWaiters.current.get(message.id) ?? generateWaiters.current.get(message.id) : undefined;
          if (waiter) {
            judgeWaiters.current.delete(message.id!);
            embedWaiters.current.delete(message.id!);
            generateWaiters.current.delete(message.id!);
            waiter.reject(new Error(message.message));
            break;
          }
          if (message.id !== undefined && message.id < 0) break;
          setError(message.message);
          setStatus("error");
          break;
        }
        default:
          break;
      }
    });
    worker.addEventListener("error", (event) => {
      event.preventDefault();
      if (workerRef.current === worker) failWorker(new Error(failureMessage));
    });
    worker.addEventListener("messageerror", () => {
      if (workerRef.current === worker) failWorker(new Error(failureMessage));
    });
    workerRef.current = worker;
    return worker;
  }, [onChunk, onDone, setError, failWorker, failureMessage]);

  useEffect(() => () => {
    closeWorker(new Error("Advisor worker stopped"));
  }, [closeWorker]);

  const post = useCallback((request: AdvisorRequest) => {
    try {
      ensureWorker().postMessage(request);
    } catch {
      failWorker(new Error(failureMessage));
    }
  }, [ensureWorker, failWorker, failureMessage]);

  /*
   * 워커가 답을 안 주면(그래프·WebGPU 오류가 삼켜진 경우) 판정·검색 약속이 영영 안 풀려 도우미가 "생각하는 중" 에 멈춘다.
   * 일정 시간이 지나면 거절해 낱말 규칙 길로 보낸다. 판정 1회는 1~5초라 넉넉히 잡는다.
   */
  const REQUEST_TIMEOUT_MS = 30_000;
  const requestJudge = useCallback(
    (request: Extract<AdvisorRequest, { type: "judge" }>) =>
      new Promise<Float32Array[]>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          judgeWaiters.current.delete(request.id);
          reject(new Error("judge timeout"));
        }, REQUEST_TIMEOUT_MS);
        judgeWaiters.current.set(request.id, {
          resolve: (value) => { window.clearTimeout(timer); resolve(value); },
          reject: (error) => { window.clearTimeout(timer); reject(error); },
        });
        post(request);
      }),
    [post],
  );

  const requestEmbed = useCallback(
    (request: Extract<AdvisorRequest, { type: "embed" }>) =>
      new Promise<Float32Array>((resolve, reject) => {
        const timer = window.setTimeout(() => {
          embedWaiters.current.delete(request.id);
          reject(new Error("embed timeout"));
        }, REQUEST_TIMEOUT_MS);
        embedWaiters.current.set(request.id, {
          resolve: (value) => { window.clearTimeout(timer); resolve(value); },
          reject: (error) => { window.clearTimeout(timer); reject(error); },
        });
        post(request);
      }),
    [post],
  );

  /** 내부 판정 id는 음수여서 늦게 온 응답도 채팅에 섞이지 않는다. */
  const requestGenerate = useCallback(
    (request: Extract<AdvisorRequest, { type: "generate" }>) =>
      new Promise<string>((resolve, reject) => {
        if (request.id >= 0) { reject(new Error("internal generation requires a negative id")); return; }
        const timer = window.setTimeout(() => {
          generateWaiters.current.delete(request.id);
          reject(new Error("request generation timeout"));
        }, REQUEST_TIMEOUT_MS);
        generateWaiters.current.set(request.id, {
          resolve: value => { window.clearTimeout(timer); resolve(value); },
          reject: error => { window.clearTimeout(timer); reject(error); },
        });
        try { post(request); }
        catch (error) { generateWaiters.current.delete(request.id); window.clearTimeout(timer); reject(error); }
      }),
    [post],
  );

  const interrupt = useCallback(() => {
    rejectGeneration(new Error("request generation interrupted"));
    workerRef.current?.postMessage({ type: "stop" } satisfies AdvisorRequest);
  }, [rejectGeneration]);

  const hasWorker = useCallback(() => workerRef.current !== null, []);

  const shutdown = useCallback(() => {
    closeWorker(new Error("Advisor worker stopped"));
    setModelReady(false);
    setStatus("idle");
    setProgress({ loadedBytes: 0, totalBytes: 0, files: [] });
    setError(null);
  }, [closeWorker, setError]);

  return { status, setStatus, progress, modelReady, post, requestJudge, requestEmbed, requestGenerate, interrupt, hasWorker, shutdown };
}
