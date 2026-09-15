/// <reference lib="webworker" />
/**
 * 상성 코치 워커 — MLC WebLLM 판
 *
 * transformers.js 판(advisor.worker.ts)과 **같은 프로토콜**을 말한다. 그래서
 * useAdvisor 는 어느 쪽이 붙었는지 몰라도 된다. `?advisorRuntime=webllm` 으로 고른다.
 *
 * 왜 따로 두는가. transformers.js 쪽에서 속도를 올릴 길이 다 막혔다.
 * ORT 는 번들 안에 박혀 있어 못 올리고, WebGPU 가 있는 wasm 빌드는 asyncify 뿐이고,
 * graph capture 는 logits 가 CPU 에 있어 못 켠다. 남은 것이 런타임 교체다.
 *
 * WebLLM 은 모델마다 미리 컴파일한 WebGPU 커널(.wasm)을 쓴다. 범용 셰이더를 그때그때
 * 도는 ORT 와 달라 같은 가중치라도 빠를 수 있다. 대신 아무 ONNX 나 못 올리고
 * 프리빌트 목록에 있는 것만 쓴다.
 */
import { CreateWebWorkerMLCEngine, CreateMLCEngine, type MLCEngineInterface } from "@mlc-ai/web-llm";
import { MAX_NEW_TOKENS } from "@/lib/advisor/config";
import type { AdvisorModelSpec, AdvisorRequest, AdvisorResponse } from "@/lib/advisor/protocol";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(message: AdvisorResponse) {
  ctx.postMessage(message);
}

let engine: MLCEngineInterface | null = null;
let loading: Promise<void> | null = null;
/** 생성 중단 스위치. WebLLM 은 interruptGenerate() 로 멈춘다. */
let stopped = false;

/**
 * 진행률.
 *
 * WebLLM 은 파일 단위가 아니라 0~1 비율과 문구를 준다. 화면은 바이트를 기대하므로
 * 비율을 가짜 바이트로 바꿔 넘긴다. 진행 막대만 채우면 되고 숫자는 쓰이지 않는다.
 */
function reportProgress(fraction: number) {
  const total = 1_000_000;
  post({
    type: "progress",
    files: [{ file: "model", loaded: Math.round(fraction * total), total }],
    loadedBytes: Math.round(fraction * total),
    totalBytes: total,
  });
}

async function load(spec: AdvisorModelSpec): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    engine = await CreateMLCEngine(spec.id, {
      initProgressCallback: (report) => reportProgress(report.progress ?? 0),
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
  _tools?: unknown[],
  maxTokens?: number,
) {
  await load(spec);
  if (!engine) throw new Error("모델이 준비되지 않았습니다");

  stopped = false;
  const chat = system ? [{ role: "system", content: system }, ...messages] : messages;

  let text = "";
  let tokens = 0;
  const startedAt = performance.now();
  let firstTokenAt = 0;
  let promptTokens = 0;

  const stream = await engine.chat.completions.create({
    messages: chat as Parameters<typeof engine.chat.completions.create>[0]["messages"],
    stream: true,
    stream_options: { include_usage: true },
    temperature: 0,
    max_tokens: maxTokens ?? MAX_NEW_TOKENS,
    // Qwen3 는 사고 모드가 기본이다. 켜 두면 해설 앞에 영어로 추론을 길게 뱉는다.
    // 실제로 두세 문장짜리 답에 571토큰을 썼고 그중 대부분이 <think> 안이었다.
    // transformers.js 판은 채팅 템플릿의 enable_thinking 으로 끄는데, 여기서는
    // extra_body 로 끈다(응답 앞에 빈 <think></think> 를 미리 넣어 막는 방식이다).
    extra_body: { enable_thinking: false },
  });

  /**
   * 사고 모드를 끄면 WebLLM 이 답 앞에 빈 `<think></think>` 를 먼저 넣는다.
   * 그것이 모델을 막는 방식이라 필요하지만, 화면에 나가면 안 된다. 여는 태그가
   * 닫힐 때까지 모아 두었다가 그 뒤부터 흘려보낸다.
   */
  let thinkDone = false;
  let pending = "";

  for await (const chunk of stream) {
    if (stopped) break;
    // 마지막 청크에 usage 가 온다. 프롬프트 길이는 여기서만 알 수 있다.
    if (chunk.usage?.prompt_tokens) promptTokens = chunk.usage.prompt_tokens;
    const piece = chunk.choices[0]?.delta?.content ?? "";
    if (!piece) continue;
    if (firstTokenAt === 0) firstTokenAt = performance.now();
    tokens += 1;

    if (!thinkDone) {
      pending += piece;
      const end = pending.indexOf("</think>");
      if (end >= 0) {
        thinkDone = true;
        const rest = pending.slice(end + "</think>".length).replace(/^\s+/, "");
        pending = "";
        if (rest) {
          text += rest;
          post({ type: "chunk", id, text: rest });
        }
        continue;
      }
      // 사고 블록이 아니면 기다릴 이유가 없다. 여는 태그로 시작하지 않으면 바로 흘린다.
      if (!"<think>".startsWith(pending.trimStart().slice(0, 7))) {
        thinkDone = true;
        text += pending;
        post({ type: "chunk", id, text: pending });
        pending = "";
      }
      continue;
    }

    text += piece;
    post({ type: "chunk", id, text: piece });
  }
  // 사고 블록이 끝내 닫히지 않았으면 모아 둔 것을 그대로 내보낸다. 삼키지 않는다.
  if (!thinkDone && pending) {
    text += pending;
    post({ type: "chunk", id, text: pending });
  }

  post({
    type: "done",
    id,
    text,
    tokens,
    seconds: (performance.now() - startedAt) / 1000,
    ttftSeconds: firstTokenAt ? (firstTokenAt - startedAt) / 1000 : undefined,
    promptTokens: promptTokens || undefined,
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
    stopped = true;
    void engine?.interruptGenerate();
    return;
  }
  if (request.type === "generate") {
    generate(request.id, request.model, request.messages, request.system, request.tools, request.maxTokens).catch(
      (error: unknown) => {
        post({ type: "error", id: request.id, message: (error as Error).message });
      },
    );
  }
});

// 쓰지 않지만 번들러가 형을 확인하도록 남긴다. WebWorker 판은 엔진을 또 워커에 넣는다.
void CreateWebWorkerMLCEngine;

post({ type: "ready" });
