/** 부정·정정 시험의 새 입력만 계산한다. 기존 실험 캐시와 운영 모델은 바꾸지 않는다. */
import fs from "node:fs/promises";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { normalizeMessage } from "../../../src/lib/advisor/offlineJudge";

const directory = "research/.cache/request-comparison";
const fixture = JSON.parse(await fs.readFile("scripts/llm/offline-classifier/request-negation.json", "utf8")) as Record<string, Record<string, Record<string, string[]>>>;
const texts = [...new Set(Object.values(fixture).flatMap(languages => Object.values(languages)
  .flatMap(scopes => Object.values(scopes).flat())).map(text => normalizeMessage(text, ["◇"])) )];
const results: Record<string, { meta: unknown; vectors: Record<string, number[]> }> = {};
for (const name of ["arctic", "e5-small"] as const) {
  const cacheFile = name === "arctic" ? "arctic-v2.json" : "e5-small-q8.json";
  const cache = JSON.parse(await fs.readFile(`${directory}/${cacheFile}`, "utf8")) as { meta: { model: string; prefix: string; revision?: string }; vectors: Record<string, number[]> };
  env.cacheDir = path.resolve(`${directory}/transformers`);
  const extractor = name === "e5-small" ? await pipeline("feature-extraction", cache.meta.model,
    { revision: cache.meta.revision, dtype: "q8", device: "cpu" }) : undefined;
  const vectors: Record<string, number[]> = {};
  for (let offset = 0; offset < texts.length; offset += 16) {
    const batch = texts.slice(offset, offset + 16);
    let values: number[][];
    if (extractor) values = (await extractor(batch.map(text => cache.meta.prefix + text), { pooling: "mean", normalize: true })).tolist() as number[][];
    else {
      const response = await fetch("http://127.0.0.1:11434/api/embed", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cache.meta.model, input: batch.map(text => cache.meta.prefix + text), truncate: false, keep_alive: "5m" }) });
      if (!response.ok) throw new Error(`Embedding ${response.status}`);
      values = ((await response.json()) as { embeddings: number[][] }).embeddings;
    }
    if (values.length !== batch.length) throw new Error("Embedding count mismatch");
    batch.forEach((text, index) => { vectors[text] = values[index]; });
  }
  results[name] = { meta: cache.meta, vectors };
  await extractor?.dispose();
  console.log(`${name}: ${texts.length} vectors`);
}
await fs.writeFile(`${directory}/negation-vectors.json`, JSON.stringify(results));
