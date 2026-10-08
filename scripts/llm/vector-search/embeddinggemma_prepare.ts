import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { ADVISOR_MODEL } from "../../../src/lib/advisor/config";
import { questionLanguage } from "../../../src/lib/advisor/questionLanguage";
import { lexicalHit, searchesByVector } from "../../../src/lib/advisor/questionDocs";
import { namedMonsters } from "../../../src/lib/advisor/monsterAnswer";
import { buildRetrievalDocs, lexicalSearch, HYBRID, hybridSearch } from "../../../src/lib/advisor/searchFallback";
import { loadData, ROOT, PATCH, type Lang } from "../kev-agent/lib";

const LANGS: Lang[] = ["ko_KR", "en_US", "zh_CN"];
const BANK = path.join(ROOT, "research/llm-evals/vector-search");
const sha = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
interface Query { lang: Lang; q: string; gold: string[]; type: string }

function prepare(output: string, probe?: string) {
  const docs = Object.fromEntries(LANGS.map(lang => [lang, buildRetrievalDocs(loadData(lang), lang)]));
  const search = Object.fromEntries(LANGS.map(lang => [lang, buildRetrievalDocs(loadData(lang), lang, true)]));
  const sources = probe ? [path.resolve(probe)] : ["queries.jsonl", "direct-probe.jsonl", "real-other.jsonl"];
  const rows = sources.flatMap(source => {
    const bank = probe ? "newDocs" : source === "queries.jsonl" ? "main" : source === "direct-probe.jsonl" ? "direct" : "real";
    return fs.readFileSync(path.resolve(BANK, source), "utf8").trim().split("\n").map(line => {
      const row = JSON.parse(line) as Query;
      const lang = (questionLanguage(row.q) ?? row.lang) as Lang;
      const data = loadData(row.lang);
      const lexical = lexicalHit(data, row.q);
      const bm25 = Object.fromEntries(lexicalSearch(search[lang], row.q, 100).map(hit => [hit.doc.id!, hit.score]));
      const eligible = searchesByVector(data, row.q, undefined, false) && !(namedMonsters(row.q).length && lexical?.step === "meta");
      const goldAvailable = !row.gold.length || docs[lang].some(doc => row.gold.includes(doc.id));
      return { ...row, bank, searchLang: lang, lexical, bm25, eligible, goldAvailable };
    });
  });
  const vectorBase = path.join(ROOT, "public", ADVISOR_MODEL.retrieval!.vectors);
  const provenance = {
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    masterRevision: execFileSync("git", ["rev-parse", "master"], { cwd: ROOT, encoding: "utf8" }).trim(),
    patch: PATCH,
    model: ADVISOR_MODEL,
    hashes: Object.fromEntries([
      ...sources.map(source => path.relative(ROOT, path.resolve(BANK, source))),
      `public/${ADVISOR_MODEL.graph}`, `${path.relative(ROOT, vectorBase)}.json`, `${path.relative(ROOT, vectorBase)}.bin`,
      `public/data/${PATCH}/llm/advisor-knowledge.json`,
      "src/lib/advisor/searchFallback.ts", "src/lib/advisor/questionDocs.ts",
    ].map(file => [file, sha(path.join(ROOT, file))])),
  };
  const snapshot = {
    provenance, docs, rows, hybrid: HYBRID,
    protocol: {
      split: "CRC32(first gold id or question) modulo 2, even dev, odd test; multilingual document groups stay together",
      primary: "main heldout testUsable: active document labels and actual retrieval eligibility, no screen or conversation context; legacy 355 also reported",
      calibration: "DevUsable only: maximize correct with wrong answers no higher than deployed baseline; tie: fewer wrong, higher threshold",
      variants: "Gemma same 600 document chars / 512 tokens, and full document / 2048 tokens. Choose between calibrated variants using dev correct, fewer wrong, then short input. Never choose using test.",
      gpuGate: {
        minimumAdditionalCorrect: 1, maximumAdditionalWrong: 0, maximumRecall3Regression: 0,
        maximumDirectCorrectRegression: 0, maximumQueryP90Seconds: 2, maximumPeakRssMiB: 4096,
        maximumCombinedDownloadMb: 1000,
      },
      limits: "Closed corpus; historical direct/real probes have been used before and some real labels are stale. Scores measure document selection, not full answer correctness.",
    },
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(JSON.stringify({ output, queries: rows.length, docs: Object.fromEntries(LANGS.map(l => [l, docs[l].length])), sha256: sha(output) }));
}

function verify(input: string, predictions: string) {
  const snapshot = JSON.parse(fs.readFileSync(input, "utf8"));
  const cases = JSON.parse(fs.readFileSync(predictions, "utf8")) as Array<{ index: number; ranking: Array<{ id: string; score: number }>; fixed: string | null }>;
  for (const item of cases) {
    const row = snapshot.rows[item.index];
    const bm25 = Object.entries(row.bm25 as Record<string, number>).map(([id, score]) => ({ doc: { id, title: "", text: "", kind: "rule" as const }, score }));
    const found = hybridSearch(item.ranking, bm25, row.lexical).answer ?? null;
    if (found !== item.fixed) throw new Error(`App hybrid mismatch at ${item.index}: ${found} != ${item.fixed}`);
  }
  console.log(`App hybrid parity: ${cases.length} cases`);
}

const [command, input, predictions] = process.argv.slice(2);
if (command === "prepare" && input) prepare(input);
else if (command === "prepare-probe" && input && predictions) prepare(predictions, input);
else if (command === "verify" && input && predictions) verify(input, predictions);
else throw new Error("embeddinggemma_prepare.ts prepare <snapshot.json> | verify <snapshot.json> <predictions.json>");
