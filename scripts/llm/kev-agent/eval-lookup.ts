/**
 * 상성 대화 중의 스킬 수치 조회(`lookup-test.jsonl`, 세 언어 40문항) — 판정기와 앱이 각각 무엇이라 하는가.
 *
 *   route   갈래 판정기(9칸)가 이름 없는 새 말을 무엇으로 가르는가(spellStat 이면 수치 조회)
 *   act6    대화 흐름 판정기(여섯 칸 그대로)가 무엇을 고르는가 — lookup 칸이 없으니 followup·new 중 어디로 가는지 본다
 *   act7    같은 판정기에 `lookup` 칸을 하나 더 얹어(제로샷, 학습 없이) 물으면 고르는가
 *   flow    앱(`planAnswer`)이 앞 상성을 대화에 두고 실제로 어떻게 답하는가 — 판정기 있을 때 / 모델 없을 때
 *
 *   HIDDEN_JUDGE=http://127.0.0.1:8014 npx tsx scripts/llm/kev-agent/eval-lookup.ts [--out 결과.json] [--head 헤드이름]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { translations } from "../../../src/i18n/translations";
import type { AdvisorAnswer } from "../../../src/lib/advisor/answer";
import { detectChampions } from "../../../src/lib/advisor/intent";
import { ACT_LABELS, actQuestion, actState } from "../../../src/lib/advisor/conversation";
import { JUDGE_KIND_INSTRUCTIONS, JUDGE_KIND9_CRITERIA, judgeRouteState } from "../../../src/lib/advisor/routeAsk";
import { KEV_HEAD, planAnswer, type AnswerPlan, type PlanContext, type PlanDeps, type PlanTurn } from "../../../src/lib/advisor/plan";
import { ROOT, appJudge, loadData, readJsonl, saveJudgeCache, type Lang } from "./lib";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface Case { lang: Lang; mine: string; enemy: string; text: string; act: "lookup" | "followup" | "new"; named: string | null; want: string }

const HEAD = arg("head") ?? KEV_HEAD;

function contextOf(lang: Lang, model: boolean, turns: PlanTurn[]): PlanContext {
  return { data: loadData(lang), lang, copy: translations[lang].advisor, turns, championIds: [], consented: model, canUseModel: model, retrieval: false };
}

function matchupTurns(lang: Lang, mine: string, enemy: string): PlanTurn[] {
  const data = loadData(lang);
  const answer = { kind: "compare", cards: [data.cardById.get(mine)!, data.cardById.get(enemy)!], rows: [], matchup: true } as AdvisorAnswer;
  return [{ role: "user" }, { role: "assistant", answer }];
}

/** 앱이 답한 꼴. 상성 해설 / 두 챔피언 비교(슬롯) / 다른 챔피언 카드(pass) / 그 밖 */
function shapeOf(plan: AnswerPlan, mine: string, enemy: string): string {
  if (plan.type === "matchup") return "matchup";
  if (plan.type === "card") {
    const a = plan.answer;
    if (a.kind === "compare") {
      const ids = a.cards.map((c) => c.id).sort().join(",");
      const pair = [mine, enemy].sort().join(",");
      return ids === pair ? `compare${a.slot ? `:${a.slot}` : ""}` : `compare(${ids})`;
    }
    if (a.kind === "spell" || a.kind === "champion") return "pass";
    return `card:${a.kind}`;
  }
  if (plan.type === "code") return typeof plan.answer === "string" ? `text "${plan.answer.slice(0, 20)}"` : `code:${plan.answer.kind}`;
  return plan.type;
}

const matches = (want: string, have: string) => (want === "compare" ? have.startsWith("compare") && !have.startsWith("compare(") : want === have);

/** 제로샷 일곱째 칸. 학습한 여섯 칸 문구는 그대로 두고 뒤에 붙인다. */
function actQuestion7(mine: string, enemy: string) {
  const base = actQuestion(mine, enemy);
  return {
    ...base,
    options: [...base.options, { name: "lookup", description: `Asks for a number about ${mine}'s or ${enemy}'s ability: a cooldown, mana cost, ratio or range` }],
  };
}
const LABELS7 = [...ACT_LABELS, "lookup"];
const KIND9 = Object.keys(JUDGE_KIND9_CRITERIA);

async function main() {
  const cases = readJsonl<Case>(path.join(ROOT, "research/llm-evals/kev-agent/lookup-test.jsonl"));
  const deps: PlanDeps = { judge: appJudge, search: () => Promise.reject(new Error("Node 에는 검색 벡터가 없다")) };
  const score: Record<string, [number, number]> = {};
  const add = (key: string, ok: boolean) => {
    const c = (score[key] ??= [0, 0]);
    c[0] += ok ? 1 : 0;
    c[1] += 1;
  };
  const rows: Record<string, unknown>[] = [];
  for (const c of cases) {
    const data = loadData(c.lang);
    const m = data.cardById.get(c.mine)!.name;
    const e = data.cardById.get(c.enemy)!.name;
    const other = detectChampions(data, c.text)[0]?.name;
    const [kindP] = await appJudge(HEAD, judgeRouteState(c.text, other ? [other] : []), [
      { instructions: JUDGE_KIND_INSTRUCTIONS, options: Object.entries(JUDGE_KIND9_CRITERIA).map(([name, description]) => ({ name, description })) },
    ]);
    const kind = KIND9[kindP.indexOf(Math.max(...kindP))];
    const [act6P] = await appJudge(HEAD, actState(m, e, c.text, other), [actQuestion(m, e)]);
    const act6 = ACT_LABELS[act6P.indexOf(Math.max(...act6P))];
    const [act7P] = await appJudge(HEAD, actState(m, e, c.text, other), [actQuestion7(m, e)]);
    const act7 = LABELS7[act7P.indexOf(Math.max(...act7P))];
    const flowJudge = shapeOf(await planAnswer(c.text, contextOf(c.lang, true, matchupTurns(c.lang, c.mine, c.enemy)), deps), c.mine, c.enemy);
    const flowNone = shapeOf(await planAnswer(c.text, contextOf(c.lang, false, matchupTurns(c.lang, c.mine, c.enemy)), deps), c.mine, c.enemy);

    const kindOk = c.act === "lookup" ? kind === "spellStat" : c.act === "new" ? kind === "spellStat" : kind !== "spellStat";
    add("route: 수치 조회를 spellStat 으로(조회·다른 챔피언) / 공략은 아닌 것으로", kindOk);
    add(`route:${c.act}`, kindOk);
    // 여섯 칸에는 lookup 이 없다. 조회는 new 로 가면 "앞 쌍에 붙이지 않음" 이니 맞은 셈, followup 이면 해설로 간다
    const act6Ok = c.act === "lookup" ? act6 === "new" : act6 === c.act;
    add("act6: 조회를 new 로, 공략을 followup 으로", act6Ok);
    add("act7(제로샷 lookup 칸): 세 라벨 그대로", act7 === c.act);
    add(`act7:${c.act}`, act7 === c.act);
    add(`act7:${c.lang}`, act7 === c.act);
    add("흐름(앱, 판정기)", matches(c.want, flowJudge));
    add(`흐름(앱, 판정기):${c.act}`, matches(c.want, flowJudge));
    add("흐름(앱, 모델 없음)", matches(c.want, flowNone));
    add(`흐름(앱, 모델 없음):${c.act}`, matches(c.want, flowNone));
    rows.push({ ...c, kind, kindP: kindP.map((p) => +p.toFixed(2)), act6, act7, act7P: act7P.map((p) => +p.toFixed(2)), flowJudge, flowNone });
  }
  for (const [k, [ok, n]] of Object.entries(score)) console.log(`  ${k}\t${ok}/${n} (${((ok / n) * 10).toFixed(1)})`);
  console.log("\n-- 문항별 (route · act6 · act7 · 흐름 판정기 · 흐름 모델 없음)");
  for (const r of rows) {
    const flag = matches(r.want as string, r.flowJudge as string) ? " " : "✗";
    console.log(`${flag} [${r.lang}] ${r.act}\t${r.text}\t${r.kind}\t${r.act6}\t${r.act7}\t${r.flowJudge}\t${r.flowNone}`);
  }
  fs.writeFileSync(arg("out") ?? path.join(ROOT, "research/llm-evals/kev-agent/lookup-results.json"), JSON.stringify(rows, null, 1));
}

void main().then(() => saveJudgeCache());
