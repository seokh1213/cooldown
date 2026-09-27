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
}

export function useAdvisorWorker({ onChunk, onDone, setError }: WorkerListeners) {
  const [status, setStatus] = useState<AdvisorStatus>("idle");
  const [progress, setProgress] = useState({ loadedBytes: 0, totalBytes: 0, files: [] as AdvisorFileProgress[] });
  const [modelReady, setModelReady] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  /** 판정 요청을 기다리는 쪽. 답 id 로 찾는다. */
  const judgeWaiters = useRef(new Map<number, { resolve: (features: Float32Array[]) => void; reject: (error: Error) => void }>());
  const embedWaiters = useRef(new Map<number, { resolve: (vector: Float32Array) => void; reject: (error: Error) => void }>());

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
          onChunk(message.id, message.text);
          break;
        case "done": {
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
          // 판정 요청이 실패했으면 부르는 쪽에 알린다. 화면 오류로는 띄우지 않는다 — 규칙으로 되돌아간다.
          const waiter = message.id !== undefined ? judgeWaiters.current.get(message.id) ?? embedWaiters.current.get(message.id) : undefined;
          if (waiter) {
            judgeWaiters.current.delete(message.id!);
            embedWaiters.current.delete(message.id!);
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
  }, [onChunk, onDone, setError]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const post = useCallback((request: AdvisorRequest) => {
    ensureWorker().postMessage(request);
  }, [ensureWorker]);

  const requestJudge = useCallback(
    (request: Extract<AdvisorRequest, { type: "judge" }>) =>
      new Promise<Float32Array[]>((resolve, reject) => {
        judgeWaiters.current.set(request.id, { resolve, reject });
        post(request);
      }),
    [post],
  );

  const requestEmbed = useCallback(
    (request: Extract<AdvisorRequest, { type: "embed" }>) =>
      new Promise<Float32Array>((resolve, reject) => {
        embedWaiters.current.set(request.id, { resolve, reject });
        post(request);
      }),
    [post],
  );

  const interrupt = useCallback(() => {
    workerRef.current?.postMessage({ type: "stop" } satisfies AdvisorRequest);
  }, []);

  const hasWorker = useCallback(() => workerRef.current !== null, []);

  const shutdown = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setModelReady(false);
    setStatus("idle");
    setProgress({ loadedBytes: 0, totalBytes: 0, files: [] });
    setError(null);
  }, [setError]);

  return { status, setStatus, progress, modelReady, post, requestJudge, requestEmbed, interrupt, hasWorker, shutdown };
}
