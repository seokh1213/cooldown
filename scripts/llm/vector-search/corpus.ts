/**
 * 이름 없는 질문의 자료 찾기 — 벡터 검색 실험의 자료와 지금 앱 판(낱말)
 *
 *   dump                         언어마다 찾을 문서(규칙 70 · 게임 원리 9 · 게임 메타 21)를 research/llm-evals/vector-search/corpus-<언어>.json 으로
 *   current <queries.jsonl>      지금 앱이 그 질문에 어느 문서를 보이는지(없으면 null) → current.json
 *
 * 지금 앱 판은 앱의 이름 없는 질문 순서를 따른다(이름 단계는 `lexicalHit`):
 *   룬·주문 이름(findMentionedRules) → 게임 메타 낱말(findGameMeta) → 게임 원리 낱말(findMechanics) → 낱말 검색 + 제목 거르기(hitsToAnswer)
 * 아이템은 이름으로 찾는 영역이라 뺐다.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { ruleName, type RuleNotes } from "../lib/rules";
import { lexicalHit } from "../../../src/lib/advisor/questionDocs";
import { buildRetrievalDocs, buildSearchCorpus, hitsToAnswer, lexicalSearch } from "../../../src/lib/advisor/searchFallback";
import { loadData, ROOT, type Lang } from "../kev-agent/lib";

const OUT = path.join(ROOT, "research/llm-evals/vector-search");
const LANGS: Lang[] = ["ko_KR", "en_US", "zh_CN"];

export interface Doc {
  id: string;
  kind: "rule" | "mechanics" | "meta";
  title: string;
  text: string;
}

export function corpus(lang: Lang): Doc[] {
  // 앱과 같은 목록(문서 벡터를 이것으로 만들었다)
  return buildRetrievalDocs(loadData(lang), lang);
}

const LEXICAL_STEP = { rule: "rule-name", meta: "meta-word", mech: "mech-word" } as const;

/** 지금 앱이 보이는 문서(여러 개면 맨 앞)와 그것을 찾은 단계. 이름 단계는 앱의 `lexicalHit` 을 그대로 부른다. */
export function current(lang: Lang, question: string): { id: string | null; step?: string } {
  const data = loadData(lang);
  const hit = lexicalHit(data, question);
  if (hit) return { id: hit.id, step: LEXICAL_STEP[hit.step] };
  const docs = buildSearchCorpus(data, lang);
  const hits = lexicalSearch(docs, question);
  for (const hit of hits) {
    if (!hitsToAnswer([hit], question)) continue;
    if (hit.doc.kind === "mechanics") return { id: `mech:${data.mechanics.find((s) => s.title === hit.doc.title)?.id}`, step: "search" };
    const rule = [...new Set(data.ruleIndex.values())].find((r: RuleNotes) => ruleName(r, lang) === hit.doc.title);
    return { id: rule ? `rule:${rule.name}` : null, step: "search" };
  }
  return { id: null };
}

const [command, file] = process.argv.slice(2);
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (!isMain) {
  // 다른 스크립트가 불러 쓴다
} else if (command === "dump") {
  for (const lang of LANGS) {
    const docs = corpus(lang);
    fs.writeFileSync(path.join(OUT, `corpus-${lang}.json`), JSON.stringify(docs, null, 1) + "\n");
    console.log(lang, docs.length, "문서");
  }
} else if (command === "current") {
  const rows = fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line: string) => JSON.parse(line) as { lang: Lang; q: string; gold: string[]; type: string });
  const out = rows.map((row) => {
    const found = current(row.lang, row.q);
    return { ...row, current: found.id, step: found.step };
  });
  fs.writeFileSync(path.join(OUT, "current.json"), JSON.stringify(out, null, 1) + "\n");
  // 맞음: 답이 있는 질문은 그 문서를 보였고, 답이 없는 질문은 아무것도 안 보였다
  const right = out.filter((r) => (r.gold.length ? r.current !== null && r.gold.includes(r.current) : r.current === null)).length;
  console.log(`지금 앱: ${right}/${out.length}`);
} else {
  console.log("사용: corpus.ts dump | current <queries.jsonl>");
}
