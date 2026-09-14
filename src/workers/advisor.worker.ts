/// <reference lib="webworker" />
/**
 * 상성 코치 워커
 *
 * Transformers.js 로 gemma-4-E2B 를 WebGPU 에서 돌린다.
 * 모델 적재는 한 번만 하고 이후 생성 요청을 받아 토큰을 흘려보낸다.
 *
 * 브라우저 캐시에 파일이 남으므로 두 번째 방문부터는 내려받기가 없다.
 * 진행률은 파일 단위로 모아 보낸다. 파일이 여러 개라 개별로 보내면 화면이 튄다.
 */
import {
  env,
  AutoModelForCausalLM,
  AutoTokenizer,
  InterruptableStoppingCriteria,
  TextStreamer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@huggingface/transformers";
import { MAX_NEW_TOKENS } from "@/lib/advisor/config";
import type {
  AdvisorFileProgress,
  AdvisorModelSpec,
  AdvisorRequest,
  AdvisorResponse,
} from "@/lib/advisor/protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// ONNX Runtime 런타임을 우리 출처에서 받는다.
// 기본값은 jsDelivr 인데, 제3자 CDN 이 막힌 환경에서 상성 코치가 통째로 죽는다.
// 파일은 `npm run prepare-ort` 가 node_modules 에서 public/ort/ 로 복사한다.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
}

function post(message: AdvisorResponse) {
  ctx.postMessage(message);
}

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let loading: Promise<void> | null = null;
/** 생성 중단 스위치. 라이브러리가 매 토큰마다 확인한다. */
let stopper = new InterruptableStoppingCriteria();

const progressByFile = new Map<string, AdvisorFileProgress>();

function reportProgress() {
  const files = [...progressByFile.values()];
  const loadedBytes = files.reduce((sum, f) => sum + f.loaded, 0);
  const totalBytes = files.reduce((sum, f) => sum + f.total, 0);
  post({ type: "progress", files, loadedBytes, totalBytes });
}

interface HfProgress {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

function onProgress(event: HfProgress) {
  if (!event.file) return;
  if (event.status === "progress" || event.status === "download") {
    progressByFile.set(event.file, {
      file: event.file,
      loaded: event.loaded ?? 0,
      total: event.total ?? 0,
    });
    reportProgress();
  } else if (event.status === "done") {
    const current = progressByFile.get(event.file);
    if (current) {
      progressByFile.set(event.file, { ...current, loaded: current.total });
      reportProgress();
    }
  }
}

async function load(spec: AdvisorModelSpec): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    tokenizer = await AutoTokenizer.from_pretrained(spec.id, {
      progress_callback: onProgress,
    });
    // dtype 은 문자열 하나로 준다. 모듈마다 다른 값을 주면 세션 구성이 어긋난다.
    // Gemma 4 는 멀티모달이지만 *ForCausalLM 으로 부르면 라이브러리가 텍스트 전용 세션만 만든다.
    // 기본은 WebGPU. `?advisorDevice=wasm` 은 진단용이다.
    // 2.7GB 짜리는 wasm 힙에 안 들어가 std::bad_alloc 으로 죽는데, 그 자체가
    // "WebGPU 로 돌고 있다" 는 증거다. 몰래 CPU 로 떨어졌다면 평소에도 죽었을 것이다.
    model = await AutoModelForCausalLM.from_pretrained(spec.id, {
      dtype: spec.dtype as "q4f16",
      device: spec.device ?? "webgpu",
      progress_callback: onProgress,
    });
    post({ type: "loaded" });
  })();
  return loading;
}

async function generate(
  id: number,
  spec: AdvisorModelSpec,
  messages: Array<{ role: string; content: string }>,
  system?: string,
  tools?: unknown[],
  maxTokens?: number,
) {
  await load(spec);
  if (!tokenizer || !model) throw new Error("모델이 준비되지 않았습니다");

  stopper = new InterruptableStoppingCriteria();
  const chat = system ? [{ role: "system", content: system }, ...messages] : messages;
  // Gemma 4 는 사고 모드를 켤 수 있다. 켜 두면 답변 앞에 추론 과정을 길게 뱉어
  // 브라우저에서 체감 지연이 몇 배가 된다. 상성 조언은 형식이 정해져 있으므로 끈다.
  const inputs = tokenizer.apply_chat_template(chat, {
    add_generation_prompt: true,
    return_dict: true,
    enable_thinking: false,
    // 도구를 넘기면 템플릿이 선언을 앞에 붙이고, 모델은 `<|tool_call>call:이름{…}` 으로 답한다.
    ...(tools && tools.length ? { tools } : {}),
  } as Parameters<PreTrainedTokenizer["apply_chat_template"]>[1]) as Record<string, unknown>;

  let text = "";
  let tokens = 0;
  const startedAt = performance.now();

  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk: string) => {
      text += chunk;
      tokens += 1;
      post({ type: "chunk", id, text: chunk });
    },
  });

  await model.generate({
    ...inputs,
    max_new_tokens: maxTokens ?? MAX_NEW_TOKENS,
    do_sample: false,
    streamer,
    // 중단 요청이 오면 다음 토큰에서 멈춘다
    stopping_criteria: stopper,
  } as Parameters<PreTrainedModel["generate"]>[0]);

  post({
    type: "done",
    id,
    text,
    tokens,
    seconds: (performance.now() - startedAt) / 1000,
  });
}

ctx.addEventListener("message", (event: MessageEvent<AdvisorRequest>) => {
  const request = event.data;
  if (request.type === "load") {
    load(request.model).catch((error: unknown) => {
      post({ type: "error", message: (error as Error).message });
    });
    return;
  }
  if (request.type === "stop") {
    stopper.interrupt();
    return;
  }
  if (request.type === "generate") {
    generate(request.id, request.model, request.messages, request.system, request.tools, request.maxTokens).catch((error: unknown) => {
      post({ type: "error", id: request.id, message: (error as Error).message });
    });
  }
});

post({ type: "ready" });
