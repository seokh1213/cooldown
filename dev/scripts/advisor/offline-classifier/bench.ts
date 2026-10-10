/**
 * 오프라인 판정기(`src/features/advisor/model/offlineJudge.ts`)만의 정확도·속도 — 앱 규칙을 거치지 않은 분류기 자체의 힘
 *
 *   kind    route-large3 374(갈래 9칸, 앱 보정 없이 argmax)
 *   act     act-test 60(여섯 칸) · lookup-test 39(일곱 칸, lookup 포함)
 *   topic   손으로 쓴 주제 시험(`dev/scripts/advisor/lib/topicCases.ts`) — 챔피언 이름은 학습에서 뺀 것
 *
 * 앱을 거친 점수(route3 · 흐름 · 대화 270턴)는 `JUDGE=offline npx tsx dev/scripts/advisor/kev-agent/eval-{a,b3,lookup}.ts`.
 *
 *   npx tsx dev/scripts/advisor/offline-classifier/bench.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { detectChampions } from "../../../../src/features/advisor/understanding/intent";
import { ACT_LABELS, actQuestion, actState } from "../../../../src/features/advisor/conversation/conversation";
import { JUDGE_KIND_INSTRUCTIONS, JUDGE_KIND9_CRITERIA, judgeRouteState } from "../../../../src/features/advisor/application/routeAsk";
import { TOPIC_LABELS, topicQuestions } from "../../../../src/features/advisor/model/topicJudge";
import { answerOffline, readOfflineModel, type OfflineJudgeMeta } from "../../../../src/features/advisor/model/offlineJudge";
import { TOPIC_TEST } from "../lib/topicCases";
import { ROOT, loadData, readJsonl, type Lang } from "../kev-agent/lib";

interface RouteCase { lang: Lang; question: string; kind3: string; mine?: string }
interface ActCase { lang: Lang; mine: string; enemy: string; text: string; act: string; named: string | null }

const KIND9 = Object.keys(JUDGE_KIND9_CRITERIA);
const argmax = (p: number[]) => p.indexOf(Math.max(...p));

function confusion(rows: Array<[string, string]>): string {
  const wrong = new Map<string, number>();
  for (const [gold, got] of rows) if (gold !== got) wrong.set(`${gold}→${got}`, (wrong.get(`${gold}→${got}`) ?? 0) + 1);
  return [...wrong.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
}

function main() {
  // --model 경로/judge 를 주면 그 파일(.json/.bin)을 잰다(버킷 수 등 다른 판을 견줄 때). 기본은 public 의 것
  const modelArg = process.argv.indexOf("--model");
  const prefix = modelArg >= 0 ? path.resolve(process.argv[modelArg + 1]) : path.join(ROOT, "public/models/offline/judge");
  const t0 = performance.now();
  const meta = JSON.parse(fs.readFileSync(`${prefix}.json`, "utf8")) as OfflineJudgeMeta;
  const bin = fs.readFileSync(`${prefix}.bin`);
  const model = readOfflineModel(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer);
  console.log(`${prefix}: 읽기 ${(performance.now() - t0).toFixed(1)}ms, json ${fs.statSync(`${prefix}.json`).size}B bin ${bin.byteLength}B`);
  for (const [task, t] of Object.entries(meta.tasks)) console.log(`  ${task}: ${t.labels.length}칸, 개발 ${(t as unknown as { dev: number }).dev}`);

  let calls = 0;
  let spent = 0;
  const ask = (state: string, question: ReturnType<typeof actQuestion>) => {
    const s = performance.now();
    const [p] = answerOffline(model, state, [question]);
    spent += performance.now() - s;
    calls += 1;
    return p;
  };

  // kind
  const route = (JSON.parse(fs.readFileSync(path.join(ROOT, "dev/research/llm-evals/kev-agent/route-large3.json"), "utf8")) as { cases: RouteCase[] }).cases;
  const kindQ = { instructions: JUDGE_KIND_INSTRUCTIONS, options: Object.entries(JUDGE_KIND9_CRITERIA).map(([name, description]) => ({ name, description })) };
  const kindRows: Array<[string, string]> = [];
  const byLang: Record<string, [number, number]> = {};
  for (const c of route) {
    const names = detectChampions(loadData(c.lang), c.question).map((card) => card.name);
    let got = KIND9[argmax(ask(judgeRouteState(c.question, names), kindQ))];
    // 앱과 같은 제약 하나: 상성은 이름이 둘이어야 한다
    if (got === "matchup" && names.length < 2) got = "guide";
    kindRows.push([c.kind3, got]);
    const l = (byLang[c.lang] ??= [0, 0]);
    l[0] += got === c.kind3 ? 1 : 0;
    l[1] += 1;
  }
  const ok = kindRows.filter(([a, b]) => a === b).length;
  console.log(`\nkind route3: ${ok}/${kindRows.length}  ${Object.entries(byLang).map(([l, [a, n]]) => `${l} ${a}/${n}`).join("  ")}`);
  console.log(`  틀린 짝: ${confusion(kindRows)}`);

  // act 6
  const acts = readJsonl<ActCase>(path.join(ROOT, "dev/research/llm-evals/kev-agent/act-test.jsonl"));
  const actRows: Array<[string, string]> = [];
  for (const a of acts) {
    const data = loadData(a.lang);
    const m = data.cardById.get(a.mine)!.name;
    const e = data.cardById.get(a.enemy)!.name;
    const other = detectChampions(data, a.text)[0]?.name;
    actRows.push([a.act, ACT_LABELS[argmax(ask(actState(m, e, a.text, other), actQuestion(m, e)))]]);
  }
  console.log(`\nact 60(여섯 칸): ${actRows.filter(([a, b]) => a === b).length}/${actRows.length}`);
  console.log(`  틀린 짝: ${confusion(actRows)}`);

  // act 7 (lookup)
  const lookups = readJsonl<ActCase>(path.join(ROOT, "dev/research/llm-evals/kev-agent/lookup-test.jsonl"));
  const lookRows: Array<[string, string]> = [];
  for (const a of lookups) {
    const data = loadData(a.lang);
    const m = data.cardById.get(a.mine)!.name;
    const e = data.cardById.get(a.enemy)!.name;
    const other = detectChampions(data, a.text)[0]?.name;
    const q = actQuestion(m, e);
    const q7 = { ...q, options: [...q.options, { name: "lookup", description: `Asks for a number about ${m}'s or ${e}'s ability: a cooldown, mana cost, ratio or range` }] };
    lookRows.push([a.act, [...ACT_LABELS, "lookup"][argmax(ask(actState(m, e, a.text, other), q7))]]);
  }
  console.log(`\nact7 lookup 39: ${lookRows.filter(([a, b]) => a === b).length}/${lookRows.length}`);
  console.log(`  틀린 짝: ${confusion(lookRows)}`);

  // topic
  const topicRows: Array<[string, string]> = [];
  const topicLang: Record<string, [number, number]> = {};
  for (const c of TOPIC_TEST) {
    const data = loadData(c.lang);
    const names = c.champions.map((id) => data.cardById.get(id)?.name ?? id);
    const got = TOPIC_LABELS[argmax(ask(judgeRouteState(c.question, names), topicQuestions(names.length)[0]))];
    topicRows.push([c.topic, got]);
    const l = (topicLang[c.lang] ??= [0, 0]);
    l[0] += got === c.topic ? 1 : 0;
    l[1] += 1;
  }
  console.log(`\ntopic ${topicRows.length}: ${topicRows.filter(([a, b]) => a === b).length}/${topicRows.length}  ${Object.entries(topicLang).map(([l, [a, n]]) => `${l} ${a}/${n}`).join("  ")}`);
  console.log(`  틀린 짝: ${confusion(topicRows)}`);

  console.log(`\n판정 ${calls}회, 한 번에 ${(spent / calls).toFixed(3)}ms (특징 뽑기 + 내적)`);
}

main();
