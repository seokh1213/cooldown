/**
 * 시험 세트를 kev 요청 꼴 JSONL 로 내보낸다(파이썬 ONNX 검증용). route-large3(9갈래) · act-test.
 *   npx tsx scripts/llm/kev-agent/b3/export_kev_tests.ts <out-dir>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { detectChampions } from "../../../../src/lib/advisor/intent";
import { JUDGE_KIND_INSTRUCTIONS, JUDGE_MINE_INSTRUCTIONS, judgeRouteState } from "../../../../src/lib/advisor/routeAsk";
import { actCriteria, actState, ACT_INSTRUCTIONS } from "../../../../src/lib/advisor/conversation";
import { ROOT, loadData, readJsonl, type Lang } from "../lib";
import { KIND9 } from "../eval-b";

const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const cases = (JSON.parse(fs.readFileSync(path.join(ROOT, "research/llm-evals/kev-agent/route-large3.json"), "utf8")) as { cases: Array<{ lang: Lang; question: string; kind3: string; mine?: string }> }).cases;
const route = cases.map((c) => {
  const named = detectChampions(loadData(c.lang), c.question);
  const names = named.map((x) => x.name);
  const questions: Record<string, unknown> = { kind: { type: "choice", instructions: JUDGE_KIND_INSTRUCTIONS, criteria: KIND9, label: c.kind3 } };
  const mine = named.find((x) => x.id === c.mine)?.name;
  if (named.length >= 2) questions.mine = { type: "choice", instructions: JUDGE_MINE_INSTRUCTIONS, criteria: Object.fromEntries(names.map((n) => [n, null])), label: c.kind3 === "matchup" ? mine ?? null : null };
  return { lang: c.lang, state: judgeRouteState(c.question, names), questions };
});
fs.writeFileSync(path.join(out, "route3-test.jsonl"), route.map((r) => JSON.stringify(r)).join("\n") + "\n");
const acts = readJsonl<{ lang: Lang; mine: string; enemy: string; text: string; act: string }>(path.join(ROOT, "research/llm-evals/kev-agent/act-test.jsonl")).map((a) => {
  const data = loadData(a.lang);
  const m = data.cardById.get(a.mine)!.name;
  const e = data.cardById.get(a.enemy)!.name;
  const other = detectChampions(data, a.text)[0]?.name;
  return { lang: a.lang, state: actState(m, e, a.text, other), questions: { act: { type: "choice", instructions: ACT_INSTRUCTIONS, criteria: actCriteria(m, e), label: a.act } } };
});
fs.writeFileSync(path.join(out, "act-test.jsonl"), acts.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(route.length, acts.length);
