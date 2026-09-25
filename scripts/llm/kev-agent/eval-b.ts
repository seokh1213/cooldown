/**
 * B — 판정 정확도. 같은 앱 보정(상성은 이름 둘, 영어·중국어 문형, 한국어 조사)을 거친 뒤의 점수를 판정기끼리 견준다.
 *
 *   route  route-large 374문항: 갈래가 맞고, 상성이면 내 챔피언도 맞아야 한 문항
 *   topic  topicCases 72문항: 낱말 먼저 → 없으면 판정기(확신 0.6 미만이면 general)
 *
 *   app       route-v2·topic-v1 (원본 q4 logits 위 헤드)
 *   kev:<url> kev 서버(kev-0.8B 그대로 또는 우리 자료로 더 학습한 것)
 *
 * 사용: npx tsx scripts/llm/kev-agent/eval-b.ts --judges app,kev=http://127.0.0.1:8009 [--out file]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "../lib/facts";
import type { AdvisorData } from "../../../src/lib/advisor/context";
import { detectChampions } from "../../../src/lib/advisor/intent";
import { matchupSidesByPhrase, matchupSidesDetailed } from "../../../src/lib/advisor/answer";
import { JUDGE_KIND_CRITERIA, JUDGE_KIND_INSTRUCTIONS, JUDGE_MINE_INSTRUCTIONS, JUDGE_SUB_CRITERIA, JUDGE_SUB_INSTRUCTIONS, judgeRouteState, routeFromJudge, subFromJudge } from "../../../src/lib/advisor/routeAsk";
import { topicFromJudge, topicFromWords, topicQuestions } from "../../../src/lib/advisor/topicJudge";
import { TOPIC_TEST } from "../lib/topicCases";
import { ROOT, appJudge, kevJudge, loadData, saveJudgeCache, type Judge, type Lang } from "./lib";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
/** B3 LoRA 가 배운 아홉 갈래(`b3/build_b3.py` KIND3) */
export const KIND9: Record<string, string> = {
  matchup: "The user plays one named champion against another named champion (two champions named)",
  guide: "How to beat or handle one champion, without saying which champion the user plays",
  skills: "What a champion's abilities are; an overview of the kit",
  spellStat: "One number about one champion ability: cooldown, cost, ratio, damage or range",
  item: "Items: what to buy, what an item does, its price or who builds it",
  rune: "Runes: which to take, what a rune does or how it works",
  spell: "Summoner spells such as Flash, Ignite, Smite, Teleport: when to take them, cooldown, how they work",
  game: "Game rules and meta: objectives and their timers, gold, surrender, remake, ranked and dodging, champion or skin prices, the client",
  chat: "Greetings, thanks, feelings or small talk, not a game question",
};
const aliasesOf = (data: AdvisorData) => (card: ChampionCard) => [card.name, ...(data.aliases.get(card.id) ?? [])];

/** AdvisorPanel.ask 가 갈래·내 챔피언을 정하는 부분(판정 → 문형 보정 → 조사 우선) */
export async function route(data: AdvisorData, question: string, judge: Judge, head = "route-v2", subHead?: string, criteria: Record<string, string> = JUDGE_KIND_CRITERIA) {
  const named = detectChampions(data, question);
  const names = named.map((c) => c.name);
  const [kindP, mineP] = await judge(head, judgeRouteState(question, names), [
    { instructions: JUDGE_KIND_INSTRUCTIONS, options: Object.entries(criteria).map(([name, description]) => ({ name, description })) },
    ...(named.length >= 2 ? [{ instructions: JUDGE_MINE_INSTRUCTIONS, options: names.map((name) => ({ name })) }] : []),
  ]);
  const raw = { kind: Object.keys(criteria)[kindP.indexOf(Math.max(...kindP))], mine: mineP ? named[mineP.indexOf(Math.max(...mineP))]?.id : undefined };
  let r = criteria === JUDGE_KIND_CRITERIA ? routeFromJudge(kindP, mineP, named) : { kind: (raw.kind === "matchup" && named.length < 2 ? "guide" : raw.kind) as never, mine: raw.kind === "matchup" && mineP ? named[mineP.indexOf(Math.max(...mineP))] : undefined };
  if (r.kind === "matchup" && named.length >= 2) {
    const phrased = matchupSidesByPhrase(question, [named[0], named[1]], aliasesOf(data));
    if (phrased) r = { ...r, mine: phrased };
    if (named.length === 2) {
      const byJosa = matchupSidesDetailed(question, named);
      const picked = !byJosa.confident && r.mine && named.includes(r.mine) ? r.mine : undefined;
      r = { ...r, mine: picked ?? byJosa.sides[0] };
    }
  }
  if (r.kind === "other" && subHead) {
    const [p] = await judge(subHead, judgeRouteState(question, names), [
      { instructions: JUDGE_SUB_INSTRUCTIONS, options: Object.entries(JUDGE_SUB_CRITERIA).map(([name, description]) => ({ name, description })) },
    ]);
    return { raw, kind: subFromJudge(p), mine: undefined };
  }
  return { raw, kind: r.kind, mine: r.mine?.id };
}

export async function topic(data: AdvisorData, question: string, judge: Judge) {
  const named = detectChampions(data, question);
  const names = named.map((c) => c.name);
  const worded = topicFromWords(question, [...names, ...named.flatMap((c) => data.aliases.get(c.id) ?? [])]);
  const [p] = await judge("topic-v1", judgeRouteState(question, names), topicQuestions(Math.max(1, named.length)));
  const judged = topicFromJudge(p).topic;
  return { app: worded ?? judged, judgeOnly: judged, raw: Object.keys(p).length ? topicQuestions(1)[0].options[p.indexOf(Math.max(...p))].name : undefined };
}

interface RouteCase { lang: Lang; question: string; kind: string; champions: string[]; mine?: string }

async function main() {
  const judges: Array<[string, Judge]> = (arg("judges") ?? "app").split(",").map((spec) => {
    if (spec === "app") return ["app", appJudge];
    const [name, url] = spec.split("=");
    return [name, kevJudge(url)];
  });
  const cases = (JSON.parse(fs.readFileSync(path.join(ROOT, "research/llm-evals/kev-agent/route-large.json"), "utf8")) as { cases: RouteCase[] }).cases;
  const rows: unknown[] = [];
  const score: Record<string, Record<string, [number, number]>> = {};
  const add = (judge: string, key: string, ok: boolean) => {
    const cell = ((score[key] ??= {})[judge] ??= [0, 0]);
    cell[0] += ok ? 1 : 0;
    cell[1] += 1;
  };
  for (const [name, judge] of judges) {
    for (const c of cases) {
      const r = await route(loadData(c.lang), c.question, judge);
      const ok = r.kind === c.kind && (c.kind !== "matchup" || r.mine === c.mine);
      const rawOk = r.raw.kind === c.kind && (c.kind !== "matchup" || r.raw.mine === c.mine);
      add(name, "route(앱 보정)", ok);
      add(name, `route:${c.lang}`, ok);
      add(name, "route(판정기만)", rawOk);
      rows.push({ set: "route", judge: name, ...c, got: r, ok });
    }
    for (const c of TOPIC_TEST) {
      const t = await topic(loadData(c.lang as Lang), c.question, judge);
      add(name, "topic(앱: 낱말 먼저)", t.app === c.topic);
      add(name, `topic:${c.lang}`, t.app === c.topic);
      add(name, "topic(판정기만, 0.6)", t.judgeOnly === c.topic);
      rows.push({ set: "topic", judge: name, ...c, got: t, ok: t.app === c.topic });
    }
    process.stderr.write(`${name} done\n`);
  }
  saveJudgeCache();
  const out = arg("out") ?? path.join(ROOT, "research/llm-evals/kev-agent/b-results.json");
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  const names = judges.map(([n]) => n);
  console.log(["", ...names].join("\t"));
  for (const [key, cells] of Object.entries(score)) {
    console.log([key, ...names.map((n) => `${cells[n][0]}/${cells[n][1]} (${((cells[n][0] / cells[n][1]) * 10).toFixed(1)})`)].join("\t"));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
