/**
 * 검색 LoRA 를 앱 흐름에 넣었을 때 — 어느 질문이 벡터 검색으로 가고(`searchable`), 무엇을 보이나.
 *
 * AdvisorPanel 의 조건을 그대로 쓴다: 챔피언 이름 없음(오타 후보도 없음) · 아이템 이름 없음 · 도우미 자신 아님 ·
 * 챔피언 가격 단계 아님. (한 질문씩이라 이어 묻는 상성 대화는 없다.) 질문 벡터는 embed_questions.py 가 앱과 같은 그래프로 만든다.
 *
 *   npx tsx scripts/llm/vector-search/app_flow.ts <route-large 질문.jsonl>
 *     기존 374문항(갈래 라벨) — 챔피언 질문이 벡터 검색으로 새지 않는지. 채점은 eval_hybrid.ts
 */
import * as fs from "node:fs";
import { detectChampions, asksAboutHelper, nicknames } from "../../../src/lib/advisor/intent";
import { suggestChampions } from "../../../src/lib/advisor/answer";
import { buildItemCard } from "../../../src/lib/advisor/context";
import { asksPriceTiers, findGameMeta } from "../../../src/lib/advisor/gameMeta";
import { findMentionedRules } from "../lib/rules";
import { loadData, type Lang } from "../kev-agent/lib";

const [input] = process.argv.slice(2);
const rows = fs
  .readFileSync(input, "utf8")
  .trim()
  .split("\n")
  .map((line: string) => JSON.parse(line) as { lang: Lang; q?: string; question?: string; gold?: string[]; kind?: string; champions?: string[] });
function searchable(lang: Lang, question: string): boolean {
  const data = loadData(lang);
  if (detectChampions(data, question).length) return false;
  const gameWord = (token: string) => Boolean(findGameMeta(token) || findMentionedRules(data.ruleIndex, token).length);
  if (suggestChampions(question, data.cards, nicknames(data.cards), new Set(), 1, gameWord)?.candidates.length) return false;
  if (buildItemCard(data, question, undefined)) return false;
  return !asksAboutHelper(question) && !asksPriceTiers(question);
}

const stat = { searchable: 0, byKind: {} as Record<string, number>, leaked: [] as string[] };
for (const row of rows) {
  const question = row.q ?? row.question ?? "";
  if (!searchable(row.lang, question)) continue;
  stat.searchable += 1;
  stat.byKind[row.kind ?? "?"] = (stat.byKind[row.kind ?? "?"] ?? 0) + 1;
  // 챔피언 질문(갈래 other 가 아닌 것)이 벡터 검색으로 가면 가로챈 것이다
  if (row.kind !== "other") stat.leaked.push(`${row.kind} · ${question}`);
}
console.log(`벡터 검색으로 가는 질문 ${stat.searchable}/${rows.length}`, stat.byKind);
console.log(`챔피언 질문이 샌 것 ${stat.leaked.length}건`);
for (const line of stat.leaked) console.log("  ", line);
