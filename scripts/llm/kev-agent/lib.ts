/**
 * kev 에이전트 실험 공용 — Node 에서 앱 재료를 읽고, 앱 판정기와 kev 서버를 부른다.
 *
 * 앱 판정은 `hidden_judge_serve.py` 가 앱 그래프의 은닉 상태를 내고 헤드 계산은 앱의 `scoreJudge` 가 한다.
 * kev 는 jaredpalmer/kev 의 `python -m kev.serve` (POST /v1/systemone).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "../../../src/lib/knowledge/facts";
import { indexRules, type RuleNotes } from "../../../src/lib/knowledge/rules";
import { championAliases, collectEffectTags, type AdvisorData } from "../../../src/lib/advisor/context";
import { abilityIndex, type AbilityBundle } from "../../../src/lib/advisor/mechanics/types";
import { encodeJudgeRow, JUDGE_SPECIAL, readJudgeHead, scoreJudge, type JudgeHead, type JudgeHeadMeta, type JudgeQuestion } from "../../../src/lib/advisor/judge";
import { AutoTokenizer, type PreTrainedTokenizer } from "@huggingface/transformers";
import { ADVISOR_MODEL } from "../../../src/lib/advisor/config";
import { offlineJudge } from "../../../src/lib/advisor/offlineJudge";
import { evaluationPaths } from "./evaluation_config";
import type { JudgeTier, PlanContext } from "../../../src/lib/advisor/plan";
import { readCurrentPatchVersion } from "../lib/data";

export const ROOT = path.resolve(import.meta.dirname, "../../..");
export const PATCH = readCurrentPatchVersion(path.join(ROOT, "public/data"));
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
  const itemNameFile = path.join(DATA, "llm/item-names.json");
  const itemNames = fs.existsSync(itemNameFile) ? read<{ names: Record<string, string[]> }>(itemNameFile).names : {};
  const translations = lang === "ko_KR" ? undefined : read<{ notes: Record<string, string> }>(path.join(DATA, `llm/note-translations-${lang}.json`)).notes;
  const wiki = fs.existsSync(path.join(DATA, "llm/item-wiki-meta.json"))
    ? read<{ items?: Array<{ id: string }> }>(path.join(DATA, "llm/item-wiki-meta.json"))
    : {};
  const data = {
    patch: PATCH,
    knowledgePatch: knowledge.patchVersion,
    stale: knowledge.patchVersion !== PATCH,
    cards,
    cardById: new Map(cards.map((c) => [c.id, c])),
    aliases: championAliases(cards, names),
    playbooks: new Map(Object.entries(knowledge.playbooks)),
    noteTranslations: translations,
    locale: lang,
    itemNames: new Map(Object.entries(itemNames)),
    tips: knowledge.tips,
    ruleIndex: indexRules(knowledge.rules ?? []),
    mechanics: knowledge.mechanics ?? [],
    abilityRules: abilityIndex(fs.existsSync(path.join(DATA, "llm/champion-mechanics.json"))
      ? read<AbilityBundle>(path.join(DATA, "llm/champion-mechanics.json")) : undefined, PATCH),
    effectTags: collectEffectTags(cards),
    items: read<{ items: unknown[] }>(path.join(DATA, `items-normalized-${lang}.json`)).items,
    runes: read<{ runes: unknown[] }>(path.join(DATA, `runes-normalized-${lang}.json`)).runes,
    summoners: read<{ spells: unknown[] }>(path.join(DATA, `summoner-normalized-${lang}.json`)).spells,
    wikiItems: new Map((wiki.items ?? []).map((i) => [i.id, i])),
  } as unknown as AdvisorData;
  dataCache.set(lang, data);
  return data;
}

const heads = new Map<string, JudgeHead>();
const evaluation = evaluationPaths(ROOT);
function head(name: string): JudgeHead {
  const hit = heads.get(name);
  if (hit) return hit;
  // 실험 헤드는 research 쪽에 둔다. 앱에 싣기 전까지 public 에 넣지 않는다.
  const dir = evaluation.heads.find((d) => fs.existsSync(path.join(d, `${name}.json`)));
  if (!dir) throw new Error(`Evaluation head unavailable: ${name}`);
  const meta = read<JudgeHeadMeta>(path.join(dir, `${name}.json`));
  const buf = fs.readFileSync(path.join(dir, `${name}.bin`));
  const h = readJudgeHead(meta, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  heads.set(name, h);
  return h;
}

const APP_JUDGE = process.env.APP_JUDGE ?? "http://127.0.0.1:8010";
const judgeCache = new Map<string, number[][]>();
const cacheFile = evaluation.cache;
if (fs.existsSync(cacheFile)) for (const [k, v] of Object.entries(read<Record<string, number[][]>>(cacheFile))) judgeCache.set(k, v);
export function saveJudgeCache() {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(judgeCache)));
}

export type Judge = (headName: string, state: string, questions: JudgeQuestion[]) => Promise<number[][]>;

/**
 * 앱과 같은 kev 판정: 앱 그래프의 은닉 상태(`hidden_judge_serve.py`)에 앱 헤드(`public/models/judge/<헤드>`)를 얹는다.
 * 토큰화·판정 위치는 워커(`src/workers/advisor/loraFeatures.ts` judgeHidden)와 같은 `encodeJudgeRow` 를 쓴다.
 */
let judgeTokenizer: Promise<PreTrainedTokenizer> | undefined;
export function hiddenJudge(url: string): Judge {
  return async (headName, state, questions) => {
    const key = JSON.stringify([evaluation.namespace, "hidden", headName, state, questions]);
    const hit = judgeCache.get(key);
    if (hit) return hit;
    const tokenizer = await (judgeTokenizer ??= AutoTokenizer.from_pretrained(ADVISOR_MODEL.id));
    const special = tokenizer.convert_tokens_to_ids([...JUDGE_SPECIAL]) as number[];
    // 워커와 같게: 상태 글 속 특수 토큰 꼴은 깨 둔다
    const tokenize = (text: string) => tokenizer.encode(text.replace(/<\|(\w+)\|>/g, "<¦$1¦>"), { add_special_tokens: false }) as number[];
    const h = head(headName);
    const probs: number[][] = [];
    for (const question of questions) {
      const row = encodeJudgeRow(tokenize, special, state, question);
      const res = await fetch(`${url}/hidden`, { method: "POST", body: JSON.stringify({ ids: row.ids, positions: row.positions }) });
      const { hidden } = (await res.json()) as { hidden: number[][] };
      probs.push(scoreJudge(h, hidden.map((r) => Float32Array.from(r))));
    }
    judgeCache.set(key, probs);
    return probs;
  };
}

/** 같은 질문을 System One 서버에 묻는다(헤드 이름은 무시 — 서버가 모든 질문을 받는다). */
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
        // Jeff(Jev 형식 서버)는 model 을 요구한다. kev 서버는 모르는 칸을 무시한다.
        model: process.env.JUDGE_MODEL ?? "jeff-latest",
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

/** 모델 없는 기기의 오프라인 판정기(`public/models/offline/judge.{json,bin}`)를 Node 에서 읽어 판정기 꼴로 돌려준다. 헤드 이름은 무시한다. */
export function offlineFileJudge(): Judge {
  return offlineJudge(async (file) => {
    const buf = await fs.promises.readFile(path.join(ROOT, "public", file));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  });
}

/** 앱 판정기와 같은 답: 질문마다 선택지 확률 */
/** JUDGE_URL 을 주면 앱 판정기 자리에 System One 서버를 끼운다. Ollama 는 JUDGE_MODEL 로 모델을 지정한다. */
/** HIDDEN_JUDGE 를 주면 앱 그래프·앱 헤드 그대로(`hiddenJudge`) 잰다. */
/** JUDGE=offline 이면 모델 없이 오프라인 판정기(`offlineFileJudge`)로 잰다 — 서버가 필요 없다. */
const judgeOverride =
  process.env.JUDGE === "offline" ? offlineFileJudge()
  : process.env.JUDGE_URL ? kevJudge(process.env.JUDGE_URL)
  : process.env.HIDDEN_JUDGE ? hiddenJudge(process.env.HIDDEN_JUDGE)
  : undefined;

/**
 * 측정 설정의 판정기 단계와 그에 맞는 `PlanContext` 칸.
 *
 * `model` 이 false 면(`--no-model`, "모델 없음" 행) 판정기 없이 낱말 규칙만 — 기준선이다. true 면 `JUDGE=offline` 일 때 모델 없는
 * 기기의 오프라인 판정기(동의 전·모델 없음 그대로: `consented`·`canUseModel` false), 그 밖은 모델을 받아 동의한 기기의 모델 판정기.
 * RETRIEVAL_EVAL=1이면 q4 임베딩 서버로 실제 앱 검색을 함께 평가한다.
 */
export function judgeTierOf(model: boolean): JudgeTier {
  return !model ? "none" : process.env.JUDGE === "offline" ? "offline" : "model";
}
export function planFlags(model: boolean): Pick<PlanContext, "judge" | "consented" | "canUseModel" | "retrieval"> {
  const judge = judgeTierOf(model);
  return { judge, consented: judge === "model", canUseModel: judge === "model", retrieval: judge === "model" && process.env.RETRIEVAL_EVAL === "1" };
}
/** 결과 표·파일 이름에 적는 판정기 단계 이름 */
export const JUDGE_TIER_LABELS: Record<JudgeTier, string> = { model: "판정기", offline: "오프라인 판정기", none: "모델 없음" };
/** JUDGE_HEAD 를 주면 앱이 부르는 헤드 이름을 그것으로 바꿔 잰다(새 헤드 실험용, research/llm-evals/kev-agent/heads 에서 찾는다). */
export const appJudge: Judge = async (headName, state, questions) => {
  headName = process.env.JUDGE_HEAD ?? headName;
  if (judgeOverride) return judgeOverride(headName, state, questions);
  const key = JSON.stringify([evaluation.namespace, headName, state, questions]);
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
