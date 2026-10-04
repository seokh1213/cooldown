/**
 * 미리 쓴 상성 답(matchups/<id>.json)을 영어·중국어로 옮긴다
 *
 * precompute-matchups.ts 가 한국어로 쓴 칸(watch·build·fight …)을 칸마다 옮긴다. 노트 번역과 같은 검수:
 *   1. Codex 가 몇 쌍씩 묶어 칸마다 옮긴다. 스킬·챔피언·아이템 이름은 그 언어 카드·아이템 이름을 쓴다
 *      (그 칸에 나온 것만 대응표로 준다).
 *   2. 코드가 대조한다: 한국어 글자가 남지 않았나, 원문에 나온 스킬·아이템 이름이 번역에 그 언어 이름으로
 *      있나, 길이가 지나치게 짧거나 길지 않나.
 *   3. Claude 가 원문과 뜻이 같은지 가린다.
 *   4. 통과한 칸만 knowledge/matchup-translations/<lang>/<id>.json 에 원문(basis)과 함께 싣는다.
 *      다시 돌리면 원문이 그대로인 칸은 건너뛴다(원문이 바뀐 칸만 다시 옮긴다).
 *   --emit 은 저장된 번역으로 public/data/<patch>/llm/matchups/<id>.<lang>.json 을 짓는다(키 구조는 원문과 같다).
 *
 * 번역기는 `--translator codex`(기본, Codex CLI) 또는 `ollama:<모델>`(로컬, 토큰 비용 없음). 뜻 대조는 `--checker claude`(기본 모델)·
 * `sonnet`·`none`. `--probe <파일>` 은 저장된 번역을 건너뛰지 않고 새로 옮겨 칸마다 결과를 파일에 적는다(저장소는 건드리지 않는다).
 *
 * 사용: npx tsx scripts/llm/translate-matchups.ts --lang en_US [--champions A,B] [--concurrency 2] [--batch 4]
 *       npx tsx scripts/llm/translate-matchups.ts --lang en_US --emit
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "../../src/lib/knowledge/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { CODEX_MODEL } from "./build-note-atoms";
import { groupMatchupJobs, maskNameOccurrences, runCodexTranslation } from "./lib/matchup-translation-runtime";
import { requireStagingStore } from "./lib/translation-meaning-check";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const LANG = (arg("lang") ?? "en_US") as "en_US" | "zh_CN";
const CONCURRENCY = Number(arg("concurrency") ?? 2);
const BATCH = Number(arg("batch") ?? 8);
const TRANSLATOR = arg("translator") ?? "codex";
const CHECKER = arg("checker") ?? "claude";
const CHECKER_MODEL = arg("checker-model") ?? CODEX_MODEL;
const PROBE = arg("probe");
const RUN_LOG = arg("run-log");
const EMIT_EVERY = CHECKER === "none" ? 0 : Number(arg("emit-every") ?? 25);
const MAX_BATCH_JOBS = 64;
const probeRows: Array<{ me: string; enemy: string; slot: string; ko: string; text?: string; stage: "code" | "meaning" | "kept" }> = [];
const LANG_NAME = { en_US: "English", zh_CN: "简体中文" };

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const SRC = arg("src") ?? path.join(llmDir, "matchups");
const STORE = arg("store") ?? path.join("knowledge", "matchup-translations", LANG);
requireStagingStore(CHECKER, arg("store"));
if (CHECKER === "none" && process.argv.includes("--emit")) {
  throw new Error("뜻 검수 없이 저장한 staging 후보는 --emit으로 제공할 수 없습니다.");
}

type Sections = Record<string, string>;
interface MatchupFile {
  patch: string;
  pairs: Record<string, Sections>;
}
interface Store {
  pairs: Record<string, Record<string, { basis: string; text: string }>>;
}

const cardsOf = (lang: string) =>
  new Map((JSON.parse(fs.readFileSync(path.join(llmDir, `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards.map((c) => [c.id, c]));
const koCards = cardsOf("ko_KR");
const targetCards = cardsOf(LANG);
const itemsOf = (lang: string) =>
  new Map(
    (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, `items-normalized-${lang}.json`), "utf8")) as { items: Array<{ id: string; name: string }> }).items.map(
      (i) => [i.id, i.name],
    ),
  );
const koItems = itemsOf("ko_KR");
const targetItems = itemsOf(LANG);
// 긴 이름부터 — "처형인의 대검" 이 "대검" 보다 먼저 걸리게
const itemPairs = [...koItems]
  .map(([id, ko]) => ({ ko, target: targetItems.get(id) }))
  // 두 글자 이름(기회 = Opportunity, 경계 = Terminus)은 흔한 낱말과 같아 "잡을 기회" 를 아이템으로 잡았다
  .filter((p): p is { ko: string; target: string } => !!p.target && p.ko.replace(/\s/g, "").length >= 3)
  .sort((a, b) => b.ko.length - a.ko.length);

function spawnText(cmd: string, args: string[], input: string, cwd: string): Promise<{ text: string; code: number | null }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let out = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), 10 * 60 * 1000);
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stderr.resume();
    child.stdin.end(input);
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ text: out, code });
    });
  });
}

async function codex(prompt: string, me: string): Promise<string> {
  return runCodexTranslation(prompt, { model: CODEX_MODEL, stage: "matchups", lang: LANG, id: me, logPath: RUN_LOG });
}

/** 로컬 Ollama. JSON 한 덩어리로 답하게 한다. 사고 모드가 있는 모델은 끈다. */
async function ollama(model: string, prompt: string): Promise<string> {
  const res = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false, format: "json", think: false, options: { temperature: 0.2, num_ctx: 16384 } }),
  });
  return res.ok ? (((await res.json()) as { message?: { content?: string } }).message?.content ?? "") : "";
}

const translate = (prompt: string, me: string) => (TRANSLATOR.startsWith("ollama:") ? ollama(TRANSLATOR.slice("ollama:".length), prompt) : codex(prompt, me));

const claude = async (prompt: string) => {
  const result = await spawnText("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", "", ...(CHECKER === "sonnet" ? ["--model", "sonnet"] : [])], prompt, os.tmpdir());
  if (result.code !== 0) throw new Error("뜻 검수기 실행이 실패했습니다.");
  return result.text;
};

const meaningCheck = (prompt: string, id: string) =>
  CHECKER === "codex"
    ? runCodexTranslation(prompt, { model: CHECKER_MODEL, stage: "matchup-meaning-check", lang: LANG, id, logPath: RUN_LOG })
    : claude(prompt);

function jsonObject<T>(text: string): T | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    return start >= 0 && end > start ? (JSON.parse(text.slice(start, end + 1)) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** 원문에 나온 이름(스킬·챔피언·아이템)과 그 언어 이름 */
function namesIn(ko: string, ids: string[]): Array<{ ko: string; target: string }> {
  const out: Array<{ ko: string; target: string }> = [];
  const recognized: string[] = [];
  for (const id of ids) {
    const k = koCards.get(id);
    const t = targetCards.get(id);
    if (!k || !t) continue;
    if (ko.includes(k.name)) {
      out.push({ ko: k.name, target: t.name });
      recognized.push(k.name);
    }
    for (const s of k.spells) {
      // 이름이 둘인 스킬("도주 / 억압")은 두 이름을 모두 대조한다. 앞 이름만 보다가 "潜掠 / 压制"(정답 潜掠/强掳)가 통과했다.
      const koNames = s.name.split(/\s*[/|]\s*/);
      const tNames = t.spells.find((x) => x.slot === s.slot)?.name.split(/\s*[/|]\s*/) ?? [];
      koNames.forEach((koName, i) => {
        const tName = tNames[i] ?? tNames[0];
        if (tName && koName.length >= 2 && ko.includes(koName)) {
          out.push({ ko: koName, target: tName });
          recognized.push(koName);
        }
      });
    }
  }
  let rest = maskNameOccurrences(ko, recognized);
  for (const item of itemPairs) {
    if (rest.includes(item.ko)) {
      out.push(item);
      rest = rest.split(item.ko).join(" ");
    }
  }
  return out;
}

/** 번역에 빠진 이름. 대소문자와 따옴표 모양은 가리지 않는다. */
function missingNames(text: string, names: Array<{ ko: string; target: string }>): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'");
  return names.filter((n) => !norm(text).includes(norm(n.target))).map((n) => n.target);
}

/** 연달아 받은 빈 답의 수. Codex 한도에 걸리면 답이 비어 모든 칸이 "탈락" 으로 헛돌았다. */
let emptyReplies = 0;
let emptyCheckerReplies = 0;
const MAX_EMPTY = 3;

type Job = { enemy: string; slot: string; ko: string };

function batchPrompt(me: string, jobs: Job[]): string {
  const ids = [me, ...new Set(jobs.map((j) => j.enemy))];
  const glossary = new Map<string, string>();
  for (const j of jobs) for (const n of namesIn(j.ko, [me, j.enemy])) glossary.set(n.ko, n.target);
  return [
    `Translate these League of Legends matchup coaching paragraphs from Korean to ${LANG_NAME[LANG]}. The player plays ${targetCards.get(me)?.name}.`,
    "Keep the meaning exactly: every fact, condition, timing and advice stays; add nothing. Natural, concise game-guide style.",
    'Abilities are written as "<champion> <slot> <ability name>" (e.g. "Rumble E Electro-Harpoon"); keep that form with the slot letter.',
    // 로컬 모델(qwen3 30B)이 "R 이 빠진 직후" 를 "R is missed" 로 옮겼다
    'Korean "빠지다/빠진/빠졌을 때" said of an ability or spell means it is on cooldown ("is down", "has been used"), never "missed".',
    `Use exactly these names (Korean → ${LANG_NAME[LANG]}):`,
    ...[...glossary].map(([k, t]) => `${k} → ${t}`),
    ...ids.map((id) => `${koCards.get(id)?.name} → ${targetCards.get(id)?.name}`),
    'Do not read files or run commands. Reply with ONE JSON object only: {"0": "...", "1": "...", ...}',
    "",
    ...jobs.map((j, k) => `${k}. ${j.ko}`),
  ].join("\n");
}

async function translateBatch(me: string, jobs: Job[], store: Store): Promise<[number, number, number]> {
  return acceptBatch(me, jobs, await translate(batchPrompt(me, jobs), me), store);
}

/** 번역기가 낸 글을 코드로 대조하고 뜻 대조를 거쳐 통과한 칸만 저장소에 싣는다. `--import` 도 이 길을 탄다. */
async function acceptBatch(me: string, jobs: Job[], reply: string, store: Store): Promise<[number, number, number]> {
  const parsed = jsonObject<Record<string, string>>(reply);
  // 빈 답(한도·오류)은 따로 센다 — 연달아 나오면 main 이 멈춘다
  if (!parsed) emptyReplies += 1;
  else emptyReplies = 0;
  const result = parsed ?? {};
  let rejected = 0;
  const passed: Array<{ job: (typeof jobs)[number]; text: string }> = [];
  jobs.forEach((job, k) => {
    const text = result[String(k)]?.trim();
    const ratio = text ? text.length / job.ko.length : 0;
    // 한국어는 영어보다 짧고 중국어보다 길다. 너무 벗어나면 빠뜨렸거나 덧붙였다.
    const [lo, hi] = LANG === "en_US" ? [1.2, 4] : [0.5, 1.6];
    const lost = text ? missingNames(text, namesIn(job.ko, [me, job.enemy])) : [];
    if (!text || /[가-힣]/.test(text) || ratio < lo || ratio > hi || lost.length) {
      if (process.env.MU_DEBUG) console.log(`  탈락 ${job.enemy}.${job.slot}: 길이비 ${ratio.toFixed(2)} 빠진 이름 ${lost.join(", ")}\n    ${job.ko}\n    ${text}`);
      if (PROBE) probeRows.push({ me, enemy: job.enemy, slot: job.slot, ko: job.ko, text, stage: "code" });
      rejected += 1;
      return;
    }
    passed.push({ job, text });
  });
  const check = [
    `League of Legends matchup coaching: Korean original and ${LANG_NAME[LANG]} translation. For each number answer true/false.`,
    "true only if the translation means the same: same subject (whose ability/action), same ability and effect pairing, same items,",
    "nothing added (conditions, numbers, timing, conclusions) and nothing dropped. Rewording is fine.",
    "",
    ...passed.flatMap((p, k) => [`${k}. KO: ${p.job.ko}`, `   ${LANG}: ${p.text}`]),
    "",
    'Reply with ONE JSON object only: {"0": true, "1": false, ...}',
  ].join("\n");
  const verdict =
    CHECKER === "none"
      ? Object.fromEntries(passed.map((_, k) => [String(k), true]))
      : passed.length
        ? (jsonObject<Record<string, boolean>>(await meaningCheck(check, me)) ?? jsonObject<Record<string, boolean>>(await meaningCheck(check, me)))
        : {};
  if (passed.length && (!verdict || !Object.keys(verdict).length)) {
    emptyCheckerReplies += 1;
    if (emptyCheckerReplies >= MAX_EMPTY) throw new Error(`뜻 검수에서 연속 ${MAX_EMPTY}회 답을 읽지 못해 중단합니다.`);
  } else if (Object.keys(verdict ?? {}).length) emptyCheckerReplies = 0;
  let kept = 0;
  let meaning = 0;
  const latest = readSource(me);
  passed.forEach((p, k) => {
    const ok = verdict?.[String(k)] === true;
    if (PROBE) probeRows.push({ me, enemy: p.job.enemy, slot: p.job.slot, ko: p.job.ko, text: p.text, stage: ok ? "kept" : "meaning" });
    const current = latest?.pairs[p.job.enemy]?.[p.job.slot];
    if (ok && current === p.job.ko) {
      (store.pairs[p.job.enemy] ??= {})[p.job.slot] = { basis: p.job.ko, text: p.text };
      kept += 1;
    } else if (!ok) {
      rejected += 1;
      meaning += 1;
    }
  });
  return [kept, rejected, meaning];
}

const storePath = (id: string) => path.join(STORE, `${id}.json`);
const readStore = (id: string): Store => (fs.existsSync(storePath(id)) ? (JSON.parse(fs.readFileSync(storePath(id), "utf8")) as Store) : { pairs: {} });

function writeStore(id: string, store: Store): void {
  const pairs = Object.fromEntries(Object.entries(store.pairs).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(STORE, { recursive: true });
  fs.writeFileSync(storePath(id), `${JSON.stringify({ pairs }, null, 2)}\n`);
}

/** 원문 파일. 생성기가 쌍마다 파일을 통째로 다시 쓰므로 쓰는 도중에 읽으면 깨져 있다 — 그때는 건너뛴다. */
function readSource(id: string): MatchupFile | undefined {
  try {
    return JSON.parse(fs.readFileSync(path.join(SRC, `${id}.json`), "utf8")) as MatchupFile;
  } catch {
    console.log(`  ${id}: 원문을 읽지 못해 건너뜀(생성 중)`);
    return undefined;
  }
}

const sourceIds = () =>
  fs
    .readdirSync(SRC)
    .filter((f) => /^[A-Za-z]+\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""));

/** 원문과 저장된 번역으로 앱이 받을 파일을 짓는다. 원문이 바뀐 칸은 싣지 않는다. */
function emit(): void {
  let files = 0;
  let sections = 0;
  let missing = 0;
  for (const id of sourceIds()) {
    const source = readSource(id);
    if (!source) continue;
    const store = readStore(id);
    const pairs: Record<string, Sections> = {};
    for (const [enemy, secs] of Object.entries(source.pairs)) {
      for (const [slot, ko] of Object.entries(secs)) {
        const hit = store.pairs[enemy]?.[slot];
        if (hit?.basis === ko) {
          (pairs[enemy] ??= {})[slot] = hit.text;
          sections += 1;
        } else missing += 1;
      }
    }
    fs.writeFileSync(path.join(SRC, `${id}.${LANG}.json`), JSON.stringify({ patch: source.patch, pairs }));
    files += 1;
  }
  console.log(`${LANG}: 파일 ${files} · 칸 ${sections} · 번역 없음 ${missing}`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--emit")) return emit();
  const ids = arg("champions")?.split(",") ?? sourceIds();
  const tasks: Array<{ me: string; jobs: Array<{ enemy: string; slot: string; ko: string }> }> = [];
  const stores = new Map<string, Store>();
  for (const me of ids) {
    const source = readSource(me);
    if (!source) continue;
    // 시험(--probe)은 저장된 번역도 새로 옮기고, 결과는 저장소가 아니라 파일에 적는다
    const store = PROBE ? { pairs: {} } : readStore(me);
    stores.set(me, store);
    const jobs = Object.entries(source.pairs).flatMap(([enemy, secs]) =>
      Object.entries(secs)
        .filter(([slot, ko]) => store.pairs[enemy]?.[slot]?.basis !== ko)
        .map(([slot, ko]) => ({ enemy, slot, ko })),
    );
    // 한 번에 BATCH 쌍어치 칸(쌍마다 칸 여러 개)을 보낸다
    for (const group of groupMatchupJobs(jobs, BATCH, MAX_BATCH_JOBS)) tasks.push({ me, jobs: group });
  }
  // --max-tasks: 시험 삼아 앞 몇 묶음만
  if (arg("max-tasks")) tasks.splice(Number(arg("max-tasks")));
  console.log(`${LANG}: 묶음 ${tasks.length}개`);
  /*
   * --export: 번역기를 부르지 않고 묶음마다 지시문을 JSONL 로 적는다. 다른 곳(Colab vLLM)에서 한꺼번에 돌린 답을
   * --import 로 받아 같은 대조를 거쳐 싣는다. 답 파일은 {"i": 묶음 번호, "text": 답} 줄이고 묶음 번호는 내보낸 파일과 같다.
   */
  if (arg("export")) {
    fs.writeFileSync(arg("export")!, tasks.map((t, i) => JSON.stringify({ i, lang: LANG, me: t.me, jobs: t.jobs, prompt: batchPrompt(t.me, t.jobs) })).join("\n") + "\n");
    console.log(`→ ${arg("export")}`);
    return;
  }
  if (arg("import")) return importReplies(arg("import")!);
  let next = 0;
  let completed = 0;
  const total = [0, 0, 0];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < tasks.length) {
        if (emptyReplies >= MAX_EMPTY) {
          throw new Error(`번역기 빈 답이 ${MAX_EMPTY}번 이어져 중단합니다.`);
        }
        const task = tasks[next++];
        const store = stores.get(task.me)!;
        const started = Date.now();
        const [k, r, m] = await translateBatch(task.me, task.jobs, store);
        if (!PROBE) writeStore(task.me, store);
        total[0] += k;
        total[1] += r;
        total[2] += m;
        completed += 1;
        if (!PROBE && EMIT_EVERY > 0 && completed % EMIT_EVERY === 0) emit();
        console.log(`${LANG} ${task.me} (${next}/${tasks.length}): 번역 ${k} · 탈락 ${r}(뜻 대조 ${m}) · ${((Date.now() - started) / 1000).toFixed(0)}초`);
      }
    }),
  );
  console.log(`\n${LANG} 번역 ${total[0]} · 탈락 ${total[1]}(뜻 대조 ${total[2]})`);
  if (PROBE) fs.writeFileSync(PROBE, JSON.stringify(probeRows, null, 1));
}

async function importReplies(file: string): Promise<void> {
  const rows = fs
    .readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { i: number; lang: string; me: string; jobs: Job[]; text: string });
  const total = [0, 0, 0];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < rows.length) {
        const row = rows[next++];
        if (row.lang !== LANG) continue;
        const store = readStore(row.me);
        const [k, r, m] = await acceptBatch(row.me, row.jobs, row.text, store);
        if (!PROBE) writeStore(row.me, store);
        total[0] += k;
        total[1] += r;
        total[2] += m;
      }
    }),
  );
  console.log(`${LANG} 들인 답 ${rows.length} · 번역 ${total[0]} · 탈락 ${total[1]}(뜻 대조 ${total[2]})`);
  if (PROBE) fs.writeFileSync(PROBE, JSON.stringify(probeRows, null, 1));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
