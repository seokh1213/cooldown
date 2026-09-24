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
 * 사용: npx tsx scripts/llm/translate-matchups.ts --lang en_US [--champions A,B] [--concurrency 2] [--batch 4]
 *       npx tsx scripts/llm/translate-matchups.ts --lang en_US --emit
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { CODEX_MODEL } from "./build-note-atoms";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const LANG = (arg("lang") ?? "en_US") as "en_US" | "zh_CN";
const CONCURRENCY = Number(arg("concurrency") ?? 2);
const BATCH = Number(arg("batch") ?? 4);
const LANG_NAME = { en_US: "English", zh_CN: "简体中文" };

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const SRC = arg("src") ?? path.join(llmDir, "matchups");
const STORE = path.join("knowledge", "matchup-translations", LANG);

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

function spawnText(cmd: string, args: string[], input: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stdin.end(input);
    child.on("close", () => resolve(out));
  });
}

async function codex(prompt: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mu-"));
  const out = path.join(dir, "out.txt");
  await spawnText("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-m", CODEX_MODEL, "-C", dir, "-o", out, "-"], prompt, dir);
  const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return text;
}

const claude = (prompt: string) => spawnText("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], prompt, os.tmpdir());

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
  for (const id of ids) {
    const k = koCards.get(id);
    const t = targetCards.get(id);
    if (!k || !t) continue;
    if (ko.includes(k.name)) out.push({ ko: k.name, target: t.name });
    for (const s of k.spells) {
      const koName = s.name.split(/\s*[/|]\s*/)[0];
      const tName = t.spells.find((x) => x.slot === s.slot)?.name.split(/\s*[/|]\s*/)[0];
      if (tName && koName.length >= 2 && ko.includes(koName)) out.push({ ko: koName, target: tName });
    }
  }
  let rest = ko;
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

async function translateBatch(me: string, jobs: Array<{ enemy: string; slot: string; ko: string }>, store: Store): Promise<[number, number, number]> {
  const ids = [me, ...new Set(jobs.map((j) => j.enemy))];
  const glossary = new Map<string, string>();
  for (const j of jobs) for (const n of namesIn(j.ko, [me, j.enemy])) glossary.set(n.ko, n.target);
  const prompt = [
    `Translate these League of Legends matchup coaching paragraphs from Korean to ${LANG_NAME[LANG]}. The player plays ${targetCards.get(me)?.name}.`,
    "Keep the meaning exactly: every fact, condition, timing and advice stays; add nothing. Natural, concise game-guide style.",
    'Abilities are written as "<champion> <slot> <ability name>" (e.g. "Rumble E Electro-Harpoon"); keep that form with the slot letter.',
    `Use exactly these names (Korean → ${LANG_NAME[LANG]}):`,
    ...[...glossary].map(([k, t]) => `${k} → ${t}`),
    ...ids.map((id) => `${koCards.get(id)?.name} → ${targetCards.get(id)?.name}`),
    'Do not read files or run commands. Reply with ONE JSON object only: {"0": "...", "1": "...", ...}',
    "",
    ...jobs.map((j, k) => `${k}. ${j.ko}`),
  ].join("\n");
  const result = jsonObject<Record<string, string>>(await codex(prompt)) ?? {};
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
  const verdict = passed.length ? (jsonObject<Record<string, boolean>>(await claude(check)) ?? jsonObject<Record<string, boolean>>(await claude(check))) : {};
  let kept = 0;
  let meaning = 0;
  passed.forEach((p, k) => {
    if (verdict?.[String(k)] === true) {
      (store.pairs[p.job.enemy] ??= {})[p.job.slot] = { basis: p.job.ko, text: p.text };
      kept += 1;
    } else {
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
    const source = JSON.parse(fs.readFileSync(path.join(SRC, `${id}.json`), "utf8")) as MatchupFile;
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
    const source = JSON.parse(fs.readFileSync(path.join(SRC, `${me}.json`), "utf8")) as MatchupFile;
    const store = readStore(me);
    stores.set(me, store);
    const jobs = Object.entries(source.pairs).flatMap(([enemy, secs]) =>
      Object.entries(secs)
        .filter(([slot, ko]) => store.pairs[enemy]?.[slot]?.basis !== ko)
        .map(([slot, ko]) => ({ enemy, slot, ko })),
    );
    // 한 번에 BATCH 쌍어치 칸(쌍마다 칸 여러 개)을 보낸다
    const byEnemy = [...new Set(jobs.map((j) => j.enemy))];
    for (let i = 0; i < byEnemy.length; i += BATCH) {
      const group = new Set(byEnemy.slice(i, i + BATCH));
      tasks.push({ me, jobs: jobs.filter((j) => group.has(j.enemy)) });
    }
  }
  // --max-tasks: 시험 삼아 앞 몇 묶음만
  if (arg("max-tasks")) tasks.splice(Number(arg("max-tasks")));
  console.log(`${LANG}: 묶음 ${tasks.length}개`);
  let next = 0;
  const total = [0, 0, 0];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        const store = stores.get(task.me)!;
        const [k, r, m] = await translateBatch(task.me, task.jobs, store);
        writeStore(task.me, store);
        total[0] += k;
        total[1] += r;
        total[2] += m;
        console.log(`${LANG} ${task.me} (${next}/${tasks.length}): 번역 ${k} · 탈락 ${r}(뜻 대조 ${m})`);
      }
    }),
  );
  console.log(`\n${LANG} 번역 ${total[0]} · 탈락 ${total[1]}(뜻 대조 ${total[2]})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
