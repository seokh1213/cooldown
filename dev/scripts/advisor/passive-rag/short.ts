/** 정답 문형이 아니라 챔피언별로 동일한 짧은 원문 묶음을 주는 추가 대조 시험. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { AutoTokenizer } from "@huggingface/transformers";
import { ADVISOR_MODEL } from "../../../../src/features/advisor/model/config";
import { splitSentences } from "../../../../src/features/advisor/answers/presentation/answerText";
import { loadData, ROOT } from "../kev-agent/lib";
import { cases } from "./cases";

const output = path.join(ROOT, "dev/research/llm-evals/passive-rag");
const data = loadData("ko_KR");
const akshan = data.cardById.get("Akshan")!.spells.find(spell => spell.slot === "P")!;
const pyke = data.cardById.get("Pyke")!.spells.find(spell => spell.slot === "P")!;
const references: Record<string, string> = {
  // 피해 유형이 모순되는 요약은 제외한다. 문장을 고쳐 쓰거나 정답을 새로 만들지 않는다.
  Akshan: akshan.text,
  // 회복 비축 수치와 전환을 섞지 않는 출처 대조군. 모든 파이크 질문에 동일한 근거를 준다.
  Pyke: `${splitSentences(pyke.summary!).at(-1)} ${splitSentences(pyke.text).at(-1)}`,
};
const selected = cases.filter(item => ["a01", "a04", "a06", "p01", "p02", "p05", "p06", "p08"].includes(item.id));
const system = "주어진 근거만 사용해서 질문에 직접 답하세요. 한국어로 짧게 답하고, 근거에 없는 내용은 말하지 마세요.";
const tokenizer = await AutoTokenizer.from_pretrained(ADVISOR_MODEL.id);
const templateOptions = { tokenize: false as const, add_generation_prompt: true, enable_thinking: false };
const rows: Array<Record<string, unknown>> = [];
for (const item of selected) {
  const content = `근거: ${references[item.expectedOwner]}\n질문: ${item.question}\n답변:`;
  const generated: Record<string, unknown> = {};
  const messages = [{ role: "system", content: system }, { role: "user", content }];
  const rawPrompt = tokenizer.apply_chat_template(messages, templateOptions) as string;
  for (const mode of ["short-chat", "short-raw-template"] as const) {
    const started = performance.now();
    const response = await fetch(`http://127.0.0.1:11434/api/${mode === "short-chat" ? "chat" : "generate"}`, {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ model: "qwen3.5:0.8b", stream: false, think: false, options: { temperature: 0, num_ctx: 2048, num_predict: 160, repeat_penalty: 1, presence_penalty: 0 },
        ...(mode === "short-chat" ? { messages } : { prompt: rawPrompt, raw: true, options: { temperature: 0, num_ctx: 2048, num_predict: 160, repeat_penalty: 1, presence_penalty: 0, stop: ["<|im_end|>"] } }) }),
    });
    const value = await response.json() as { message?: { content: string }; response?: string; error?: string; done_reason: string; eval_count: number; prompt_eval_count: number };
    generated[mode] = { text: value.message?.content ?? value.response, error: value.error, seconds: (performance.now() - started) / 1000,
      doneReason: value.done_reason, outputTokens: value.eval_count, promptTokens: value.prompt_eval_count };
  }
  rows.push({ ...item, prompt: content, ...generated });
}
writeFileSync(path.join(output, "short-results.json"), JSON.stringify({ backend: "Ollama Q8_0", scope: "eight author-selected diagnostic cases; fixed same reference per champion; not a retrieval benchmark",
  system, references, rows, template: "official app tokenizer apply_chat_template, enable_thinking=false, also tested raw=true to falsify chat formatting" }, null, 2) + "\n");
console.log(JSON.stringify({ rows: rows.length, calls: rows.length * 2 }));
