/**
 * 메인 스레드 ↔ 상성 코치 워커 메시지 규약
 *
 * 모델 적재와 생성은 전부 워커에서 한다. 수 초에서 수십 초가 걸리는 작업이라
 * 메인 스레드에서 돌리면 화면이 통째로 멈춘다.
 */

export interface AdvisorModelSpec {
  id: string;
  dtype: string;
  /**
   * 추론 백엔드. 기본은 WebGPU 다.
   *
   * `?advisorDevice=wasm` 으로 CPU 를 강제할 수 있다. 속도가 이상할 때
   * "WebGPU 를 타고 있나, CPU 로 떨어졌나" 를 가르는 용도다. 둘이 같은 속도면
   * WebGPU 가 안 붙은 것이다.
   */
  device?: "webgpu" | "wasm";
  /**
   * 어느 ORT wasm 빌드를 쓸지. `?advisorWasm=plain` 이면 asyncify 가 아닌 쪽.
   *
   * **재봤고, 안 된다.** 평범한 빌드에는 WebGPU 백엔드가 없다.
   *   no available backend found. ERR: [webgpu] TypeError: z(...).webgpuInit is not a function
   *
   * transformers.js 가 Safari 에만 평범한 빌드를 주는 것은 Safari 가 WebGPU 대신
   * 다른 길로 가기 때문이지, 평범한 빌드가 더 나아서가 아니었다. asyncify 가
   * 느리다는 문서가 있어도 이 판에서는 WebGPU 를 쓰려면 그것뿐이다.
   * 스위치를 남기는 것은 다음 사람이 같은 길을 다시 파지 않게 하려는 것이다.
   */
  wasmBuild?: "asyncify" | "plain";
  /**
   * ORT 의 graph capture. `?advisorGraphCapture=1`
   *
   * 디코드 반복을 그래프로 잡아 두면 다른 기기에서 2.4배가 측정됐다.
   *
   * **재봤고, 안 된다.** 입출력이 전부 gpu-buffer 여야 하는데 logits 가 CPU 로 내려온다.
   *   Not supported preferred output location: cpu.
   *   Only 'gpu-buffer' location is supported when enableGraphCapture is true.
   *
   * transformers.js 는 present.* (KV 캐시)만 gpu-buffer 로 잡는다. 켜려면
   * 라이브러리를 고쳐 logits 까지 GPU 에 두고 고정 크기 KV 캐시를 써야 한다.
   */
  graphCapture?: boolean;
}

export interface AdvisorChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** 메인 → 워커 */
export type AdvisorRequest =
  /**
   * 어느 모델을 쓸지는 메인 스레드가 정해 넘긴다.
   * 워커의 `location` 은 워커 스크립트 주소라 페이지의 질의 문자열을 볼 수 없다.
   */
  | { type: "load"; model: AdvisorModelSpec }
  | {
      type: "generate";
      id: number;
      model: AdvisorModelSpec;
      messages: AdvisorChatMessage[];
      system?: string;
      /** 넘기면 모델이 조회 도구를 부를 수 있다. 복합 질문에만 쓴다. */
      tools?: unknown[];
      /**
       * 뽑을 토큰 수 상한. 안 주면 답변용 기본값을 쓴다.
       * 검색어처럼 한 줄만 필요한 회차는 짧게 끊어야 기다림이 눈에 안 띈다.
       */
      maxTokens?: number;
    }
  | { type: "stop" };

/** 파일 하나의 내려받기 진행 상황 */
export interface AdvisorFileProgress {
  file: string;
  loaded: number;
  total: number;
}

/** 워커 → 메인 */
export type AdvisorResponse =
  | { type: "ready" }
  /** 모델 파일 내려받기·적재 진행 */
  | { type: "progress"; files: AdvisorFileProgress[]; loadedBytes: number; totalBytes: number }
  | { type: "loaded" }
  /** 생성 중 토큰 조각 */
  | { type: "chunk"; id: number; text: string }
  | {
      type: "done";
      id: number;
      text: string;
      tokens: number;
      seconds: number;
      /** 첫 토큰까지 걸린 시간. 프롬프트를 읽는 데 쓴 몫이다. */
      ttftSeconds?: number;
      /** 프롬프트 길이. 읽는 시간이 길면 여기가 큰 것이다. */
      promptTokens?: number;
    }
  | { type: "error"; id?: number; message: string };
