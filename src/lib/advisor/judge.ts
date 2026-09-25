/**
 * 판정기 — 글을 쓰지 않고 고르기만 하는 0.8B
 *
 * 0.8B 는 한국어 조언 글을 못 쓴다(짧은 프롬프트·예시·바꿔 쓰기·int8 모두 1~2점).
 * 대신 읽기는 한다. kev(jaredpalmer/kev)의 방식을 따라, 모델이 입력을 읽고 만든 속내를
 * 작은 판정 헤드에 넣어 선택지마다 확률을 낸다. 생성하지 않으므로 되풀이·지어내기·형식
 * 붕괴가 일어날 자리가 없다.
 *
 * **모델 파일은 그대로다.** 속내(마지막 은닉 상태)를 꺼내려면 그래프를 고쳐야 하는데,
 * 그러면 그 파일을 우리가 호스팅해야 하고 551MB 가중치가 GitHub Pages 한도에 걸린다.
 * 그런데 이 모델은 출력층이 임베딩과 묶여 있어(lm_head = embed_tokens) logits 가 곧
 * 은닉 상태의 선형 변환이다. 그중 토큰 2048개만 골라 쓰면 1024차원 속내를 2048차원에
 * 옮긴 셈이라 정보가 줄지 않는다. 생성에 쓰는 세션을 그대로 쓰고, 판정 위치마다 입력을
 * 끊어 넣어 그 위치의 logits 하나(1MB)만 받는다. 한 번에 넣은 것과 끊어 넣은 것의 차이는
 * 최대 0.00003 이었다(값 크기 1.66).
 *
 * 입력 꼴은 kev 와 같다.
 *   <state> 질문… <q> 지시 <opt> 선택지 </opt> … <decide>
 * 구분 토큰은 Qwen 이 거의 안 쓰는 특수 토큰 다섯을 빌린다. 판정 위치는 선택지마다
 * `</opt>` 와 마지막 `<decide>` 다.
 *
 * 헤드는 kev 의 PointerHead 다: 선형 두 개(q, k)와 내적. 입력 정규화(평균·표준편차)는
 * 내보낼 때 가중치에 접어 넣었다.
 */

/** kev 가 빌려 쓰는 특수 토큰. 순서가 곧 역할이다: state, q, opt, /opt, decide. */
export const JUDGE_SPECIAL = ["<|fim_prefix|>", "<|fim_middle|>", "<|box_start|>", "<|box_end|>", "<|fim_suffix|>"] as const;

export interface JudgeOption {
  name: string;
  /** 선택지 설명. 없으면 이름만 적는다. */
  description?: string | null;
}

export interface JudgeQuestion {
  instructions: string;
  options: JudgeOption[];
}

/** 워커가 판정 위치의 특징을 뽑는 데 필요한 것. 토큰화는 워커가 한다. */
export interface JudgeRow {
  ids: number[];
  /** 선택지마다의 `</opt>` 위치, 마지막이 `<decide>` */
  positions: number[];
}

/**
 * kev 입력 꼴로 조립한다.
 *
 * 사용자 글에 구분 토큰과 같은 글자가 들어와도 토큰화기가 그것을 특수 토큰으로 바꾸지
 * 않아야 한다. 호출하는 쪽의 `tokenize` 가 특수 토큰을 풀지 않게 해 둔다.
 */
export function encodeJudgeRow(
  tokenize: (text: string) => number[],
  special: readonly number[],
  state: string,
  question: JudgeQuestion,
): JudgeRow {
  const [stateId, questionId, optionId, closeId, decideId] = special;
  const ids = [stateId, ...tokenize(state), questionId, ...tokenize(question.instructions)];
  const positions: number[] = [];
  for (const option of question.options) {
    // kev 는 설명이 있으면 "이름: 설명" 으로 적는다. 학습 자료가 그 꼴이다.
    const text = option.description ? `${option.name}: ${option.description}` : option.name;
    ids.push(optionId, ...tokenize(text), closeId);
    positions.push(ids.length - 1);
  }
  ids.push(decideId);
  positions.push(ids.length - 1);
  return { ids, positions };
}

/** 판정 헤드. 정규화는 가중치에 접혀 있다. */
export interface JudgeHead {
  /** 어느 모델의 속내로 학습했는가. 다른 모델에 붙이면 뜻이 없다. `graph` 는 그래프를 바꿔 끼운 모델(kev LoRA) */
  model: { id: string; dtype: string; graph?: string };
  /** 특징. logits(기본, subset 토큰) 또는 은닉 상태(kev 헤드) */
  feature?: "logits" | "hidden";
  /** 특징으로 쓰는 logits 토큰 id */
  subset: number[];
  /** 입력 차원(= subset 길이)과 판정 차원 */
  dim: number;
  pointer: number;
  /** [pointer × dim] 행 우선 */
  qWeight: Float32Array;
  qBias: Float32Array;
  kWeight: Float32Array;
  kBias: Float32Array;
  /** 확률 보정 온도. 1 이면 날것 */
  temperature: number;
}

function project(weight: Float32Array, bias: Float32Array, x: Float32Array, rows: number, cols: number): Float32Array {
  const out = new Float32Array(rows);
  for (let r = 0; r < rows; r += 1) {
    let sum = bias[r];
    const base = r * cols;
    for (let c = 0; c < cols; c += 1) sum += weight[base + c] * x[c];
    out[r] = sum;
  }
  return out;
}

/**
 * 선택지마다 확률을 낸다.
 *
 * `features` 는 판정 위치 순서대로 — 선택지마다 하나, 마지막이 decide.
 */
export function scoreJudge(head: JudgeHead, features: Float32Array[]): number[] {
  const decide = features[features.length - 1];
  const query = project(head.qWeight, head.qBias, decide, head.pointer, head.dim);
  const scale = 1 / Math.sqrt(head.pointer);
  const logits = features.slice(0, -1).map((option) => {
    const key = project(head.kWeight, head.kBias, option, head.pointer, head.dim);
    let dot = 0;
    for (let i = 0; i < head.pointer; i += 1) dot += key[i] * query[i];
    return (dot * scale) / head.temperature;
  });
  const top = Math.max(...logits);
  const exp = logits.map((value) => Math.exp(value - top));
  const total = exp.reduce((a, b) => a + b, 0);
  return exp.map((value) => value / total);
}

/** 내보낸 헤드 파일의 머리. 가중치는 같은 이름의 `.bin`(float32, 아래 순서)에 있다. */
export interface JudgeHeadMeta {
  model: { id: string; dtype: string; graph?: string };
  feature?: "logits" | "hidden";
  subset: number[];
  dim: number;
  pointer: number;
  temperature: number;
  /** 이 헤드가 배운 질문 꼴. 묻는 쪽이 한 글자도 다르지 않게 써야 한다. */
  instructions: Record<string, string>;
  criteria?: Record<string, Record<string, string>>;
}

/** `.bin` 을 읽는다. 순서: qWeight, qBias, kWeight, kBias */
export function readJudgeHead(meta: JudgeHeadMeta, buffer: ArrayBuffer): JudgeHead {
  const all = new Float32Array(buffer);
  const matrix = meta.pointer * meta.dim;
  const expected = 2 * (matrix + meta.pointer);
  if (all.length !== expected) throw new Error(`판정 헤드 크기가 맞지 않습니다: ${all.length} ≠ ${expected}`);
  let offset = 0;
  const take = (length: number) => {
    const part = all.subarray(offset, offset + length);
    offset += length;
    return part;
  };
  return {
    model: meta.model,
    feature: meta.feature,
    subset: meta.subset,
    dim: meta.dim,
    pointer: meta.pointer,
    qWeight: take(matrix),
    qBias: take(meta.pointer),
    kWeight: take(matrix),
    kBias: take(meta.pointer),
    temperature: meta.temperature,
  };
}
