/**
 * 검색 LoRA 를 앱 흐름에 넣었을 때 — 어느 질문이 벡터 검색으로 가고(`searchable`), 무엇을 보이나.
 *
 * AdvisorPanel 의 조건을 그대로 쓴다: 챔피언 이름 없음(오타 후보도 없음) · 아이템 이름 없음 · 도우미 자신 아님 ·
 * 챔피언 가격 단계 아님. (한 질문씩이라 이어 묻는 상성 대화는 없다.) 질문 벡터는 embed_questions.py 가 앱과 같은 그래프로 만든다.
 *
 *   npx tsx scripts/llm/vector-search/app_flow.ts <질문.jsonl> <질문 벡터 .npz 를 풀어 둔 .f32> [route-large]
 *     route-large: 기존 374문항(갈래 라벨) — 챔피언 질문이 벡터 검색으로 새지 않는지
 *     그 밖: gold 가 있는 질문 — 벡터 판과 낱말 판(지금 앱)을 견준다
 */
import * as fs from "node:fs";
import { detectChampions, asksAboutHelper, nicknames } from "../../../src/lib/advisor/intent";
import { suggestChampions } from "../../../src/lib/advisor/answer";
import { buildItemCard } from "../../../src/lib/advisor/context";
import { asksPriceTiers } from "../../../src/lib/advisor/gameMeta";
import { ranked } from "../../../src/hooks/useAdvisor";
import { pickSearchDoc } from "../../../src/lib/advisor/searchFallback";
import { current } from "./corpus";
import { loadData, ROOT, type Lang } from "../kev-agent/lib";

const [input, vecFile, mode] = process.argv.slice(2);
const rows = fs
  .readFileSync(input, "utf8")
  .trim()
  .split("\n")
  .map((line: string) => JSON.parse(line) as { lang: Lang; q?: string; question?: string; gold?: string[]; kind?: string; champions?: string[] });
const q = new Float32Array(fs.readFileSync(vecFile).buffer.slice(0));
const meta = JSON.parse(fs.readFileSync(`${ROOT}/public/models/kev/b3e/doc-vectors.json`, "utf8")) as {
  languages: Record<string, { offset: number; ids: string[] }>;
};
const bin = fs.readFileSync(`${ROOT}/public/models/kev/b3e/doc-vectors.bin`);
const half = new Uint16Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const toFloat = (h: number) => {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024);
};
const blocks = Object.fromEntries(
  Object.entries(meta.languages).map(([lang, { offset, ids }]) => [lang, { ids, matrix: Float32Array.from(half.subarray(offset, offset + ids.length * 1024), toFloat) }]),
);
const THRESHOLD = 0.39;

function searchable(lang: Lang, question: string): boolean {
  const data = loadData(lang);
  if (detectChampions(data, question).length) return false;
  if (suggestChampions(question, data.cards, nicknames(data.cards), new Set(), 1)?.candidates.length) return false;
  if (buildItemCard(data, question, undefined)) return false;
  return !asksAboutHelper(question) && !asksPriceTiers(question);
}

let n = 0;
const stat = { searchable: 0, byKind: {} as Record<string, number>, leaked: [] as string[] };
const cmp = { vec: { right: 0, wrong: 0 }, old: { right: 0, wrong: 0 }, total: 0, changed: [] as string[] };
for (const [i, row] of rows.entries()) {
  const question = row.q ?? row.question ?? "";
  const vec = q.subarray(i * 1024, (i + 1) * 1024);
  const go = searchable(row.lang, question);
  if (mode === "route-large") {
    if (!go) continue;
    stat.searchable += 1;
    stat.byKind[row.kind ?? "?"] = (stat.byKind[row.kind ?? "?"] ?? 0) + 1;
    // 챔피언 질문(갈래 other 가 아닌 것)이 벡터 검색으로 가면 가로챈 것이다
    if (row.kind !== "other") stat.leaked.push(`${row.kind} · ${question}`);
    continue;
  }
  if (!go) continue;
  n += 1;
  const top = ranked(vec, blocks[row.lang].matrix, blocks[row.lang].ids);
  const best = top[0];
  const found = current(row.lang, question);
  const old = found.id;
  // 앱과 같은 판단: 룬·주문 이름·은어로 걸린 규칙이 벡터 상위 5건에도 있으면 그것, 아니면 벡터 1위(문턱)
  const step = { "rule-name": "rule", "meta-word": "meta", "mech-word": "mech" }[found.step ?? ""] as "rule" | "meta" | "mech" | undefined;
  const pick = pickSearchDoc(top, step && found.id ? { id: found.id, step } : undefined, THRESHOLD) ?? null;
  const gold = row.gold ?? [];
  const judge = (p: string | null) => ({ right: gold.length ? p !== null && gold.includes(p) : p === null, wrong: p !== null && !gold.includes(p) });
  const a = judge(pick), b = judge(old);
  cmp.total += 1;
  cmp.vec.right += Number(a.right); cmp.vec.wrong += Number(a.wrong);
  cmp.old.right += Number(b.right); cmp.old.wrong += Number(b.wrong);
  if (a.right !== b.right || a.wrong !== b.wrong) cmp.changed.push(`${a.right ? "○" : a.wrong ? "✗" : "·"} 벡터 ${pick ?? "없음"}(${best.score.toFixed(2)}) | ${b.right ? "○" : b.wrong ? "✗" : "·"} 낱말 ${old ?? "없음"} | 정답 ${gold.join("+") || "없음"} | ${question}`);
}
if (mode === "route-large") {
  console.log(`벡터 검색으로 가는 질문 ${stat.searchable}/${rows.length}`, stat.byKind);
  console.log(`챔피언 질문이 샌 것 ${stat.leaked.length}건`);
  for (const line of stat.leaked) console.log("  ", line);
} else {
  console.log(`벡터 검색으로 가는 질문 ${n}/${rows.length}`);
  console.log(`  벡터: 맞음 ${cmp.vec.right} · 틀린 자료 ${cmp.vec.wrong}  |  낱말(지금 앱): 맞음 ${cmp.old.right} · 틀린 자료 ${cmp.old.wrong}`);
  for (const line of cmp.changed) console.log("  ", line);
}
