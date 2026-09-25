/**
 * kev 에이전트 실험 공용 — Node 에서 앱 재료를 읽고, 앱 판정기와 kev 서버를 부른다.
 *
 * 앱 판정기(route-v2·topic-v1)는 `app_judge_serve.py` 가 특징(logits 2048개)을 내고 헤드 계산은
 * 앱의 `scoreJudge` 가 한다. 브라우저 워커와 같은 계산이다(끊어 넣기 차이 3e-5).
 * kev 는 jaredpalmer/kev 의 `python -m kev.serve` (POST /v1/systemone).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "../lib/facts";
import { indexRules, type RuleNotes } from "../lib/rules";
import type { AdvisorData } from "../../../src/lib/advisor/context";
import { readJudgeHead, scoreJudge, type JudgeHead, type JudgeHeadMeta, type JudgeQuestion } from "../../../src/lib/advisor/judge";

export const ROOT = path.resolve(import.meta.dirname, "../../..");
export const PATCH = "26.19";
const DATA = path.join(ROOT, "public/data", PATCH);
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;

export type Lang = "ko_KR" | "en_US" | "zh_CN";

const dataCache = new Map<string, AdvisorData>();
export function loadData(lang: Lang): AdvisorData {
  const hit = dataCache.get(lang);
  if (hit) return hit;
  const knowledge = read<{ patchVersion: string; playbooks: Record<string, unknown>; tips: unknown[]; rules?: RuleNotes[]; mechanics?: unknown[] }>(
    path.join(DATA, "llm/advisor-knowledge.json"),
  );
  const cards = read<{ cards: ChampionCard[] }>(path.join(DATA, `llm/champion-cards-${lang}.json`)).cards;
  const names = read<{ names: Record<string, string[]> }>(path.join(DATA, "llm/champion-names.json")).names;
  const translations = lang === "ko_KR" ? undefined : read<{ notes: Record<string, string> }>(path.join(DATA, `llm/note-translations-${lang}.json`)).notes;
  const wiki = fs.existsSync(path.join(DATA, "llm/item-wiki-meta.json"))
    ? read<{ items?: Array<{ id: string }> }>(path.join(DATA, "llm/item-wiki-meta.json"))
    : {};
  const tags = new Set<string>();
  for (const card of cards) for (const spell of card.spells) for (const tag of spell.effects) tags.add(tag);
  const data = {
    patch: PATCH,
    knowledgePatch: knowledge.patchVersion,
    stale: knowledge.patchVersion !== PATCH,
    cards,
    cardById: new Map(cards.map((c) => [c.id, c])),
    aliases: new Map(cards.map((c) => [c.id, [...new Set([...(names[c.id] ?? []), c.id])].filter((n) => n !== c.name)])),
    playbooks: new Map(Object.entries(knowledge.playbooks)),
    noteTranslations: translations,
    tips: knowledge.tips,
    ruleIndex: indexRules(knowledge.rules ?? []),
    mechanics: knowledge.mechanics ?? [],
    effectTags: [...tags].sort((a, b) => b.length - a.length),
    items: read<{ items: unknown[] }>(path.join(DATA, `items-normalized-${lang}.json`)).items,
    runes: read<{ runes: unknown[] }>(path.join(DATA, `runes-normalized-${lang}.json`)).runes,
    summoners: read<{ spells: unknown[] }>(path.join(DATA, `summoner-normalized-${lang}.json`)).spells,
    wikiItems: new Map((wiki.items ?? []).map((i) => [i.id, i])),
  } as unknown as AdvisorData;
  dataCache.set(lang, data);
  return data;
}

const heads = new Map<string, JudgeHead>();
function head(name: string): JudgeHead {
  const hit = heads.get(name);
  if (hit) return hit;
  // 실험 헤드는 research 쪽에 둔다. 앱에 싣기 전까지 public 에 넣지 않는다.
  const dir = [path.join(ROOT, "public/models/judge"), path.join(ROOT, "research/llm-evals/kev-agent/heads")].find((d) => fs.existsSync(path.join(d, `${name}.json`)))!;
  const meta = read<JudgeHeadMeta>(path.join(dir, `${name}.json`));
  const buf = fs.readFileSync(path.join(dir, `${name}.bin`));
  const h = readJudgeHead(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  heads.set(name, h);
  return h;
}

const APP_JUDGE = process.env.APP_JUDGE ?? "http://127.0.0.1:8010";
const judgeCache = new Map<string, number[][]>();
const cacheFile = path.join(ROOT, "research/llm-evals/kev-agent/.app-judge-cache.json");
if (fs.existsSync(cacheFile)) for (const [k, v] of Object.entries(read<Record<string, number[][]>>(cacheFile))) judgeCache.set(k, v);
export function saveJudgeCache() {
  fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(judgeCache)));
}

export type Judge = (headName: string, state: string, questions: JudgeQuestion[]) => Promise<number[][]>;

/** 같은 질문을 kev 서버에 묻는다(헤드 이름은 무시 — kev 는 헤드 하나로 모든 질문을 받는다). */
export function kevJudge(url: string): Judge {
  const cache = new Map<string, number[][]>();
  return async (_head, state, questions) => {
    const key = JSON.stringify([state, questions]);
    const hit = cache.get(key);
    if (hit) return hit;
    const res = await fetch(`${url}/v1/systemone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state,
        questions: Object.fromEntries(
          questions.map((q, i) => [`q${i}`, { type: "choice", instructions: q.instructions, criteria: Object.fromEntries(q.options.map((o) => [o.name, o.description ?? null])) }]),
        ),
      }),
    });
    if (!res.ok) throw new Error(`kev ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { answers: Record<string, { probabilities: Record<string, number> }> };
    const probs = questions.map((q, i) => q.options.map((o) => body.answers[`q${i}`].probabilities[o.name] ?? 0));
    cache.set(key, probs);
    return probs;
  };
}

/** 앱 판정기와 같은 답: 질문마다 선택지 확률 */
/** JUDGE_URL 을 주면 앱 판정기 자리에 kev 서버를 끼운다(B 의 판정기로 A 를 다시 잴 때). */
const judgeOverride = process.env.JUDGE_URL ? kevJudge(process.env.JUDGE_URL) : undefined;
export const appJudge: Judge = async (headName, state, questions) => {
  if (judgeOverride) return judgeOverride(headName, state, questions);
  const key = JSON.stringify([headName, state, questions]);
  const hit = judgeCache.get(key);
  if (hit) return hit;
  const res = await fetch(`${APP_JUDGE}/features`, { method: "POST", body: JSON.stringify({ state, questions }) });
  const { features } = (await res.json()) as { features: number[][][] };
  const h = head(headName);
  const probs = features.map((rows) => scoreJudge(h, rows.map((r) => Float32Array.from(r))));
  judgeCache.set(key, probs);
  return probs;
};

const KEV = process.env.KEV ?? "http://127.0.0.1:8009";
export interface KevChoice { type: "choice"; instructions: string; criteria: Record<string, string | null> }
export interface KevNoul { type: "noul"; instructions: string }
export async function kev(state: string, questions: Record<string, KevChoice | KevNoul>) {
  const res = await fetch(`${KEV}/v1/systemone`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, questions }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`kev ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    answers: Record<string, { type: string; choice?: string; confidence?: number; probabilities?: Record<string, number>; noul?: number }>;
  };
  return body.answers;
}

export function readJsonl<T>(file: string): T[] {
  return fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l) as T);
}
