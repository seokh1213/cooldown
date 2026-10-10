import * as fs from "node:fs";
import * as zlib from "node:zlib";
import { ranked } from "../../../../src/features/advisor/retrieval/docVectors";
import { questionLanguage } from "../../../../src/features/advisor/understanding/questionLanguage";
import { buildRetrievalDocs, hybridSearch, lexicalSearch, type LexicalHit } from "../../../../src/features/advisor/application/searchFallback";
import { current } from "../vector-search/corpus";
import { docAnswer } from "../../../../src/features/advisor/retrieval/questionDocs";
import { loadData, type Lang } from "../kev-agent/lib";
import { readVectors } from "./node_vectors";

interface Query { lang: Lang; q: string; gold: string[] }
const [input, queriesFile, docsDirectory, output] = process.argv.slice(2);
const allQuestions = process.argv.includes("--all");
const read = (file: string) => fs.readFileSync(file);
const rows = fs.readFileSync(input, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Query);
const raw = read(queriesFile);
const queries = new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const vectors = readVectors(docsDirectory);
const dimension = vectors.dim;
if (queries.length !== rows.length * dimension) throw new Error("Query vector count mismatch");
const blocks = vectors.languages;
const steps: Record<string, LexicalHit["step"]> = { "rule-name": "rule", "meta-word": "meta", "mech-word": "mech" };
const results = [];
for (const [i, row] of rows.entries()) {
  if (!allQuestions && zlib.crc32(row.gold[0] ?? row.q) % 2 === 0) continue;
  const lang = (questionLanguage(row.q) ?? row.lang) as Lang;
  const block = blocks[lang];
  const top = ranked(queries.subarray(i * dimension, (i + 1) * dimension), block.matrix, block.ids);
  const found = current(row.lang, row.q);
  const lexical = found.id && found.step ? { id: found.id, step: steps[found.step] } : undefined;
  const bm25 = lexicalSearch(buildRetrievalDocs(loadData(lang), lang, true), row.q, 100);
  const result = hybridSearch(top, bm25, lexical);
  // The browser renders only documents that still exist in the current corpus.
  const answer = result.answer && docAnswer(loadData(row.lang), row.lang, result.answer, row.q) ? result.answer : null;
  const available = new Set(buildRetrievalDocs(loadData(lang), lang).map((doc) => doc.id));
  results.push({ ...row, answer, correct: row.gold.length ? answer !== null && row.gold.includes(answer) : answer === null,
    retiredGold: row.gold.some((id) => !available.has(id)),
    wrongDocument: answer !== null && !row.gold.includes(answer),
    rescued: !answer && !!result.related?.some((id) => row.gold.includes(id)) });
}
const summary = { correct: results.filter((r) => r.correct).length, total: results.length,
  compatibleCorrect: results.filter((r) => !r.retiredGold && r.correct).length,
  compatibleTotal: results.filter((r) => !r.retiredGold).length,
  wrongDocuments: results.filter((r) => r.wrongDocument).length, rescued: results.filter((r) => r.rescued).length,
  scope: allQuestions ? "Actual app hybridSearch; fixed thresholds; all extra held-out questions"
    : "Actual app hybridSearch; fixed thresholds; held-out test-half" };
fs.writeFileSync(output, JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary));
