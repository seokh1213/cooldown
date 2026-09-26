/**
 * 재순위 헤드의 후보 — 질문마다 문서 K 건을 코드가 뽑는다(모델 없음, 브라우저에서 순간).
 *
 * 순서: 지금 앱이 보일 문서 → 룬·주문 이름·은어로 걸린 규칙 → 게임 메타 낱말 → 게임 원리 낱말 → BM25(문서 100건,
 * 본문에 은어를 붙여서). 겹치면 한 번만. 재순위 헤드는 이 K 건 + "해당 없음" 중에서 고른다.
 *
 *   npx tsx scripts/llm/vector-search/candidates.ts <질문.jsonl> <출력.json> [K=8]
 */
import * as fs from "node:fs";
import { findMentionedRules } from "../lib/rules";
import { findMechanics } from "../lib/mechanics";
import { aliasesOf } from "../lib/searchAliases";
import { findGameMeta } from "../../../src/lib/advisor/gameMeta";
import { lexicalSearch, type SearchDoc } from "../../../src/lib/advisor/searchFallback";
import { loadData, ROOT, type Lang } from "../kev-agent/lib";
import type { Doc } from "./corpus";

const [input, output, kArg] = process.argv.slice(2);
const K = Number(kArg ?? 8);
const corpora = new Map<Lang, Doc[]>();
const corpus = (lang: Lang) => {
  let docs = corpora.get(lang);
  if (!docs) {
    docs = JSON.parse(fs.readFileSync(`${ROOT}/research/llm-evals/vector-search/corpus-${lang}.json`, "utf8")) as Doc[];
    corpora.set(lang, docs);
  }
  return docs;
};

function candidates(lang: Lang, question: string): string[] {
  const data = loadData(lang);
  const out: string[] = [];
  const add = (id: string | undefined) => {
    if (id && !out.includes(id)) out.push(id);
  };
  for (const rule of findMentionedRules(data.ruleIndex, question)) add(`rule:${rule.name}`);
  const fact = findGameMeta(question);
  if (fact) add(`meta:${fact.id}`);
  for (const section of findMechanics(data.mechanics, question)) add(`mech:${section.id}`);
  const docs = corpus(lang);
  // BM25 는 제목·본문 낱말로만 센다. 은어를 본문 끝에 붙여 은어로 물어도 걸리게 한다.
  const search: Array<SearchDoc & { id: string }> = docs.map((doc) => ({
    id: doc.id,
    kind: doc.kind === "rule" ? "rule" : "mechanics",
    title: doc.title,
    text: `${doc.text}\n${aliasesOf(doc.id).join(" ")}`,
  }));
  for (const hit of lexicalSearch(search, question, K)) add((hit.doc as SearchDoc & { id: string }).id);
  return out.slice(0, K);
}

const rows = fs
  .readFileSync(input, "utf8")
  .trim()
  .split("\n")
  .map((line: string) => JSON.parse(line) as { lang: Lang; q: string; gold: string[]; type: string });
const out = rows.map((row) => ({ ...row, cands: candidates(row.lang, row.q) }));
fs.writeFileSync(output, JSON.stringify(out, null, 1) + "\n");
const withGold = out.filter((r) => r.gold.length);
const recall = withGold.filter((r) => r.cands.some((c) => r.gold.includes(c))).length / withGold.length;
const empty = out.filter((r) => !r.cands.length).length;
console.log(`후보 ${K}건 안에 정답: ${(recall * 100).toFixed(1)}% (답 있는 ${withGold.length}문항) · 후보 없음 ${empty}문항 · 평균 후보 ${(out.reduce((s, r) => s + r.cands.length, 0) / out.length).toFixed(1)}`);
