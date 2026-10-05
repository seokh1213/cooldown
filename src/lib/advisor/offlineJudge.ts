/**
 * 오프라인 판정기 — 모델(0.8B)을 받지 않은 기기에서 판정 헤드(`judge.ts`) 자리를 대신하는 작은 글 분류기
 *
 * 판정기는 0.8B 의 속내에 헤드를 얹는다. 모델이 없는 기기는 한국어 낱말 목록으로 갈랐고 영어·중국어에서는
 * 거의 아무것도 못 가렸다(대화 270턴: 낱말 114, 판정기 240). 여기서는 글자 n-gram 을 해시로 담은 다항
 * 로지스틱 회귀(`public/models/offline/judge.{json,bin}`, 0.8MB)가 같은 질문 꼴을 받아 확률을 낸다.
 * 학습은 `scripts/llm/offline-classifier/train.py` — **특징 뽑기·해시가 그 파일과 한 글자도 다르면 안 된다.**
 *
 * 특징(파이썬과 같아야 하는 것):
 *   1. 상태 글에서 첫 "Question: " / "New message: " 줄의 글이 메시지, "Champions named: " 또는
 *      "Champion named in the new message: " 줄이 이름 목록
 *   2. ASCII 만 소문자로 → 이름을 긴 것부터 " ◇ " 로 바꿈 → 공백([ \t\n\r\f\v\u00a0\u3000]+)을 한 칸으로
 *   3. "^" + 글 + "$" 의 코드 포인트 1~3-gram ("c:" + gram), 공백으로 나눈 낱말 ("w:" + 낱말),
 *      깃발 "f:names=0|1|2", "f:script=hangul|han|latin|other"
 *   4. 키를 UTF-8 바이트로 FNV-1a 32비트 해시(offset 2166136261, prime 16777619) → 버킷 = 해시 % B.
 *      벡터는 있는 버킷마다 1/sqrt(버킷 수)
 *   5. 로짓 = W[버킷] 합 + 편향, softmax. W 는 fp16, 버킷-우선(row-major [B, C])
 *
 * 질문은 지시문으로 알아본다(갈래 아홉 칸·주제·대화 흐름). 모르는 지시문(내 챔피언 고르기)은 고른 확률로 돌려준다 —
 * 앱은 그 자리를 문형 규칙(`matchupSidesByPhrase`)이 먼저 채운다.
 */
import type { JudgeQuestion } from "./judge";

export interface OfflineTaskMeta {
  instructions: string;
  /** label: 라벨 하나를 고른다. option: 선택지 이름마다 no/yes 를 매긴다(내 챔피언 고르기) */
  mode: "label" | "option";
  labels: string[];
  /** `.bin` 안의 바이트 위치. 길이는 buckets × labels × 2 */
  offset: number;
  bias: number[];
}

export interface OfflineJudgeMeta {
  version: number;
  hash: "fnv1a32";
  buckets: number;
  ngram: [number, number];
  placeholder: string;
  dtype: "float16";
  tasks: Record<string, OfflineTaskMeta>;
}

export interface OfflineTask {
  mode: "label" | "option";
  labels: string[];
  /** [buckets × labels], 버킷-우선 */
  weights: Float32Array;
  bias: Float32Array;
}

export interface OfflineModel {
  buckets: number;
  /** 지시문 → 과제 */
  tasks: Map<string, OfflineTask>;
}

const PLACEHOLDER = " ◇ ";
const MARK = " ★ ";
const WS = /[ \t\n\r\f\v\u00a0\u3000]+/g;

/** FNV-1a 32비트, 글의 UTF-8 바이트 위에서. 파이썬 `fnv1a32` 와 같다. */
export function fnv1a32(key: string): number {
  let h = 2166136261;
  const mix = (byte: number) => {
    h ^= byte;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (const ch of key) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) mix(cp);
    else if (cp < 0x800) {
      mix(0xc0 | (cp >> 6));
      mix(0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      mix(0xe0 | (cp >> 12));
      mix(0x80 | ((cp >> 6) & 0x3f));
      mix(0x80 | (cp & 0x3f));
    } else {
      mix(0xf0 | (cp >> 18));
      mix(0x80 | ((cp >> 12) & 0x3f));
      mix(0x80 | ((cp >> 6) & 0x3f));
      mix(0x80 | (cp & 0x3f));
    }
  }
  return h >>> 0;
}

/** 상태 글에서 메시지와 이름 목록을 읽는다(`judgeRouteState` · `actState` 꼴) */
export function parseJudgeState(state: string): { message: string; names: string[] } {
  let message: string | undefined;
  let names: string[] = [];
  for (const line of state.split("\n")) {
    if (message === undefined && line.startsWith("Question: ")) message = line.slice("Question: ".length);
    else if (message === undefined && line.startsWith("New message: ")) message = line.slice("New message: ".length);
    else if (line.startsWith("Champions named: ")) names = line.slice("Champions named: ".length).split(", ").filter(Boolean);
    else if (line.startsWith("Champion named in the new message: ")) names = [line.slice("Champion named in the new message: ".length)];
  }
  return { message: message ?? "", names };
}

const asciiLower = (text: string) => text.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

/** 이름은 ◇, 표시한 후보(mark, 내 챔피언 고르기)는 ★ */
export function normalizeMessage(message: string, names: string[], mark?: string): string {
  let text = asciiLower(message);
  const targets = mark && !names.includes(mark) ? [...names, mark] : [...names];
  // 긴 이름부터(코드 포인트 수, 파이썬 len 과 같게). 같은 길이는 적힌 순서(이름 목록 뒤에 후보)
  for (const name of targets.sort((a, b) => [...b].length - [...a].length)) {
    if (name) text = text.split(asciiLower(name)).join(name === mark ? MARK : PLACEHOLDER);
  }
  return text.split(WS).filter(Boolean).join(" ");
}

function scriptOf(text: string): string {
  if (/[가-힣ᄀ-ᇿ㄰-㆏]/.test(text)) return "hangul";
  if (/[一-鿿㐀-䶿]/.test(text)) return "han";
  if (/[a-z]/.test(text)) return "latin";
  return "other";
}

/** 상태 글 하나의 특징 버킷(오름차순, 중복 없음) */
export function featureBuckets(state: string, buckets: number, mark?: string): number[] {
  const { message, names } = parseJudgeState(state);
  const text = normalizeMessage(message, names, mark);
  const keys = new Set<string>();
  const chars = Array.from(`^${text}$`);
  for (let n = 1; n <= 3; n += 1) {
    for (let i = 0; i + n <= chars.length; i += 1) keys.add(`c:${chars.slice(i, i + n).join("")}`);
  }
  for (const word of text.split(" ")) if (word) keys.add(`w:${word}`);
  keys.add(`f:names=${Math.min(names.length, 2)}`);
  keys.add(`f:script=${scriptOf(text)}`);
  const out = new Set<number>();
  for (const key of keys) out.add(fnv1a32(key) % buckets);
  return [...out].sort((a, b) => a - b);
}

/** fp16 → fp32 */
function halfToFloat(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const frac = h & 0x3ff;
  if (exp === 0) return sign * frac * 2 ** -24;
  if (exp === 0x1f) return frac ? NaN : sign * Infinity;
  return sign * (1 + frac / 1024) * 2 ** (exp - 15);
}

export function readOfflineModel(meta: OfflineJudgeMeta, buffer: ArrayBuffer): OfflineModel {
  if (meta.hash !== "fnv1a32" || meta.dtype !== "float16") throw new Error(`오프라인 판정기 꼴을 모릅니다: ${meta.hash} ${meta.dtype}`);
  const view = new DataView(buffer);
  const tasks = new Map<string, OfflineTask>();
  for (const task of Object.values(meta.tasks)) {
    const size = meta.buckets * task.labels.length;
    if (task.offset + size * 2 > buffer.byteLength) throw new Error(`오프라인 판정기 크기가 맞지 않습니다: ${task.instructions}`);
    const weights = new Float32Array(size);
    for (let i = 0; i < size; i += 1) weights[i] = halfToFloat(view.getUint16(task.offset + i * 2, true));
    tasks.set(task.instructions, { mode: task.mode ?? "label", labels: task.labels, weights, bias: Float32Array.from(task.bias) });
  }
  return { buckets: meta.buckets, tasks };
}

/** 한 과제의 라벨별 확률(라벨 순서). mark 는 내 챔피언 고르기의 후보 이름 */
export function scoreOffline(model: OfflineModel, task: OfflineTask, state: string, mark?: string): number[] {
  const active = featureBuckets(state, model.buckets, mark);
  const scale = 1 / Math.sqrt(active.length);
  const C = task.labels.length;
  const logits = Array.from(task.bias);
  for (const bucket of active) {
    const row = bucket * C;
    for (let c = 0; c < C; c += 1) logits[c] += task.weights[row + c] * scale;
  }
  const top = Math.max(...logits);
  const exp = logits.map((v) => Math.exp(v - top));
  const total = exp.reduce((a, b) => a + b, 0);
  return exp.map((v) => v / total);
}

const uniform = (n: number) => Array.from({ length: n }, () => 1 / n);

/**
 * 판정기 꼴(`PlanDeps.judge`)로 답한다. 선택지는 이름으로 맞춘다 — 배운 라벨에 없는 이름은 0, 남은 확률은 다시 1 로.
 * 후보 모드(내 챔피언 고르기)는 선택지 이름마다 "★ 가 내 챔피언인가" 의 yes 확률을 매겨 후보끼리 1 로 맞춘다.
 * 모르는 지시문은 고른 확률.
 */
export function answerOffline(model: OfflineModel, state: string, questions: JudgeQuestion[]): number[][] {
  return questions.map((question) => {
    const task = model.tasks.get(question.instructions);
    if (!task) return uniform(question.options.length);
    const probs = task.mode === "option" ? undefined : scoreOffline(model, task, state);
    const picked = question.options.map((option) => {
      if (!probs) return scoreOffline(model, task, state, option.name)[1];
      const i = task.labels.indexOf(option.name);
      return i >= 0 ? probs[i] : 0;
    });
    const total = picked.reduce((a, b) => a + b, 0);
    return total > 0 ? picked.map((p) => p / total) : uniform(question.options.length);
  });
}

export const OFFLINE_JUDGE_FILES = { meta: "models/offline/judge.json", weights: "models/offline/judge.bin" } as const;

/**
 * 파일을 받아 판정기를 만든다. 처음 부를 때 한 번 받고, 실패하면 다음에 다시 받는다.
 *
 * @param read  경로(`models/offline/judge.json` 처럼 public 아래 상대 경로)를 받아 바이트를 돌려준다.
 *              브라우저는 `fetch(BASE_URL + path).arrayBuffer()`, Node 는 `fs.readFile`.
 */
export function offlineJudge(read: (path: string) => Promise<ArrayBuffer>, files: { meta: string; weights: string } = OFFLINE_JUDGE_FILES): (headName: string, state: string, questions: JudgeQuestion[]) => Promise<number[][]> {
  let pending: Promise<OfflineModel> | undefined;
  const load = () => {
    pending ??= Promise.all([read(files.meta), read(files.weights)]).then(([meta, bin]) =>
      readOfflineModel(JSON.parse(new TextDecoder().decode(meta)) as OfflineJudgeMeta, bin),
    );
    pending.catch(() => (pending = undefined));
    return pending;
  };
  return async (_headName, state, questions) => answerOffline(await load(), state, questions);
}
