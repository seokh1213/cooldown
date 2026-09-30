/**
 * A — 대화 270턴(`research/llm-evals/kev-agent/a-set.jsonl`, 98개 대화). 턴마다 앱이 무엇을 답했는가(갈래·두 챔피언·시점·주제)를
 * 정답과 견준다. 흐름은 앱 코드(`planAnswer`)를 그대로 부르고, 앞 턴의 답을 대화에 쌓아 다음 턴에 넘긴다.
 *
 * 예전 판(2026-09-27 삭제)은 AdvisorPanel 의 판단을 옮겨 적은 복사본이라 앱과 어긋났다. 이 판의 점수가 앞으로의 기준이다.
 * 검색 벡터는 Node 에서 돌리지 못해 끈 채로 잰다.
 *
 *   HIDDEN_JUDGE=http://127.0.0.1:8014 npx tsx scripts/llm/kev-agent/eval-a.ts   (판정기: hidden_judge_serve.py)
 *   npx tsx scripts/llm/kev-agent/eval-a.ts --no-model                              (모델 없이 써보기)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { translations } from "../../../src/i18n/translations";
import type { AdvisorAnswer } from "../../../src/lib/advisor/answer";
import { buildCompareAnswer } from "../../../src/lib/advisor/answer";
import { matchupNotes } from "../../../src/lib/advisor/playbookNotes";
import { planAnswer, type AnswerPlan, type PlanContext, type PlanDeps, type PlanTurn } from "../../../src/lib/advisor/plan";
import { ROOT, appJudge, loadData, readJsonl, saveJudgeCache, type Lang } from "./lib";

interface Gold { kind: string; champions: string[]; mine?: string; enemy?: string; topic?: string }
interface Turn { type: "T1" | "F" | "R" | "P"; text: string; gold: Gold }
interface Dialog { id: string; lang: Lang; turns: Turn[] }
interface Resolved { kind: string; champs: string[]; mine?: string; enemy?: string; topic?: string }

const model = !process.argv.includes("--no-model");
const deps: PlanDeps = { judge: appJudge, search: () => Promise.reject(new Error("Node 에는 검색 벡터가 없다")) };

/** 앱이 대화에 남기는 답. 상성은 `useAskAdvisor` matchupAnswer 의 카드 부분(미리 쓴 답은 뺀다 — 다음 턴 판단에 쓰지 않는다). */
function answerOf(plan: AnswerPlan, lang: Lang, question: string): AdvisorAnswer | undefined {
  if (plan.type === "card") return plan.answer;
  if (plan.type === "code") return typeof plan.answer === "string" ? undefined : plan.answer;
  if (plan.type !== "matchup") return undefined;
  const notes = matchupNotes(loadData(lang), plan.mine, plan.enemy, lang);
  if (notes.plan && plan.focus) notes.plan.focus = plan.focus;
  return buildCompareAnswer([plan.mine, plan.enemy], question, undefined, { matchup: true, notes, lang });
}

function resolved(plan: AnswerPlan): Resolved {
  if (plan.type === "matchup") return { kind: "matchup", champs: [plan.mine.id, plan.enemy.id], mine: plan.mine.id, enemy: plan.enemy.id, topic: plan.focus };
  if (plan.type !== "card") return { kind: "other", champs: [] };
  const a = plan.answer;
  if (a.kind === "champion") return { kind: a.view === "skills" ? "skills" : a.focus ? "spellStat" : "guide", champs: [a.card.id] };
  if (a.kind === "spell") return { kind: "spellStat", champs: [a.championId] };
  if (a.kind === "compare") return { kind: "compare", champs: a.cards.map((c) => c.id) };
  if (a.kind === "suggestion") return { kind: "suggestion", champs: [] };
  return { kind: "other", champs: [] };
}

/** 채점은 예전 판과 같다. 상성은 쌍·시점·(정답에 있으면) 주제, "그 밖" 은 곁들인 이름을 따지지 않는다. */
function grade(gold: Gold, r: Resolved) {
  if (gold.kind === "matchup") {
    const pair = r.kind === "matchup" && r.mine === gold.mine && r.enemy === gold.enemy;
    return pair && (!gold.topic || (r.topic ?? "general") === gold.topic);
  }
  return r.kind === gold.kind && (gold.kind === "other" || [...r.champs].sort().join() === [...gold.champions].sort().join());
}

async function ask(question: string, ctx: PlanContext): Promise<{ plan: AnswerPlan; question: string }> {
  const plan = await planAnswer(question, ctx, deps);
  // 앱처럼 오타 하나를 고친 질문은 다시 묻는다
  return plan.type === "retry" ? { plan: await planAnswer(plan.question, { ...ctx, notice: plan.notice }, deps), question: plan.question } : { plan, question };
}

async function main() {
  const dialogs = readJsonl<Dialog>(path.join(ROOT, "research/llm-evals/kev-agent/a-set.jsonl"));
  const rows: unknown[] = [];
  const table: Record<string, [number, number]> = {};
  const add = (key: string, ok: boolean) => ((table[key] ??= [0, 0])[0] += ok ? 1 : 0, table[key][1] += 1);
  for (const d of dialogs) {
    const turns: PlanTurn[] = [];
    for (const [i, t] of d.turns.entries()) {
      const ctx: PlanContext = { data: loadData(d.lang), lang: d.lang, copy: translations[d.lang].advisor, turns, championIds: [], consented: model, canUseModel: model, retrieval: false };
      const { plan, question } = await ask(t.text, ctx);
      const got = resolved(plan);
      const ok = grade(t.gold, got);
      turns.push({ role: "user" }, { role: "assistant", answer: answerOf(plan, d.lang, question) });
      for (const key of ["all", t.type, `${t.type}:${d.lang}`]) add(key, ok);
      rows.push({ id: d.id, lang: d.lang, turn: i, type: t.type, text: t.text, gold: t.gold, got, ok });
    }
    process.stderr.write(".");
  }
  saveJudgeCache();
  // --out 결과.json 을 주면 거기에 쓴다(다른 판정기로 잴 때 기준 결과를 덮지 않게)
  const outArg = process.argv.indexOf("--out");
  const out = outArg >= 0 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, `research/llm-evals/kev-agent/a-results-app${model ? "" : "-nomodel"}.json`);
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  console.log(`\n${model ? "판정기" : "모델 없음"} → ${path.relative(ROOT, out)}`);
  for (const [k, [ok, n]] of Object.entries(table).sort()) console.log(`  ${k}\t${ok}/${n} (${((ok / n) * 10).toFixed(1)})`);
}

void main();
