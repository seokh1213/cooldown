/**
 * A — 대화 상태 측정. 이어 묻기·새 질문·상대 바꾸기에서 무엇을 답하려 했는가(갈래·두 챔피언·시점·주제)를 맞혔는지 센다.
 *
 *   app      지금 앱 그대로(AdvisorPanel.ask 의 갈래 판단을 옮겨 적음). 판정기 route-v2·topic-v1, 대화 맥락은
 *            recentChampions 규칙(이름이 없으면 방금 다룬 챔피언 하나)
 *   hist-kev 대화 이력을 통째로 kev-0.8B 에 넣고 갈래·내 챔피언·상대·주제를 한꺼번에 묻는다
 *   hist-gen 대화 이력을 0.8B(Ollama qwen3.5:0.8b)에 넣고 JSON 으로 쓰게 한다 — "0.8B 가 맥락을 쥔다"
 *   state    A: 상태는 코드가 들고, kev-0.8B 는 "이어 묻기인가 / 상대를 바꿨나 / 새 질문인가" 만 고른다.
 *            새 질문이면 지금 앱 경로를 그대로 탄다. 학습은 하지 않았다(kev-0.8B 그대로).
 *
 * 사용: npx tsx scripts/llm/kev-agent/eval-a.ts [--systems app,state] [--limit N]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "../lib/facts";
import { findMentionedRules } from "../lib/rules";
import type { AdvisorData } from "../../../src/lib/advisor/context";
import { buildItemCard, buildMechanicsAnswer, buildTagAnswer, detectSlot } from "../../../src/lib/advisor/context";
import { detectChampions } from "../../../src/lib/advisor/intent";
import {
  asksComparison,
  detectSpellFocus,
  looksChampionDirected,
  matchupPair,
  matchupSides,
  matchupSidesByPhrase,
  matchupSidesDetailed,
} from "../../../src/lib/advisor/answer";
import {
  JUDGE_KIND_CRITERIA,
  JUDGE_KIND_INSTRUCTIONS,
  JUDGE_MINE_INSTRUCTIONS,
  JUDGE_SUB_CRITERIA,
  JUDGE_SUB_INSTRUCTIONS,
  judgeRouteState,
  routeFromJudge,
  subFromJudge,
  type AskRoute,
} from "../../../src/lib/advisor/routeAsk";
import { TOPIC_CRITERIA, TOPIC_INSTRUCTIONS, topicFromJudge, topicFromWords, topicQuestions, type TopicLabel } from "../../../src/lib/advisor/topicJudge";
import { FOLLOW_INSTRUCTIONS, followCriteria, followState } from "./build-a-train";
import { actFromProbs, actFromWords, actQuestion, actState, planTurn, sideOfNewName } from "../../../src/lib/advisor/conversation";
import { ROOT, appJudge, kev, loadData, readJsonl, saveJudgeCache, type Judge, type Lang } from "./lib";

interface Gold { kind: string; champions: string[]; mine?: string; enemy?: string; topic?: string }
interface Turn { type: "T1" | "F" | "R" | "P"; text: string; gold: Gold }
interface Dialog { id: string; lang: Lang; turns: Turn[] }
export interface Resolved { kind: string; champs: string[]; mine?: string; enemy?: string; topic?: string }

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const kindOptions = Object.entries(JUDGE_KIND_CRITERIA).map(([name, description]) => ({ name, description }));
const aliasesOf = (data: AdvisorData) => (card: ChampionCard) => [card.name, ...(data.aliases.get(card.id) ?? [])];

/** AdvisorPanel.ask 의 갈래 판단(0~5단계)을 그대로 옮긴 것. 답을 짓지 않고 무엇을 답할지만 낸다. */
export async function appResolve(data: AdvisorData, question: string, recent: ChampionCard[], judge: Judge = appJudge): Promise<Resolved> {
  const named = detectChampions(data, question);
  const names = named.map((c) => c.name);
  const [kindP, mineP] = await judge("route-v2", judgeRouteState(question, names), [
    { instructions: JUDGE_KIND_INSTRUCTIONS, options: kindOptions },
    ...(named.length >= 2 ? [{ instructions: JUDGE_MINE_INSTRUCTIONS, options: names.map((name) => ({ name })) }] : []),
  ]);
  let route: AskRoute = routeFromJudge(kindP, mineP, named);
  if (route.kind === "matchup" && named.length >= 2) {
    const phrased = matchupSidesByPhrase(question, [named[0], named[1]], aliasesOf(data));
    if (phrased) route = { ...route, mine: phrased };
  }
  let topic: TopicLabel | undefined;
  if (named.length) {
    topic = topicFromWords(question, [...names, ...named.flatMap((c) => data.aliases.get(c.id) ?? [])]);
    if (!topic) topic = topicFromJudge((await judge("topic-v1", judgeRouteState(question, names), topicQuestions(named.length)))[0]).topic;
  }
  if (findMentionedRules(data.ruleIndex, question).length) return { kind: "other", champs: [] };
  let champions = named;
  if (champions.length === 1 && route.kind === "matchup") {
    const mine = recent.find((c) => c.id !== champions[0].id);
    if (mine) return { kind: "matchup", champs: [mine.id, champions[0].id], mine: mine.id, enemy: champions[0].id, topic };
  }
  if (champions.length >= 3 && !asksComparison(question, champions.length) && route.kind === "matchup") {
    const pair = matchupPair(question, champions, aliasesOf(data));
    if (pair) {
      const phrased = matchupSidesByPhrase(question, pair, aliasesOf(data));
      const [mine, enemy] = phrased ? [phrased, pair.find((c) => c.id !== phrased.id) ?? pair[1]] : matchupSides(question, pair);
      return { kind: "matchup", champs: [mine.id, enemy.id], mine: mine.id, enemy: enemy.id, topic };
    }
  }
  if (champions.length === 2 && route.kind === "matchup") {
    const byJosa = matchupSidesDetailed(question, champions);
    const picked = !byJosa.confident && route.mine && champions.includes(route.mine) ? route.mine : undefined;
    const [mine, enemy] = picked ? [picked, champions.find((c) => c.id !== picked.id) ?? champions[1]] : byJosa.sides;
    return { kind: "matchup", champs: [mine.id, enemy.id], mine: mine.id, enemy: enemy.id, topic };
  }
  if (champions.length === 0) {
    if (buildItemCard(data, question, undefined)) return { kind: "other", champs: [] };
    if (buildMechanicsAnswer(data, question)) return { kind: "other", champs: [] };
  }
  const slot = detectSlot(question);
  if (champions.length === 0 && looksChampionDirected(question, slot)) {
    if (recent.length === 1) champions = recent;
    else if (recent.length >= 2) {
      if (asksComparison(question, recent.length)) champions = recent;
      else if (slot) return { kind: "compare", champs: recent.map((c) => c.id) };
      else champions = [recent[0]];
    }
  }
  if (champions.length > 0) {
    if (asksComparison(question, champions.length)) return { kind: "compare", champs: champions.map((c) => c.id) };
    if (champions.length === 1) {
      const [card] = champions;
      if (slot && card.spells.some((s) => s.slot === slot)) return { kind: "spellStat", champs: [card.id] };
      if (buildTagAnswer(data, card, question)) return { kind: "other", champs: [card.id] };
      if (route.kind === "skills") return { kind: "skills", champs: [card.id] };
      const focus = detectSpellFocus(question)?.focus;
      if (focus && focus !== "damage") return { kind: "spellStat", champs: [card.id] };
      return { kind: "guide", champs: [card.id], topic };
    }
    return { kind: "brief", champs: champions.map((c) => c.id) };
  }
  return { kind: "other", champs: [] };
}

/** 이 답을 낸 뒤 앱의 recentChampions 가 돌려줄 것. 상성 답은 [내 챔피언, 상대] 순서다. */
function recentAfter(data: AdvisorData, r: Resolved, before: ChampionCard[]): ChampionCard[] {
  const cards = r.champs.map((id) => data.cardById.get(id)).filter((c): c is ChampionCard => !!c);
  return cards.length ? cards : before;
}

// ---- A: 상태 + kev 판정 ----------------------------------------------------------

const TOPIC_OPTIONS = Object.fromEntries(Object.entries(TOPIC_CRITERIA)) as Record<string, string>;

async function stateResolve(data: AdvisorData, question: string, state: Resolved | undefined, recent: ChampionCard[]): Promise<Resolved> {
  const named = detectChampions(data, question);
  if (!state || state.kind !== "matchup" || !state.mine || !state.enemy || named.length >= 2) return appResolve(data, question, recent);
  const mine = data.cardById.get(state.mine)!;
  const enemy = data.cardById.get(state.enemy)!;
  const context = `Earlier in this chat the user asked how to play ${mine.name} against ${enemy.name}.`;
  const topicOf = async (names: string[]) =>
    topicFromWords(question, [...names, ...names.flatMap((n) => data.aliases.get(data.cards.find((c) => c.name === n)?.id ?? "") ?? [])]) ??
    topicFromJudge((await appJudge("topic-v1", judgeRouteState(question, names), topicQuestions(2)))[0]).topic;
  if (named.length === 0) {
    const a = await kev(`${context}\nNew message: ${question}`, {
      act: {
        type: "choice",
        instructions: "What is the new message?",
        criteria: {
          followup: `A follow-up that asks more about playing ${mine.name} against ${enemy.name}`,
          new: "A new question about something else: an item, a game rule, a different champion or small talk",
        },
      },
    });
    if (a.act.choice === "followup") return { kind: "matchup", champs: [mine.id, enemy.id], mine: mine.id, enemy: enemy.id, topic: await topicOf([mine.name, enemy.name]) };
    return appResolve(data, question, recent);
  }
  const [other] = named;
  if (other.id === mine.id || other.id === enemy.id) {
    // "피오라 W 어떻게 빼" — 같은 상성에서 한쪽 스킬을 묻는다
    return { kind: "matchup", champs: [mine.id, enemy.id], mine: mine.id, enemy: enemy.id, topic: await topicOf([mine.name, enemy.name]) };
  }
  const a = await kev(`${context}\nNew message: ${question}\nChampion named in the new message: ${other.name}`, {
    act: {
      type: "choice",
      instructions: `Does the user still play ${mine.name}?`,
      criteria: {
        switch: `Yes: the user still plays ${mine.name} and now asks about facing ${other.name}`,
        new: `No: a new question about ${other.name} itself (its abilities, numbers or how to beat it in general)`,
      },
    },
  });
  if (a.act.choice === "switch") {
    return { kind: "matchup", champs: [mine.id, other.id], mine: mine.id, enemy: other.id, topic: await topicOf([mine.name, other.name]) };
  }
  return appResolve(data, question, recent);
}

/**
 * A′: 코드가 확실한 것을 먼저 가르고 남은 것만 kev 에 묻는다(useKev=false 면 규칙만).
 *   이름 없음 + 아이템·규칙·게임 규칙 이름이 있음 → 새 질문 / 없음 → 이어 묻기 후보
 *   이름 하나 + 슬롯·수치·스킬 소개(앱 경로가 skills·spellStat 로 가름) → 새 질문 / 아니면 상대 바꾸기 후보
 */
async function stateResolve2(data: AdvisorData, question: string, state: Resolved | undefined, recent: ChampionCard[], mode: "rule" | "kev" | "head" | "route"): Promise<Resolved> {
  const named = detectChampions(data, question);
  if (!state || state.kind !== "matchup" || !state.mine || !state.enemy || named.length >= 2) return appResolve(data, question, recent);
  const mine = data.cardById.get(state.mine)!;
  const enemy = data.cardById.get(state.enemy)!;
  const alone = await appResolve(data, question, []);
  const topicOf = async (names: string[]) =>
    topicFromWords(question, [...names, ...names.flatMap((n) => data.aliases.get(data.cards.find((c) => c.name === n)?.id ?? "") ?? [])]) ??
    topicFromJudge((await appJudge("topic-v1", judgeRouteState(question, names), topicQuestions(2)))[0]).topic;
  const context = `Earlier in this chat the user asked how to play ${mine.name} against ${enemy.name}.`;
  if (named.length === 0) {
    const entity = findMentionedRules(data.ruleIndex, question).length > 0 || !!buildItemCard(data, question, undefined) || !!buildMechanicsAnswer(data, question);
    if (entity) return alone;
    if (mode === "route") {
      // 주제 낱말("뭐 사야", "한타", "라인전")이 있으면 앞 상성의 이어 묻기다. 없으면 판정기가 질문 갈래를 보고
      // "그 밖"(룬·규칙·오브젝트·잡담)이면 새 질문이다.
      if (!topicFromWords(question)) {
        const [kindP] = await appJudge("route-v2", judgeRouteState(question, []), [{ instructions: JUDGE_KIND_INSTRUCTIONS, options: kindOptions }]);
        if (Object.keys(JUDGE_KIND_CRITERIA)[kindP.indexOf(Math.max(...kindP))] === "other") {
          // "그 밖" 은 아이템과 게임 규칙을 한데 묶는다. 한 번 더 가른다.
          const a = await kev(`Question: ${question}`, {
            sub: {
              type: "choice",
              instructions: "What is this League of Legends question about?",
              criteria: {
                play: "How to play, fight, lane, combo or survive (no champion named)",
                item: "Which items, stats or resistances to buy",
                rules: "Game rules and systems: surrender, ranked, dodging, summoner spell or rune mechanics, objectives, stat definitions",
              },
            },
          });
          if (a.sub.choice === "rules") return alone;
        }
      }
    }
    if (mode === "head") {
      const [p] = await appJudge("follow-v1", followState(mine.name, enemy.name, question), [
        { instructions: FOLLOW_INSTRUCTIONS, options: Object.entries(followCriteria(mine.name, enemy.name)).map(([name, description]) => ({ name, description })) },
      ]);
      if (p[1] > p[0]) return alone;
    }
    if (mode === "kev") {
      const a = await kev(`${context}\nNew message: ${question}`, {
        chat: { type: "noul", instructions: "Is the new message small talk or about the game client, surrender votes, or other players, rather than about playing a champion?" },
      });
      if ((a.chat.noul ?? 0) > 0.5) return alone;
    }
    return { kind: "matchup", champs: [mine.id, enemy.id], mine: mine.id, enemy: enemy.id, topic: await topicOf([mine.name, enemy.name]) };
  }
  const [other] = named;
  if (other.id === mine.id || other.id === enemy.id) {
    return { kind: "matchup", champs: [mine.id, enemy.id], mine: mine.id, enemy: enemy.id, topic: await topicOf([mine.name, enemy.name]) };
  }
  if (alone.kind === "skills" || alone.kind === "spellStat" || alone.kind === "other") return alone;
  if (mode === "kev") {
    const a = await kev(`${context}\nNew message: ${question}\nChampion named in the new message: ${other.name}`, {
      act: {
        type: "choice",
        instructions: `Does the user still play ${mine.name}?`,
        criteria: {
          switch: `Yes: the user still plays ${mine.name} and now asks about facing ${other.name}`,
          new: `No: a new question about ${other.name} itself (its abilities, numbers or how to beat it in general)`,
        },
      },
    });
    if (a.act.choice !== "switch") return alone;
  }
  return { kind: "matchup", champs: [mine.id, other.id], mine: mine.id, enemy: other.id, topic: await topicOf([mine.name, other.name]) };
}

/**
 * 앱(AdvisorPanel 3단계)과 같은 흐름: 상태 + planTurn. 판정기는 route-v3(게임 규칙·잡담 거르기)와 act-v1.
 * useAct=false 면 act 판정 없이 규칙만.
 */
async function convResolve(data: AdvisorData, question: string, state: Resolved | undefined, recent: ChampionCard[], useAct: boolean): Promise<Resolved> {
  const named = detectChampions(data, question);
  const st = state?.kind === "matchup" && state.mine && state.enemy ? { mine: data.cardById.get(state.mine)!, enemy: data.cardById.get(state.enemy)! } : undefined;
  if (!st || named.length > 1 || findMentionedRules(data.ruleIndex, question).length) return appResolve(data, question, recent);
  const worded = topicFromWords(question);
  const names = named.map((c) => c.name);
  const [kindP] = await appJudge("route-v2", judgeRouteState(question, names), [{ instructions: JUDGE_KIND_INSTRUCTIONS, options: kindOptions }]);
  let kind: string = Object.keys(JUDGE_KIND_CRITERIA)[kindP.indexOf(Math.max(...kindP))];
  if (kind === "other") {
    const [p] = await appJudge(SUB_HEAD, judgeRouteState(question, names), [
      { instructions: JUDGE_SUB_INSTRUCTIONS, options: Object.entries(JUDGE_SUB_CRITERIA).map(([name, description]) => ({ name, description })) },
    ]);
    kind = subFromJudge(p);
  }
  const hard = named.length === 0 && (!!buildItemCard(data, question, undefined) || !!buildMechanicsAnswer(data, question));
  const byWords = actFromWords(question);
  const act = byWords ?? (!hard && useAct
    ? actFromProbs((await appJudge(ACT_HEAD, actState(st.mine.name, st.enemy.name, question, named[0]?.name), [actQuestion(st.mine.name, st.enemy.name)]))[0])
    : undefined);
  const soft = !worded && (kind === "game" || kind === "chat");
  const trustNew = !!process.env.TRUST_NEW && useAct && act === "new" && !worded;
  const entity = named.length === 0 && (hard || byWords === "new" || trustNew || (!process.env.NO_SOFT && useAct && soft && act === "new"));
  const side = named.length === 1 ? sideOfNewName(question, [named[0].name, ...(data.aliases.get(named[0].id) ?? [])]) : undefined;
  const plan = planTurn(st, named, entity, act, side, useAct ? kind : undefined);
  if (plan.kind === "pass") return appResolve(data, question, recent);
  const pairNames = [plan.mine.name, plan.enemy.name];
  const topic =
    topicFromWords(question, [...pairNames, ...[plan.mine, plan.enemy].flatMap((c) => data.aliases.get(c.id) ?? [])]) ??
    topicFromJudge((await appJudge("topic-v1", judgeRouteState(question, pairNames), topicQuestions(2)))[0]).topic;
  return { kind: "matchup", champs: [plan.mine.id, plan.enemy.id], mine: plan.mine.id, enemy: plan.enemy.id, topic };
}
const SUB_HEAD = process.env.SUB_HEAD ?? "sub-v1";
const ACT_HEAD = process.env.ACT_HEAD ?? "act-v1";

// ---- 이력을 넣는 두 방식 ---------------------------------------------------------

function historyNames(data: AdvisorData, texts: string[]): ChampionCard[] {
  const seen = new Map<string, ChampionCard>();
  for (const t of texts) for (const c of detectChampions(data, t)) seen.set(c.id, c);
  return [...seen.values()];
}

async function histKev(data: AdvisorData, texts: string[]): Promise<Resolved> {
  const question = texts[texts.length - 1];
  const cands = historyNames(data, texts);
  const convo = texts.slice(0, -1).map((t) => `User: ${t}`).join("\n");
  const stateText = `${convo ? `Conversation so far:\n${convo}\n` : ""}Current question: ${question}${cands.length ? `\nChampions named in the conversation: ${cands.map((c) => c.name).join(", ")}` : ""}`;
  const questions: Record<string, { type: "choice"; instructions: string; criteria: Record<string, string | null> }> = {
    kind: { type: "choice", instructions: "What is the current question asking for, given the conversation?", criteria: JUDGE_KIND_CRITERIA },
    topic: { type: "choice", instructions: TOPIC_INSTRUCTIONS, criteria: TOPIC_OPTIONS },
  };
  if (cands.length >= 1) {
    questions.mine = { type: "choice", instructions: "Which champion does the user play?", criteria: Object.fromEntries(cands.map((c) => [c.name, null])) };
    questions.enemy = { type: "choice", instructions: "Which champion is the user asking about or playing against right now?", criteria: Object.fromEntries(cands.map((c) => [c.name, null])) };
  }
  const a = await kev(stateText, questions);
  const byName = (n?: string) => cands.find((c) => c.name === n)?.id;
  const kind = a.kind.choice ?? "other";
  const topic = (a.topic.confidence ?? 0) >= 0.6 ? a.topic.choice : "general";
  if (kind === "matchup") {
    const mine = byName(a.mine?.choice);
    const enemy = byName(a.enemy?.choice);
    return { kind, champs: [mine, enemy].filter((x): x is string => !!x), mine, enemy, topic };
  }
  const now = detectChampions(data, question).map((c) => c.id);
  const champs = now.length ? now : kind === "other" ? [] : [byName(a.enemy?.choice)].filter((x): x is string => !!x);
  return { kind, champs, topic };
}

const OLLAMA = "http://127.0.0.1:11434";
async function histGen(data: AdvisorData, texts: string[]): Promise<Resolved> {
  const cands = historyNames(data, texts);
  const convo = texts.map((t, i) => `${i === texts.length - 1 ? "Current question" : "User"}: ${t}`).join("\n");
  const prompt = `${convo}

Read the whole conversation and describe what the current question asks. Answer JSON only:
{"kind": one of ${JSON.stringify(Object.keys(JUDGE_KIND_CRITERIA))},
 "mine": the champion the user plays (or null),
 "enemy": the opponent or the champion asked about (or null),
 "topic": one of ${JSON.stringify(Object.keys(TOPIC_CRITERIA))}}
kind: ${Object.entries(JUDGE_KIND_CRITERIA).map(([k, v]) => `${k} = ${v}`).join("; ")}
Champions in the conversation: ${cands.map((c) => c.name).join(", ") || "none"}`;
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      model: "qwen3.5:0.8b",
      messages: [{ role: "user", content: prompt }],
      stream: false,
      format: "json",
      think: false,
      options: { temperature: 0, num_predict: 120 },
    }),
  });
  const body = (await res.json()) as { message?: { content?: string } };
  let parsed: { kind?: string; mine?: string | null; enemy?: string | null; topic?: string } = {};
  try {
    parsed = JSON.parse(body.message?.content ?? "{}");
  } catch {
    /* 형식이 깨지면 빈 답 */
  }
  const byName = (n?: string | null) => (n ? cands.find((c) => c.name === n || c.id === n)?.id : undefined);
  const kind = parsed.kind ?? "other";
  const mine = byName(parsed.mine);
  const enemy = byName(parsed.enemy);
  if (kind === "matchup") return { kind, champs: [mine, enemy].filter((x): x is string => !!x), mine, enemy, topic: parsed.topic };
  return { kind, champs: [enemy ?? mine].filter((x): x is string => !!x), topic: parsed.topic };
}

// ---- 채점 ----------------------------------------------------------------------

export function judgeTurn(gold: Gold, r: Resolved) {
  if (gold.kind === "matchup") {
    const pair = r.kind === "matchup" && r.mine === gold.mine && r.enemy === gold.enemy;
    const topic = gold.topic ? (r.topic ?? "general") === gold.topic : true;
    return { ok: pair && topic, pair, topic };
  }
  // "그 밖"(룬·아이템·규칙·잡담)은 곁들인 챔피언 이름을 따지지 않는다. 답이 챔피언 카드가 아니다.
  const same = r.kind === gold.kind && (gold.kind === "other" || [...r.champs].sort().join() === [...gold.champions].sort().join());
  return { ok: same, pair: same, topic: true };
}

async function main() {
  const systems = (arg("systems") ?? "app,hist-kev,hist-gen,state").split(",");
  const limit = Number(arg("limit") ?? 1e9);
  const dialogs = readJsonl<Dialog>(path.join(ROOT, "research/llm-evals/kev-agent/a-set.jsonl")).slice(0, limit);
  const rows: Array<{ id: string; lang: Lang; turn: number; type: string; system: string; text: string; gold: Gold; got: Resolved; ok: boolean; pair: boolean; topic: boolean }> = [];
  for (const d of dialogs) {
    const data = loadData(d.lang);
    for (const system of systems) {
      let recent: ChampionCard[] = [];
      let state: Resolved | undefined;
      const texts: string[] = [];
      for (const [i, t] of d.turns.entries()) {
        texts.push(t.text);
        const got =
          system === "app"
            ? await appResolve(data, t.text, recent)
            : system === "state"
              ? await stateResolve(data, t.text, state, recent)
              : system === "conv" || system === "conv-rule"
                ? await convResolve(data, t.text, state, recent, system === "conv")
              : system === "state2" || system === "state-rule" || system === "state3" || system === "state-route"
                ? await stateResolve2(data, t.text, state, recent, system === "state2" ? "kev" : system === "state3" ? "head" : system === "state-route" ? "route" : "rule")
              : system === "hist-kev"
                ? await histKev(data, texts)
                : await histGen(data, texts);
        recent = recentAfter(data, got, recent);
        state = got;
        rows.push({ id: d.id, lang: d.lang, turn: i, type: t.type, system, text: t.text, gold: t.gold, got, ...judgeTurn(t.gold, got) });
      }
    }
    process.stderr.write(".");
  }
  saveJudgeCache();
  const out = arg("out") ?? path.join(ROOT, "research/llm-evals/kev-agent/a-results.json");
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  console.log(`\n${rows.length} rows → ${path.relative(ROOT, out)}`);
  const table: Record<string, Record<string, [number, number]>> = {};
  for (const r of rows) {
    for (const key of [r.type, `${r.type}:${r.lang}`, "follow(F+R)", "all"]) {
      if (key === "follow(F+R)" && !(r.type === "F" || r.type === "R")) continue;
      const cell = ((table[key] ??= {})[r.system] ??= [0, 0]);
      cell[0] += r.ok ? 1 : 0;
      cell[1] += 1;
    }
  }
  console.log(["", ...systems].join("\t"));
  for (const [key, cells] of Object.entries(table).sort()) {
    console.log([key, ...systems.map((s) => (cells[s] ? `${cells[s][0]}/${cells[s][1]} (${((cells[s][0] / cells[s][1]) * 10).toFixed(1)})` : "-"))].join("\t"));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
