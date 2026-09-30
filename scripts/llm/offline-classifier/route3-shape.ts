/**
 * route-large3 374 를 앱이 **답한 꼴**로 채점 — 모델 없는 기기(낱말 규칙)와 오프라인 판정기를 같은 잣대로 견준다.
 *
 * `eval-b3.ts` 의 route3 는 판정기가 가른 갈래(`understand().route`)를 보므로 모델 없는 기기에는 점수가 없다.
 * 여기서는 `planAnswer` 의 답 꼴을 갈래로 되돌린다(`eval-a.ts` resolved 와 같은 규칙): 상성(내 챔피언까지)·공략·
 * 스킬·수치는 그 갈래, 나머지(아이템·룬·소환사 주문·게임 규칙·잡담)는 "그 밖" 하나로 친다.
 *
 *   npx tsx scripts/llm/offline-classifier/route3-shape.ts        (오프라인 판정기 vs 모델 없음)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { translations } from "../../../src/i18n/translations";
import { planAnswer, type AnswerPlan, type PlanContext, type PlanDeps } from "../../../src/lib/advisor/plan";
import { ROOT, loadData, offlineFileJudge, type Lang } from "../kev-agent/lib";

interface Case { lang: Lang; question: string; kind3: string; mine?: string }

const CHAMPION_KINDS = ["matchup", "guide", "skills", "spellStat"];

function shapeOf(plan: AnswerPlan): { kind: string; mine?: string } {
  if (plan.type === "matchup") return { kind: "matchup", mine: plan.mine.id };
  if (plan.type !== "card") return { kind: "other" };
  const a = plan.answer;
  if (a.kind === "champion") return { kind: a.view === "skills" ? "skills" : a.focus ? "spellStat" : "guide" };
  if (a.kind === "spell") return { kind: "spellStat" };
  if (a.kind === "compare") return { kind: a.matchup ? "matchup" : "spellStat" };
  return { kind: "other" };
}

async function main() {
  const cases = (JSON.parse(fs.readFileSync(path.join(ROOT, "research/llm-evals/kev-agent/route-large3.json"), "utf8")) as { cases: Case[] }).cases;
  const judge = offlineFileJudge();
  const deps: PlanDeps = { judge, search: () => Promise.reject(new Error("Node 에는 검색 벡터가 없다")) };
  for (const [label, judgeTier] of [["오프라인 판정기", "offline"], ["모델 없음(낱말 규칙)", "none"]] as const) {
    const score: Record<string, [number, number]> = {};
    const add = (key: string, ok: boolean) => {
      const c = (score[key] ??= [0, 0]);
      c[0] += ok ? 1 : 0;
      c[1] += 1;
    };
    for (const c of cases) {
      // 모델 없는 기기 그대로(동의 전, 모델 없음). 판정기 단계만 다르다.
      const ctx: PlanContext = { data: loadData(c.lang), lang: c.lang, copy: translations[c.lang].advisor, turns: [], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: judgeTier };
      let plan = await planAnswer(c.question, ctx, deps);
      if (plan.type === "retry") plan = await planAnswer(plan.question, { ...ctx, notice: plan.notice }, deps);
      const got = shapeOf(plan);
      const want = CHAMPION_KINDS.includes(c.kind3) ? c.kind3 : "other";
      const ok = got.kind === want && (want !== "matchup" || got.mine === c.mine);
      add("전체", ok);
      add(CHAMPION_KINDS.includes(c.kind3) ? "챔피언 4갈래" : "그 밖(하나로)", ok);
      add(c.lang, ok);
    }
    console.log(`== ${label}`);
    for (const [k, [ok, n]] of Object.entries(score)) console.log(`  ${k}\t${ok}/${n}`);
  }
}

void main();
