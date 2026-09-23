/**
 * 메인 스레드 ↔ 상성 코치 워커 메시지 규약
 *
 * 모델 적재와 생성은 전부 워커에서 한다. 수 초에서 수십 초가 걸리는 작업이라
 * 메인 스레드에서 돌리면 화면이 통째로 멈춘다.
 */

import type { JudgeQuestion } from "./judge";

export interface AdvisorModelSpec {
  id: string;
  dtype: string;
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
      /**
       * 거짓이면 반복 차단을 걸지 않는다. 번호만 쓰는 XML(`<fact id="3"/>` 이 줄지어 나온다)은
       * 같은 글자가 되풀이되는 것이 정상이라 차단이 멀쩡한 답을 자른다.
       */
      loopGuard?: boolean;
    }
  /**
   * 판정. 글을 쓰지 않고 질문마다 판정 위치의 특징만 뽑아 돌려준다.
   * 헤드 계산은 메인 스레드가 한다(`judge.ts`). `subset` 은 헤드가 배운 logits 토큰이다.
   */
  | { type: "judge"; id: number; model: AdvisorModelSpec; state: string; questions: JudgeQuestion[]; subset: number[] }
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
      /** 반복 차단이 끊었는가. 그랬다면 `text` 는 되풀이한 꼬리를 걷어 낸 글이다. */
      looped?: boolean;
      /** 첫 토큰까지 걸린 시간. 프롬프트를 읽는 데 쓴 몫이다. */
      ttftSeconds?: number;
      /** 프롬프트 길이. 읽는 시간이 길면 여기가 큰 것이다. */
      promptTokens?: number;
    }
  /** 질문마다 [판정 위치 수 × subset 길이] 를 이어 붙인 특징 */
  | { type: "judged"; id: number; features: Float32Array[]; seconds: number }
  | { type: "error"; id?: number; message: string };
