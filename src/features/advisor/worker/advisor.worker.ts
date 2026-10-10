/// <reference lib="webworker" />
/**
 * 상성 코치 워커
 *
 * Transformers.js 로 Qwen3.5 0.8B(kev LoRA 판정·검색 가지를 덧붙인 그래프)를 WebGPU 에서 돌린다.
 * 모델 적재는 한 번만 하고 이후 생성 요청을 받아 토큰을 흘려보낸다.
 *
 * 브라우저 캐시에 파일이 남으므로 두 번째 방문부터는 내려받기가 없다.
 * 진행률은 파일 단위로 모아 보낸다. 파일이 여러 개라 개별로 보내면 화면이 튄다.
 */
import { env } from "@huggingface/transformers";
import { generate, stopGeneration } from "./generate";
import { forgetJudgePrefix, judge } from "./logitJudge";
import { forgetLoraSession } from "./lora";
import { embedText, forgetLoraFeatures, judgeHidden } from "./loraFeatures";
import { load, releaseModel } from "./model";
import { onRequest, post } from "./port";

// ONNX Runtime 런타임을 우리 출처에서 받는다.
// 기본값은 jsDelivr 인데, 제3자 CDN 이 막힌 환경에서 상성 코치가 통째로 죽는다.
// 파일은 `npm run prepare-ort` 가 node_modules 에서 public/ort/ 로 복사한다.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
}

/*
 * 판정·검색 요청은 한 번에 하나씩 돈다. `judgeHidden` 은 상태 접두사의 KV 캐시(`hiddenPrefix`)를 하나만 들고 있어, 두 요청이
 * 겹치면 한쪽이 다른 쪽의 캐시를 지운 채 이어 쓰다 그래프가 멈췄다(2026-09-30 브라우저 시험: 판정 6회 연속 30초 시간 초과).
 */
let queue: Promise<unknown> = Promise.resolve();
let generationEpoch = 0;
const serialized = <T>(run: () => Promise<T>): Promise<T> => {
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
};

function reportFailure(error: unknown, id?: number) {
  const message = error instanceof Error ? error.message : String(error);
  // GPU 오류 뒤에는 모델과 같은 세션에서 만든 판정·검색 캐시도 다시 만든다.
  if (/OrtRun|buffer|webgpu|device|GPU/i.test(message)) {
    forgetJudgePrefix();
    forgetLoraFeatures();
    forgetLoraSession();
    releaseModel();
  }
  post({ type: "error", id, message });
}

onRequest((request) => {
  if (request.type === "load") {
    load(request.model).catch((error: unknown) => reportFailure(error));
    return;
  }
  if (request.type === "judge") {
    serialized(() =>
      request.feature === "hidden"
        ? judgeHidden(request.id, request.model, request.state, request.questions)
        : judge(request.id, request.model, request.state, request.questions, request.subset),
    ).catch((error: unknown) => reportFailure(error, request.id));
    return;
  }
  if (request.type === "embed") {
    serialized(() => embedText(request.id, request.model, request.text))
      .catch((error: unknown) => reportFailure(error, request.id));
    return;
  }
  if (request.type === "stop") {
    generationEpoch += 1;
    stopGeneration();
    return;
  }
  if (request.type === "generate") {
    const queuedEpoch = generationEpoch;
    serialized(async () => {
      if (queuedEpoch !== generationEpoch) {
        post({ type: "done", id: request.id, text: "", tokens: 0, seconds: 0 });
        return;
      }
      await generate(request);
    })
      .catch((error: unknown) => reportFailure(error, request.id));
  }
});

post({ type: "ready" });
