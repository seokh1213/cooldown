/**
 * 하이브리드 검색을 **앱 코드 그대로** 채점한다(hybridSearch · buildRetrievalDocs · lexicalSearch · 낱말 단계). hybrid_score.py 와
 * 같은 수치가 나와야 한다.
 *
 *   npx tsx scripts/llm/vector-search/eval_hybrid.ts <질문.jsonl> <질문 벡터 .f32> <test-half|no-champion|all>
 */
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import { ranked } from "../../../src/lib/advisor/docVectors";
import { questionLanguage } from "../../../src/lib/advisor/questionLanguage";
import { buildRetrievalDocs, hybridSearch, lexicalSearch, type LexicalHit } from "../../../src/lib/advisor/searchFallback";
import { current } from "./corpus";
import { loadData, ROOT, type Lang } from "../kev-agent/lib";

const [input, vecFile, maskMode] = process.argv.slice(2);
const rows = fs
  .readFileSync(input, "utf8")
  .trim()
  .split("\n")
  .map((line: string) => JSON.parse(line) as { lang: Lang; q?: string; question?: string; gold: string[]; champions?: string[] });
const Q = new Float32Array(fs.readFileSync(vecFile).buffer.slice(0));
const meta = JSON.parse(fs.readFileSync(`${ROOT}/public/models/kev/b3e/doc-vectors.json`, "utf8")) as { languages: Record<string, { offset: number; ids: string[] }> };
const bin = fs.readFileSync(`${ROOT}/public/models/kev/b3e/doc-vectors.bin`);
const half = new Uint16Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const toFloat = (h: number) => {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  return e === 0 ? s * 2 ** -14 * (f / 1024) : s * 2 ** (e - 15) * (1 + f / 1024);
};
const blocks = Object.fromEntries(
  Object.entries(meta.languages).map(([lang, { offset, ids }]) => [lang, { ids, matrix: Float32Array.from(half.subarray(offset, offset + ids.length * 1024), toFloat) }]),
);
const STEP: Record<string, LexicalHit["step"]> = { "rule-name": "rule", "meta-word": "meta", "mech-word": "mech" };

let right = 0, wrong = 0, total = 0, rescued = 0, noisy = 0;
for (const [i, row] of rows.entries()) {
  const q = row.q ?? row.question ?? "";
  if (maskMode === "test-half" && zlib.crc32(row.gold[0] ?? q) % 2 === 0) continue;
  if (maskMode === "no-champion" && row.champions?.length) continue;
  const asked = (questionLanguage(q) ?? row.lang) as Lang;
  const top = ranked(Q.subarray(i * 1024, (i + 1) * 1024), blocks[asked].matrix, blocks[asked].ids);
  const found = current(row.lang, q);
  const step = found.step ? STEP[found.step] : undefined;
  const lexical = step && found.id ? { id: found.id, step } : undefined;
  const bm25 = lexicalSearch(buildRetrievalDocs(loadData(asked), asked, true), q, 100);
  const result = hybridSearch(top, bm25, lexical);
  const pick = result.answer ?? null;
  total += 1;
  right += Number(row.gold.length ? pick !== null && row.gold.includes(pick) : pick === null);
  wrong += Number(pick !== null && !row.gold.includes(pick));
  if (!pick && result.related) {
    if (row.gold.some((g) => result.related!.includes(g))) rescued += 1;
    if (!row.gold.length) noisy += 1;
  }
}
console.log(`맞음 ${right}/${total} · 틀린 자료 ${wrong} · 후보로 살림 ${rescued} · 헛후보 ${noisy}`);
