/**
 * 하이브리드 검색 실험용 — 질문마다 문서 100건 전체의 낱말 점수(BM25, 본문에 은어를 붙여서)와 낱말 단계 적중(룬·주문 이름·은어 →
 * 게임 메타 → 게임 원리, 지금 앱 순서)을 뽑는다. 벡터 점수와 합치는 것은 hybrid_score.py.
 *
 *   npx tsx dev/scripts/advisor/vector-search/lexical_scores.ts <질문.jsonl> <출력.json>
 */
import * as fs from "node:fs";
import { aliasesOf } from "../../../../src/domain/knowledge/notes/searchAliases";
import { lexicalSearch, type SearchDoc } from "../../../../src/features/advisor/application/searchFallback";
import { questionLanguage } from "../../../../src/features/advisor/understanding/questionLanguage";
import { corpus, current } from "./corpus";
import { detectChampions } from "../../../../src/features/advisor/understanding/champions/intent";
import { buildItemCard, buildMechanicsAnswer } from "../../../../src/features/advisor/retrieval/context";
import { loadData, type Lang } from "../kev-agent/lib";

const [input, output] = process.argv.slice(2);
const rows = fs
  .readFileSync(input, "utf8")
  .trim()
  .split("\n")
  .map((line: string) => JSON.parse(line) as { lang: Lang; q?: string; question?: string });
const searchDocs = new Map<Lang, Array<SearchDoc & { id: string }>>();
const docsOf = (lang: Lang) => {
  let docs = searchDocs.get(lang);
  if (!docs) {
    docs = corpus(lang).map((doc) => ({ id: doc.id, kind: doc.kind === "rule" ? "rule" : "mechanics", title: doc.title, text: `${doc.text}\n${aliasesOf(doc.id).join(" ")}` }));
    searchDocs.set(lang, docs);
  }
  return docs;
};
const out = rows.map((row) => {
  const q = row.q ?? row.question ?? "";
  const lang = (questionLanguage(q) ?? row.lang) as Lang;
  const bm25: Record<string, number> = {};
  for (const hit of lexicalSearch(docsOf(lang), q, 100)) bm25[(hit.doc as SearchDoc & { id: string }).id] = hit.score;
  const found = current(row.lang, q);
  const data = loadData(row.lang);
  // 대화 흐름 시험용: 챔피언 이름 수, 아이템·게임 원리 이름(앱이 새 질문으로 치는 것)
  const entity = Boolean(buildItemCard(data, q, undefined)) || Boolean(buildMechanicsAnswer(data, q));
  return { lang, bm25, lexical: found.id, step: found.step ?? null, champions: detectChampions(data, q).length, entity };
});
fs.writeFileSync(output, JSON.stringify(out));
console.log("저장", output, out.length);
