/**
 * B3 — 질문 갈래 9칸과 대화 흐름(act) 판정 측정. 흐름은 앱 코드(`understand` · `planAnswer`)를 그대로 부른다.
 *
 *   route3  route-large 374 — "그 밖" 75문항을 사람이 다섯 갈래로 다시 붙인 것(`b3/large_other_labels.py`).
 *           갈래는 앱이 읽은 갈래(`understand` — 판정 뒤 영어·중국어 문형 보정), 상성이면 앱이 실제로 답한
 *           상성의 내 챔피언(조사 우선·이름 셋이면 곁들인 이름 빼기)까지 맞아야 한 문항
 *   act     손으로 쓴 대화 흐름 60문항(`act-test.jsonl`, 시험 챔피언만). 판정기만의 흐름 정답률과,
 *           앞 상성을 대화에 두고 앱이 어느 쌍으로 답하는가(판정기 있을 때 / 모델 없을 때)
 *
 * RETRIEVAL_EVAL=1이면 실제 앱 검색과 q4 임베딩을 함께 잰다. 기본값은 검색을 끈 분류 평가다.
 *
 * 판정기: app(앱 판정기 서버 + public 의 헤드) 또는 kev 서버. JUDGE=offline 이면 서버 없이 오프라인 판정기(모델 없는 기기의 판정기)로 잰다.
 *   npx tsx dev/scripts/advisor/kev-agent/eval-b3.ts --judges app,b3=http://127.0.0.1:8013
 *   JUDGE=offline npx tsx dev/scripts/advisor/kev-agent/eval-b3.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { translations } from "../../../../src/shared/i18n/translations";
import type { AdvisorAnswer } from "../../../../src/features/advisor/answers/answer";
import { detectChampions } from "../../../../src/features/advisor/understanding/intent";
import { actFromProbs, actQuestion, actState } from "../../../../src/features/advisor/conversation/conversation";
import { ACT_HEAD, planAnswer, understand, type AnswerPlan, type PlanContext, type PlanDeps, type PlanTurn } from "../../../../src/features/advisor/application/plan";
import { JUDGE_TIER_LABELS, ROOT, appJudge, judgeTierOf, kevJudge, loadData, planFlags, readJsonl, saveJudgeCache, type Judge, type Lang } from "./lib";
import { evaluationSearch } from "./retrieval_eval";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface Case { lang: Lang; question: string; kind3: string; mine?: string }
interface ActCase { lang: Lang; mine: string; enemy: string; text: string; act: string; named: string | null }

/** 판정기 있는 기기(모델 판정기, JUDGE=offline 이면 오프라인 판정기) 또는 판정기 없이 낱말 규칙만(`planFlags`) */
function contextOf(lang: Lang, model: boolean, turns: PlanTurn[] = []): PlanContext {
  return { data: loadData(lang), lang, copy: translations[lang].advisor, turns, championIds: [], ...planFlags(model) };
}

/** 방금 상성을 답한 대화 */
function matchupTurns(lang: Lang, mine: string, enemy: string): PlanTurn[] {
  const data = loadData(lang);
  const answer = { kind: "compare", cards: [data.cardById.get(mine)!, data.cardById.get(enemy)!], rows: [], matchup: true } as AdvisorAnswer;
  return [{ role: "user" }, { role: "assistant", answer }];
}

const pairOf = (plan: AnswerPlan) => (plan.type === "matchup" ? `${plan.mine.id}>${plan.enemy.id}` : "pass");

async function main() {
  const specs = (arg("judges") ?? "app").split(",");
  const cases = (JSON.parse(fs.readFileSync(path.join(ROOT, "dev/research/llm-evals/kev-agent/route-large3.json"), "utf8")) as { cases: Case[] }).cases;
  const acts = readJsonl<ActCase>(path.join(ROOT, "dev/research/llm-evals/kev-agent/act-test.jsonl"));
  const rows: unknown[] = [];
  for (const spec of specs) {
    // kev 서버: "이름=url". 헤드 이름은 무시하고 서버 하나가 모든 질문을 받는다
    const [name, url] = spec === "app" ? ["app", undefined] : spec.split("=");
    const judge: Judge = url ? kevJudge(url) : appJudge;
    const deps: PlanDeps = { judge, search: evaluationSearch(ROOT) };
    const score: Record<string, [number, number]> = {};
    const add = (key: string, ok: boolean) => {
      const c = (score[key] ??= [0, 0]);
      c[0] += ok ? 1 : 0;
      c[1] += 1;
    };
    for (const c of cases) {
      const ctx = contextOf(c.lang, true);
      const intent = await understand(c.question, ctx, loadData(c.lang), deps);
      const plan = await planAnswer(c.question, ctx, deps);
      const r = { kind: intent.route?.kind, mine: plan.type === "matchup" ? plan.mine.id : undefined };
      const ok = r.kind === c.kind3 && (c.kind3 !== "matchup" || r.mine === c.mine);
      add("route3 전체", ok);
      add(`route3:${["matchup", "guide", "skills", "spellStat"].includes(c.kind3) ? "챔피언 4갈래" : "그 밖 5갈래"}`, ok);
      rows.push({ set: "route3", judge: name, ...c, got: r, ok });
    }
    for (const a of acts) {
      const data = loadData(a.lang);
      const m = data.cardById.get(a.mine)!.name;
      const e = data.cardById.get(a.enemy)!.name;
      // 앱과 같게: 새 말에서 찾은 첫 챔피언 이름을 붙인다
      const other = detectChampions(data, a.text)[0]?.name;
      const [p] = await judge(process.env.ACT_HEAD_EVAL ?? ACT_HEAD, actState(m, e, a.text, other), [actQuestion(m, e)]);
      const got = actFromProbs(p);
      add("act 전체", got === a.act);
      const want =
        a.act === "new" || a.act === "lookup" ? "pass"
        : a.act === "flip" ? `${a.enemy}>${a.mine}`
        : a.act === "enemy" ? `${a.mine}>${a.named}`
        : a.act === "mine" ? `${a.named}>${a.enemy}`
        : `${a.mine}>${a.enemy}`;
      for (const model of [true, false]) {
        const label = `흐름(앱, ${JUDGE_TIER_LABELS[judgeTierOf(model)]})`;
        const have = pairOf(await planAnswer(a.text, contextOf(a.lang, model, matchupTurns(a.lang, a.mine, a.enemy)), deps));
        add(label, have === want);
        if (model) rows.push({ set: "flow", judge: name, ...a, have, want, ok: have === want });
      }
      add(`act:${a.act}`, got === a.act);
      add(`act:${a.lang}`, got === a.act);
      rows.push({ set: "act", judge: name, ...a, got, ok: got === a.act });
    }
    console.log(`== ${name}`);
    for (const [k, [ok, n]] of Object.entries(score)) console.log(`  ${k}\t${ok}/${n} (${((ok / n) * 10).toFixed(1)})`);
  }
  // 기본 결과 파일은 판정기 단계마다 다르다(오프라인 판정기로 잰 것이 모델 판정기 기록을 덮지 않게)
  const suffix = judgeTierOf(true) === "offline" ? "-offline" : "";
  fs.writeFileSync(arg("out") ?? path.join(ROOT, `dev/research/llm-evals/kev-agent/b3-results${suffix}.json`), JSON.stringify(rows, null, 1));
}

void main().then(() => saveJudgeCache());
