/**
 * 노트 번역 다듬기 — 원자 번역을 이어 붙인 글을 노트 한 편의 자연스러운 글로 옮긴다
 *
 * build-note-translations 는 같은 노트의 번역 원자를 이어 붙인다. 사실은 맞지만 원자마다 주어를
 * 다시 세워 "Jinx's passive also activates …" 가 세 번 되풀이되는 식으로 읽기가 거칠었다.
 *
 *   1. Codex 가 챔피언마다 노트 원문(한국어)과 이어 붙인 번역을 받아, 노트마다 한 편으로 옮긴다.
 *      스킬 이름은 그 언어 카드 이름을 쓴다(대응표).
 *   2. 코드가 대조한다: 한국어 글자가 남지 않았나, 이어 붙인 번역에 있던 슬롯 문자·스킬 이름이
 *      다듬은 글에도 있나, 길이가 이어 붙인 글의 절반~1.5배 안인가.
 *   3. Claude 가 다듬은 글이 원문·원자 번역과 뜻이 같은지 가린다(더함·뺌·주체·스킬 짝).
 *   4. 통과한 글만 knowledge/note-translations/<lang>.json 에 basis(이어 붙인 글)와 함께 싣는다.
 *      원자를 다시 지어 이어 붙인 글이 바뀌면 build-note-translations 가 다듬은 글을 쓰지 않는다.
 *
 * 사용: npx tsx scripts/llm/polish-note-translations.ts --lang en_US [--champions A,B] [--concurrency 2]
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { CODEX_MODEL, type AtomFile } from "./build-note-atoms";
import { joinedNotes } from "./build-note-translations";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const LANG = (arg("lang") ?? "en_US") as "en_US" | "zh_CN";
// 옆 세션이 Codex 를 동시 6 으로 쓰는 중이라 기본을 낮춘다
const CONCURRENCY = Number(arg("concurrency") ?? 2);
const LANG_NAME = { en_US: "English", zh_CN: "简体中文" };
const STORE = path.join("knowledge", "note-translations", `${LANG}.json`);

export interface PolishedStore {
  lang: string;
  notes: Record<string, { basis: string; text: string }>;
}

const patch = resolvePatchVersion();
const cardsOf = (lang: string) =>
  new Map(
    (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards.map(
      (c) => [c.id, c],
    ),
  );
const koCards = cardsOf("ko_KR");
const targetCards = cardsOf(LANG);

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-polish-"));
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

/** 이어 붙인 글에 있던 슬롯 문자·스킬 이름이 다듬은 글에서 사라졌나 */
function lostNames(joined: string, polished: string, card: ChampionCard): string[] {
  const names = card.spells.flatMap((s) => s.name.split(/\s*[/|]\s*/)).filter((n) => n.length >= 3);
  const slots = ["P", "Q", "W", "E", "R"].filter((s) => new RegExp(`(?<![A-Za-z])${s}(?![A-Za-z])`).test(joined));
  return [
    ...names.filter((n) => joined.includes(n) && !polished.includes(n)),
    ...slots.filter((s) => !new RegExp(`(?<![A-Za-z])${s}(?![A-Za-z])`).test(polished)),
  ];
}

async function polish(id: string, joined: Map<string, string>, store: PolishedStore): Promise<[number, number, number]> {
  const book = JSON.parse(fs.readFileSync(`knowledge/playbooks/${id}.json`, "utf8")) as Playbook;
  const ko = koCards.get(id)!;
  const target = targetCards.get(id)!;
  // 원자 하나짜리 노트는 이어 붙인 것이 아니라 다듬을 것이 없다. 이미 다듬었고 바탕이 그대로면 건너뛴다.
  const atomsOf = (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile).atoms;
  const count = (noteId: string) => atomsOf.filter((a) => a.source === `playbook:${noteId}` && a.text[LANG]).length;
  const todo = [...book.playing, ...book.against].filter(
    (n): n is typeof n & { id: string } => !!n.id && !!n.text && joined.has(n.id) && count(n.id) >= 2 && store.notes[n.id]?.basis !== joined.get(n.id),
  );
  if (!todo.length) return [0, 0, 0];
  const glossary = ko.spells.map((s) => `${s.slot}: ${s.name} → ${target.spells.find((x) => x.slot === s.slot)?.name ?? "?"}`);
  const prompt = [
    `League of Legends coaching notes about ${target.name}. Each note has the Korean original and a sentence-by-sentence ${LANG_NAME[LANG]} translation.`,
    `Rewrite each translation as ONE natural ${LANG_NAME[LANG]} paragraph, as a game guide would write it: no repeated subjects or openers, sentences joined where natural.`,
    "Keep the meaning exactly: every fact, condition, timing and advice in the translation stays; add nothing that is not in the Korean original.",
    `Champion name: ${ko.name} → ${target.name}. Ability names must follow this glossary (slot: Korean → ${LANG_NAME[LANG]}), and keep slot letters (Q, W, E, R, P) where the translation uses them:`,
    ...glossary,
    'Do not read files or run commands. Reply with ONE JSON object only: {"0": "...", "1": "...", ...}',
    "",
    ...todo.flatMap((n, k) => [`${k}. KO: ${n.text}`, `   ${LANG}: ${joined.get(n.id)}`]),
  ].join("\n");
  const result = jsonObject<Record<string, string>>(await codex(prompt)) ?? {};
  let rejected = 0;
  const passed: Array<{ id: string; ko: string; basis: string; text: string }> = [];
  todo.forEach((n, k) => {
    const text = result[String(k)]?.trim();
    const basis = joined.get(n.id)!;
    const ratio = text ? text.length / basis.length : 0;
    if (!text || /[가-힣]/.test(text) || ratio < 0.5 || ratio > 1.5 || lostNames(basis, text, target).length) {
      rejected += 1;
      return;
    }
    passed.push({ id: n.id, ko: n.text, basis, text });
  });
  const check = [
    `League of Legends coaching notes about ${target.name}. For each number: the Korean original, the sentence-by-sentence ${LANG_NAME[LANG]} translation (checked), and a rewritten version.`,
    "Answer true only if the rewritten version means the same as the checked translation: same subject (whose ability/action), same ability and effect pairing,",
    "no fact, condition, timing or advice dropped, nothing added that is not in the Korean original. Smoother wording is fine.",
    "",
    ...passed.flatMap((p, k) => [`${k}. KO: ${p.ko}`, `   CHECKED: ${p.basis}`, `   REWRITTEN: ${p.text}`]),
    "",
    'Reply with ONE JSON object only: {"0": true, "1": false, ...}',
  ].join("\n");
  const verdict = passed.length ? (jsonObject<Record<string, boolean>>(await claude(check)) ?? jsonObject<Record<string, boolean>>(await claude(check))) : {};
  let kept = 0;
  let meaning = 0;
  passed.forEach((p, k) => {
    if (verdict?.[String(k)] === true) {
      store.notes[p.id] = { basis: p.basis, text: p.text };
      kept += 1;
    } else {
      rejected += 1;
      meaning += 1;
    }
  });
  return [kept, rejected, meaning];
}

async function main(): Promise<void> {
  const joined = new Map(Object.entries(joinedNotes(LANG).notes));
  const store: PolishedStore = fs.existsSync(STORE) ? (JSON.parse(fs.readFileSync(STORE, "utf8")) as PolishedStore) : { lang: LANG, notes: {} };
  const ids = arg("champions")?.split(",") ?? fs.readdirSync("knowledge/atoms").map((f) => f.replace(/\.json$/, ""));
  fs.mkdirSync(path.dirname(STORE), { recursive: true });
  const save = () => {
    // 노트 id 순으로 적어 diff 가 흔들리지 않게 한다
    const notes = Object.fromEntries(Object.entries(store.notes).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(STORE, `${JSON.stringify({ lang: LANG, notes }, null, 2)}\n`);
  };
  let next = 0;
  const total = [0, 0, 0];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const [k, r, m] = await polish(id, joined, store);
        total[0] += k;
        total[1] += r;
        total[2] += m;
        save();
        console.log(`${LANG} ${id}: 다듬음 ${k} · 탈락 ${r}(뜻 대조 ${m})`);
      }
    }),
  );
  console.log(`\n${LANG} 다듬음 ${total[0]} · 탈락 ${total[1]}(뜻 대조 ${total[2]}) · 저장 ${Object.keys(store.notes).length}건`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
