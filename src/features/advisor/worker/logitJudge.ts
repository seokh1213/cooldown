import { Tensor } from "@huggingface/transformers";
import { encodeJudgeRow, JUDGE_SPECIAL, type JudgeQuestion } from "@/features/advisor/model/judge";
import type { AdvisorModelSpec } from "@/features/advisor/contracts/protocol";
import { getModel, getTokenizer, load } from "./model";
import { post } from "./port";

type Cache = Record<string, Tensor>;

const dispose = (cache: Cache) => {
  for (const tensor of Object.values(cache)) (tensor as Tensor & { dispose?: () => void }).dispose?.();
};

/**
 * 판정기가 읽은 질문 글의 상태.
 *
 * 한 질문에 판정을 여럿 한다(갈래·내 챔피언·주제). 모두 같은 질문 글로 시작하므로 그 부분은
 * 한 번만 읽고 이어 쓴다. 입력으로 넘긴 텐서를 실행기가 고치지 않으므로 여러 갈래가
 * 같은 상태에서 출발해도 안전하다. 모델을 다시 올리면 버린다.
 *
 * 줄어드는 시간은 크지 않다(주제 판정 문항당 0.78 → 0.80초로 사실상 같다). 질문 글은
 * 20토큰 남짓이고, 시간 대부분은 선택지 설명을 판정 위치마다 끊어 넣는 데 든다. 선택지는
 * 질문 글 뒤에 오므로 미리 계산해 둘 수 없다.
 */
let judgePrefix: { key: string; length: number; cache: Cache } | null = null;

function clearJudgePrefix() {
  if (judgePrefix) dispose(judgePrefix.cache);
  judgePrefix = null;
}

export function forgetJudgePrefix() {
  judgePrefix = null;
}

/** 조각 하나를 넣는다. 마지막 위치의 logits 한 줄과 이어 갈 상태를 돌려준다. */
async function step(chunk: number[], total: number, past: Cache | undefined) {
  const result = (await getModel()!.forward({
    input_ids: new Tensor("int64", BigInt64Array.from(chunk.map(BigInt)), [1, chunk.length]),
    attention_mask: new Tensor("int64", new BigInt64Array(total).fill(1n), [1, total]),
    num_logits_to_keep: new Tensor("int64", [1n], []),
    // 첫 조각에는 넘기지 않는다. 빈 객체를 주면 라이브러리가 캐시로 알고 .update() 를 부른다.
    ...(past ? { past_key_values: past } : {}),
  })) as Record<string, Tensor>;
  const next: Cache = {};
  // 이름만 present → past 로 바꾼다
  for (const [name, tensor] of Object.entries(result)) {
    if (!name.startsWith("present")) continue;
    next[name.replace("present_conv", "past_conv").replace("present_recurrent", "past_recurrent").replace("present", "past_key_values")] = tensor;
  }
  return { logits: result.logits, next };
}

/**
 * 판정 위치의 특징을 뽑는다.
 *
 * 판정 위치마다 그 위치가 마지막 토큰이 되도록 입력을 끊어 넣고, 앞 조각의 상태를 이어
 * 받는다. 그러면 위치마다 logits 한 줄(1MB)만 GPU 에서 내려온다. 한 번에 넣고 모든 위치의
 * logits 를 받으면 길이 150 에 150MB 다.
 *
 * 생성과 같은 세션을 쓴다. 모델을 두 번 올리지 않는다.
 */
export async function judge(id: number, spec: AdvisorModelSpec, state: string, questions: JudgeQuestion[], subset: number[]) {
  await load(spec);
  const tokenizer = getTokenizer();
  if (!tokenizer || !getModel()) throw new Error("모델이 준비되지 않았습니다");
  const started = performance.now();
  const special = tokenizer.convert_tokens_to_ids([...JUDGE_SPECIAL]) as number[];
  // 사용자 글이 구분 토큰을 흉내 내도 특수 토큰이 되지 않게 한다(kev 와 같은 처리).
  const tokenize = (text: string) =>
    getTokenizer()!.encode(text.replace(/<\|(\w+)\|>/g, "<¦$1¦>"), { add_special_tokens: false }) as number[];

  // 질문 글 부분(<state> …)을 한 번만 읽는다. 앞선 판정과 같은 글이면 그 상태를 그대로 쓴다.
  const prefixIds = [special[0], ...tokenize(state)];
  const key = `${spec.id}:${spec.dtype}:${prefixIds.join(",")}`;
  if (judgePrefix?.key !== key) {
    clearJudgePrefix();
    const { next } = await step(prefixIds, prefixIds.length, undefined);
    judgePrefix = { key, length: prefixIds.length, cache: next };
  }
  const prefix = judgePrefix!;

  const features: Float32Array[] = [];
  for (const question of questions) {
    const row = encodeJudgeRow(tokenize, special, state, question);
    const out = new Float32Array(row.positions.length * subset.length);
    let past: Cache = prefix.cache;
    let start = prefix.length;
    for (const [k, position] of row.positions.entries()) {
      const { logits, next } = await step(row.ids.slice(start, position + 1), position + 1, past);
      const data = logits.data as Float32Array;
      const last = data.length - logits.dims[logits.dims.length - 1];
      for (const [j, token] of subset.entries()) out[k * subset.length + j] = data[last + token];
      // 질문 글의 상태는 다음 판정이 또 쓰므로 지우지 않는다
      if (past !== prefix.cache) dispose(past);
      past = next;
      start = position + 1;
    }
    if (past !== prefix.cache) dispose(past);
    features.push(out);
  }
  post(
    { type: "judged", id, features, seconds: (performance.now() - started) / 1000 },
    features.map((f) => f.buffer),
  );
}
