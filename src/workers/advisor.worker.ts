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
import { generate, stopGeneration } from "./advisor/generate";
import { forgetJudgePrefix, judge } from "./advisor/logitJudge";
import { forgetLoraSession } from "./advisor/lora";
import { embedText, forgetLoraFeatures, judgeHidden } from "./advisor/loraFeatures";
import { load, releaseModel } from "./advisor/model";
import { onRequest, post } from "./advisor/port";

// ONNX Runtime 런타임을 우리 출처에서 받는다.
// 기본값은 jsDelivr 인데, 제3자 CDN 이 막힌 환경에서 상성 코치가 통째로 죽는다.
// 파일은 `npm run prepare-ort` 가 node_modules 에서 public/ort/ 로 복사한다.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
}

onRequest((request) => {
  if (request.type === "load") {
    load(request.model).catch((error: unknown) => {
      post({ type: "error", message: (error as Error).message });
    });
    return;
  }
  if (request.type === "judge") {
    (request.feature === "hidden"
      ? judgeHidden(request.id, request.model, request.state, request.questions)
      : judge(request.id, request.model, request.state, request.questions, request.subset)
    ).catch((error: unknown) => {
      const message = (error as Error).message;
      // 생성과 같다 — GPU 가 한 번 깨지면 쥐고 있던 것을 놓아야 다음 요청이 모델을 다시 올린다
      if (/OrtRun|buffer|webgpu|device|GPU/i.test(message)) {
        forgetJudgePrefix();
        forgetLoraFeatures();
        forgetLoraSession();
        releaseModel();
      }
      post({ type: "error", id: request.id, message });
    });
    return;
  }
  if (request.type === "embed") {
    embedText(request.id, request.model, request.text).catch((error: unknown) => {
      post({ type: "error", id: request.id, message: (error as Error).message });
    });
    return;
  }
  if (request.type === "stop") {
    stopGeneration();
    return;
  }
  if (request.type === "generate") {
    generate(request.id, request.model, request.messages, request.system, request.maxTokens, request.loopGuard ?? true).catch((error: unknown) => {
      const message = (error as Error).message;
      /*
       * GPU 쪽이 한 번 깨지면 세션이 살아 있어도 못 쓴다.
       *
       * WebGPU 버퍼가 무효가 되면 그 뒤 모든 실행이 같은 오류로 떨어진다
       * ("is invalid due to a previous error"). 그런데 우리는 적재한 모델을 모듈에
       * 쥐고 있어서, 사용자가 다시 물어도 같은 세션으로 가 똑같이 실패했다. 새로고침
       * 말고는 길이 없었다.
       *
       * 그래서 GPU 오류에서는 쥐고 있던 것을 놓는다. 다음 질문이 모델을 다시 올린다.
       * 파일은 브라우저 캐시에 있으므로 내려받기를 다시 하지는 않는다.
       */
      if (/OrtRun|buffer|webgpu|device|GPU/i.test(message)) {
        forgetJudgePrefix();
        releaseModel();
      }
      post({ type: "error", id: request.id, message });
    });
  }
});

post({ type: "ready" });
