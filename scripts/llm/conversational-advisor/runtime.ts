/** Chrome에서 앱과 같은 0.8B 워커·헤드·검색 벡터를 사용한다. */
import { ADVISOR_MODEL } from "../../../src/lib/advisor/config";
import { readJudgeHead, scoreJudge, type JudgeHead, type JudgeHeadMeta, type JudgeQuestion } from "../../../src/lib/advisor/judge";
import { offlineJudge } from "../../../src/lib/advisor/offlineJudge";
import { loadDocVectors, ranked } from "../../../src/lib/advisor/docVectors";
import { questionLanguage } from "../../../src/lib/advisor/questionLanguage";
import type { AdvisorRequest, AdvisorResponse } from "../../../src/lib/advisor/protocol";

type ResponseOf<T extends AdvisorResponse["type"]> = Extract<AdvisorResponse, { type: T }>;
export interface CallRecord { task: string; cached: boolean; seconds: number; fallback?: string }

export function createRuntime() {
  const worker = new Worker(new URL("../../../src/workers/advisor.worker.ts", import.meta.url), { type: "module" });
  const heads = new Map<string, Promise<JudgeHead>>();
  const cache = new Map<string, number[][] | Array<{ id: string; score: number }>>();
  const calls: CallRecord[] = [];
  let nextId = 1;
  let stalled = false;
  const offline = offlineJudge(async (file) => (await fetch(`/${file}`)).arrayBuffer());
  const vectors = loadDocVectors(`/${ADVISOR_MODEL.retrieval!.vectors}`);

  function request<T extends AdvisorResponse["type"]>(message: AdvisorRequest, type: T): Promise<ResponseOf<T>> {
    return new Promise((resolve, reject) => {
      const id = "id" in message ? message.id : undefined;
      const timer = window.setTimeout(() => finish(new Error(`${message.type} timeout`)), message.type === "load" || message.type === "generate" ? 180_000 : 30_000);
      const finish = (error?: Error, value?: ResponseOf<T>) => {
        window.clearTimeout(timer);
        worker.removeEventListener("message", listener);
        if (error) reject(error);
        else resolve(value!);
      };
      const listener = (event: MessageEvent<AdvisorResponse>) => {
        const value = event.data;
        if ("id" in value && value.id !== undefined && value.id !== id) return;
        if (value.type === "error") finish(new Error(value.message));
        else if (value.type === type) finish(undefined, value as ResponseOf<T>);
      };
      worker.addEventListener("message", listener);
      worker.postMessage(message);
    });
  }

  function loadHead(name: string): Promise<JudgeHead> {
    let loading = heads.get(name);
    if (!loading) {
      loading = Promise.all([fetch(`/models/judge/${name}.json`), fetch(`/models/judge/${name}.bin`)]).then(async ([meta, bin]) =>
        readJudgeHead(await meta.json() as JudgeHeadMeta, await bin.arrayBuffer()));
      heads.set(name, loading);
    }
    return loading;
  }

  async function judge(name: string, state: string, questions: JudgeQuestion[]): Promise<number[][]> {
    const key = JSON.stringify([name, state, questions]);
    const cached = cache.get(key) as number[][] | undefined;
    if (cached) { calls.push({ task: "judge", cached: true, seconds: 0 }); return cached; }
    const start = performance.now();
    try {
      if (stalled) throw new Error("earlier judge timeout");
      const head = await loadHead(name);
      const result = await request({ type: "judge", id: nextId++, model: ADVISOR_MODEL, state, questions, subset: head.subset, feature: head.feature }, "judged");
      const probs = result.features.map((flat, i) => scoreJudge(head, Array.from({ length: questions[i].options.length + 1 }, (_, j) => flat.subarray(j * head.dim, (j + 1) * head.dim))));
      calls.push({ task: "judge", cached: false, seconds: (performance.now() - start) / 1000 });
      cache.set(key, probs);
      return probs;
    } catch (error) {
      if (/timeout/.test(String(error))) stalled = true;
      calls.push({ task: "judge", cached: false, seconds: (performance.now() - start) / 1000, fallback: String(error) });
      return offline(name, state, questions);
    }
  }

  async function search(question: string, lang: string) {
    const key = JSON.stringify(["search", question, lang]);
    const cached = cache.get(key) as Array<{ id: string; score: number }> | undefined;
    if (cached) { calls.push({ task: "search", cached: true, seconds: 0 }); return cached; }
    const bank = await vectors;
    const asked = questionLanguage(question) ?? lang;
    const block = bank.languages[asked] ?? bank.languages[lang];
    const text = (bank.prompt[asked] ?? bank.prompt[lang]).replace("{}", question);
    const start = performance.now();
    const result = await request({ type: "embed", id: nextId++, model: ADVISOR_MODEL, text }, "embedded");
    const hits = ranked(result.vector, block.matrix, block.ids);
    calls.push({ task: "search", cached: false, seconds: (performance.now() - start) / 1000 });
    cache.set(key, hits);
    return hits;
  }

  async function generate(system: string, question: string, maxTokens = 48, purpose?: "grounded-summary") {
    const start = performance.now();
    const result = await request({ type: "generate", id: nextId++, model: ADVISOR_MODEL, system, messages: [{ role: "user", content: question }], maxTokens, purpose }, "done");
    calls.push({ task: "generate", cached: false, seconds: (performance.now() - start) / 1000 });
    return result;
  }

  return { judge, search, generate, calls, load: () => request({ type: "load", model: ADVISOR_MODEL }, "loaded"), close: () => worker.terminate(), model: ADVISOR_MODEL };
}
export type BrowserRuntime = ReturnType<typeof createRuntime>;
