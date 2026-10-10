/** 형식 제약만 제공한다. 의미 정답이나 질문별 기대 답변은 모델에 전달하지 않는다. */
import { performance } from "node:perf_hooks";
export const MODEL = "qwen3.5:0.8b";
export interface Generation { text: string; seconds: number; doneReason: string; outputTokens: number; promptTokens: number }
export async function generate(input: { system: string; content: string; schema?: Record<string, unknown>; seed?: number; maxTokens?: number }): Promise<Generation> {
  const started = performance.now();
  const response = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ model: MODEL, stream: false, think: false, keep_alive: "10m", format: input.schema,
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.content }],
      options: { temperature: input.seed === undefined ? 0 : 0.4, seed: input.seed ?? 0, num_ctx: 8192,
        num_predict: input.maxTokens ?? 256, repeat_penalty: 1.05 } }),
  });
  if (!response.ok) throw new Error(`Ollama ${response.status}: ${await response.text()}`);
  const value = await response.json() as { message: { content: string }; done_reason: string; eval_count: number; prompt_eval_count: number };
  return { text: value.message.content, seconds: (performance.now() - started) / 1000,
    doneReason: value.done_reason, outputTokens: value.eval_count, promptTokens: value.prompt_eval_count };
}
