/**
 * B3 — 질문 갈래 9칸(route-v3)과 대화 흐름(act) 판정 측정.
 *
 *   route3  route-large 374 — "그 밖" 75문항을 사람이 다섯 갈래로 다시 붙인 것(`b3/large_other_labels.py`).
 *           앱 보정(상성은 이름 둘, 문형·조사) 뒤에 갈래와, 상성이면 내 챔피언까지 맞아야 한 문항
 *   act     손으로 쓴 대화 흐름 60문항(`act-test.jsonl`, 시험 챔피언만)
 *
 * 판정기: app(public·research 의 헤드 이름) 또는 kev 서버.
 *   npx tsx scripts/llm/kev-agent/eval-b3.ts --judges app:route-v3:act-v1,b3=http://127.0.0.1:8013
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { detectChampions } from "../../../src/lib/advisor/intent";
import { actFromProbs, actFromWords, actQuestion, actState, planTurn, sideOfNewName } from "../../../src/lib/advisor/conversation";
import { topicFromWords } from "../../../src/lib/advisor/topicJudge";
import { buildItemCard, buildMechanicsAnswer } from "../../../src/lib/advisor/context";
import { findMentionedRules } from "../lib/rules";
import { ROOT, appJudge, kevJudge, loadData, readJsonl, saveJudgeCache, type Judge, type Lang } from "./lib";
import { KIND9, route } from "./eval-b";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface Case { lang: Lang; question: string; kind3: string; mine?: string }
interface ActCase { lang: Lang; mine: string; enemy: string; text: string; act: string; named: string | null }

async function main() {
  const specs = (arg("judges") ?? "app:route-v3:act-v1").split(",");
  const cases = (JSON.parse(fs.readFileSync(path.join(ROOT, "research/llm-evals/kev-agent/route-large3.json"), "utf8")) as { cases: Case[] }).cases;
  const acts = readJsonl<ActCase>(path.join(ROOT, "research/llm-evals/kev-agent/act-test.jsonl"));
  const rows: unknown[] = [];
  for (const spec of specs) {
    let name: string, judge: Judge, routeHead = "route-v2", actHead = "act-v1", subHead = "sub-v1", nine = false;
    if (spec.startsWith("app")) {
      [name, routeHead, actHead, subHead] = spec.split(":");
      subHead ??= "sub-v1";
      judge = appJudge;
    } else {
      // kev 서버: "이름=url" 이면 아홉 갈래를 한 번에 묻는다(B3 가 배운 꼴)
      const [n, url] = spec.split("=");
      name = n;
      judge = kevJudge(url);
      subHead = "none";
      nine = true;
    }
    const score: Record<string, [number, number]> = {};
    const add = (key: string, ok: boolean) => {
      const c = (score[key] ??= [0, 0]);
      c[0] += ok ? 1 : 0;
      c[1] += 1;
    };
    for (const c of cases) {
      const r = await route(loadData(c.lang), c.question, judge, routeHead, subHead === "none" ? undefined : subHead, nine ? KIND9 : undefined);
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
      const [p] = await judge(actHead, actState(m, e, a.text, other), [actQuestion(m, e)]);
      const got = actFromProbs(p);
      add("act 전체", got === a.act);
      // 흐름: 규칙(아이템·게임 규칙) + sub 판정 + 문형 + act 를 거쳐 어느 쌍으로 답하는가(앱과 같은 planTurn)
      const named = detectChampions(data, a.text);
      const worded = topicFromWords(a.text);
      const r = await route(data, a.text, judge, routeHead, subHead === "none" ? undefined : subHead, nine ? KIND9 : undefined);
      const hard =
        named.length === 0 &&
        (findMentionedRules(data.ruleIndex, a.text).length > 0 || !!buildItemCard(data, a.text, undefined) || !!buildMechanicsAnswer(data, a.text));
      const soft = !worded && (r.kind === "game" || r.kind === "chat");
      const side = named.length === 1 ? sideOfNewName(a.text, [named[0].name, ...(data.aliases.get(named[0].id) ?? [])]) : undefined;
      const st = { mine: data.cardById.get(a.mine)!, enemy: data.cardById.get(a.enemy)! };
      const byWords = actFromWords(a.text);
      for (const [label, useAct] of [["흐름(규칙+sub+문형+act)", true], ["흐름(문형 규칙만, 모델 없음)", false]] as const) {
        const act = byWords ?? (useAct ? got : undefined);
        // TRUST_NEW: 판정기의 new 를 그대로 믿는다(주제 낱말이 있으면 믿지 않는다)
        const trustNew = !!process.env.TRUST_NEW && useAct && act === "new" && !worded;
        const entity = named.length === 0 && (hard || byWords === "new" || trustNew || (!process.env.NO_SOFT && useAct && soft && act === "new"));
        const plan = planTurn(st, named, entity, act, side, useAct ? r.kind : undefined);
        const want =
          a.act === "new" ? "pass"
          : a.act === "flip" ? `${a.enemy}>${a.mine}`
          : a.act === "enemy" ? `${a.mine}>${a.named}`
          : a.act === "mine" ? `${a.named}>${a.enemy}`
          : `${a.mine}>${a.enemy}`;
        const have = plan.kind === "pass" ? "pass" : `${plan.mine.id}>${plan.enemy.id}`;
        add(label, have === want);
        if (useAct) rows.push({ set: "flow", judge: name, ...a, have, want, ok: have === want });
      }
      add(`act:${a.act}`, got === a.act);
      add(`act:${a.lang}`, got === a.act);
      rows.push({ set: "act", judge: name, ...a, got, ok: got === a.act });
    }
    console.log(`== ${name}`);
    for (const [k, [ok, n]] of Object.entries(score)) console.log(`  ${k}\t${ok}/${n} (${((ok / n) * 10).toFixed(1)})`);
  }
  fs.writeFileSync(arg("out") ?? path.join(ROOT, "research/llm-evals/kev-agent/b3-results.json"), JSON.stringify(rows, null, 1));
}

void main().then(() => saveJudgeCache());
