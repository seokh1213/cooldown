/** 작은 ONNX 임베딩 모델을 같은 903문장에서 측정한다. 앱 경로에는 연결하지 않는다. */
import fs from "node:fs/promises";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";

const cacheDir = "research/.cache/request-comparison";
const model = "Xenova/multilingual-e5-small";
const revision = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
const prefix = "query: ";
const file = `${cacheDir}/e5-small-q8.json`;
env.cacheDir = path.resolve(`${cacheDir}/transformers`);

const source = JSON.parse(await fs.readFile(`${cacheDir}/arctic-v2.json`, "utf8")) as { vectors: Record<string, number[]> };
const texts = Object.keys(source.vectors);
const extractor = await pipeline("feature-extraction", model, { revision, dtype: "q8", device: "cpu" });
const meta = { model, revision, dtype: "q8", prefix, dimensions: 384, engineBytes: 118308185 };
const cached = await fs.readFile(file, "utf8").then(text => JSON.parse(text) as { meta: typeof meta; vectors: Record<string, number[]> }).catch(() => undefined);
const vectors = cached?.meta.revision === revision && cached.meta.prefix === prefix ? cached.vectors : {};
const missing = texts.filter(text => !vectors[text]);
const start = performance.now();
for (let offset = 0; offset < missing.length; offset += 16) {
  const batch = missing.slice(offset, offset + 16);
  const result = await extractor(batch.map(text => prefix + text), { pooling: "mean", normalize: true });
  const values = result.tolist() as number[][];
  if (values.length !== batch.length || values.some(value => value.length !== meta.dimensions)) throw new Error("Small embedding shape mismatch");
  batch.forEach((text, index) => { vectors[text] = values[index]; });
  await fs.writeFile(file, JSON.stringify({ meta, vectors }));
  if (offset % 160 === 0) console.log(`E5 ${Math.min(offset + batch.length, missing.length)}/${missing.length}`);
}
const encodeBatchSeconds = (performance.now() - start) / 1000;
const times = [];
for (const text of texts.slice(-99).slice(0, 20)) {
  const began = performance.now();
  await extractor(prefix + text, { pooling: "mean", normalize: true });
  times.push(performance.now() - began);
}
times.sort((a, b) => a - b);
const measurement = { ...meta, cacheMisses: missing.length, encodeBatchSeconds,
  warmSingleQueryLatency: { p50Ms: times[10], p95Ms: times[18] } };
await fs.writeFile(file, JSON.stringify({ meta: measurement, vectors }));
console.log(JSON.stringify(measurement, null, 2));
await extractor.dispose();
