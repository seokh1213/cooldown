/**
 * 원자를 영어·중국어로 옮긴다 — 노트가 한국어뿐이라 두 언어 사용자는 상성 노트를 못 받았다
 *
 * 플레이북 3,700여 건이 한국어로만 있어서 영어·중국어 답은 카드에서 도출한 문장만으로
 * 지어졌다. 원자는 짧고 한 가지만 말하므로 옮기고 검수하기 쉽다.
 *
 *   1. Codex 가 챔피언마다 원자 한국어 문장을 대상 언어로 옮긴다. 스킬 이름은 그 언어 카드의
 *      이름을 쓰게 한다(목록을 준다).
 *   2. 코드가 대조한다: 원자가 부르는 스킬(skills)의 대상 언어 이름이 번역문에 있거나 슬롯
 *      문자(Q 등)로 불렸는가. 한국어 글자가 남았는가.
 *   3. Claude 가 원문과 번역의 뜻이 같은지 가린다(더함·뺌·주체·스킬 바뀜). 이름 대조만으로는
 *      뜻 왜곡을 못 잡는다(교차 검토 지적).
 *   4. 통과한 번역만 text.<lang> 에 싣는다(knowledge/atoms 를 덮어쓴다). 떨어진 원자는 다음 실행이
 *      다시 옮긴다 — 노트의 절반 미만만 옮겨지면 build-note-translations 가 노트째 빼므로 두 번 돌린다.
 *
 * 사용: npx tsx scripts/llm/translate-atoms.ts --lang en_US --champions bench|all|A,B [--model gpt-6-sol]
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { CODEX_MODEL, EVAL_CHAMPIONS, type AtomFile } from "./build-note-atoms";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const LANG = (arg("lang") ?? "en_US") as "en_US" | "zh_CN";
const CONCURRENCY = Number(arg("concurrency") ?? 3);
const LANG_NAME = { en_US: "English", zh_CN: "简体中文" };

const patch = resolvePatchVersion();
const cardsOf = (lang: string) =>
  new Map(
    (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards.map(
      (c) => [c.id, c],
    ),
  );
const koCards = cardsOf("ko_KR");
const targetCards = cardsOf(LANG);

function codex(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-tr-"));
    const out = path.join(dir, "out.txt");
    const child = spawn("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-m", CODEX_MODEL, "-C", dir, "-o", out, "-"], {
      cwd: dir,
    });
    child.stdin.end(prompt);
    child.on("close", () => {
      const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
      fs.rmSync(dir, { recursive: true, force: true });
      resolve(text);
    });
  });
}

function claude(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], { cwd: os.tmpdir() });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stdin.end(prompt);
    child.on("close", () => resolve(out));
  });
}

function jsonObject<T>(text: string): T | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    return start >= 0 && end > start ? (JSON.parse(text.slice(start, end + 1)) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function translate(id: string): Promise<[number, number, number]> {
  const file = JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile & { atoms: Array<{ text: Record<string, string> }> };
  const ko = koCards.get(id)!;
  // 이미 옮긴 원자는 두고 빠진 것만 옮긴다(검사를 고친 뒤 탈락분만 다시 돌리려고)
  const todo = file.atoms.map((_, i) => i).filter((i) => !file.atoms[i].text[LANG]);
  if (!todo.length) return [0, 0, 0];
  const target = targetCards.get(id)!;
  // 스킬 이름 대응표. 원자 속 스킬 이름을 그 언어 카드 이름으로 옮기게 한다.
  const glossary = ko.spells.map((s) => {
    const t = target.spells.find((x) => x.slot === s.slot);
    return `${s.slot}: ${s.name} → ${t?.name ?? "?"}`;
  });
  const prompt = [
    `Translate these League of Legends coaching sentences about ${target.name} from Korean to ${LANG_NAME[LANG]}.`,
    "Keep each sentence's meaning exactly: no added facts, numbers or advice, nothing dropped. Short, natural game-guide style.",
    `Champion name: ${ko.name} → ${target.name}. Ability names must use this glossary (slot: Korean → ${LANG_NAME[LANG]}):`,
    ...glossary,
    "Other champions' names: use their official names in the target language. Keep slot letters (Q, W, E, R, P) as they are.",
    'Do not read files or run commands. Reply with ONE JSON object only: {"0": "...", "1": "...", ...}',
    "",
    // 번호는 0 부터 새로 매긴다. 원자 번호(37, 52 …)를 주면 Codex 가 0 부터 다시 매겨 답해, 탈락분만 다시 옮길 때 전부 어긋났다.
    ...todo.map((i, k) => `${k}. ${file.atoms[i].text.ko}`),
  ].join("\n");
  const raw = await codex(prompt);
  if (process.env.TR_DEBUG) fs.writeFileSync(`${process.env.TR_DEBUG}/${id}-${LANG}.txt`, `${prompt}\n=====\n${raw}`);
  const result = jsonObject<Record<string, string>>(raw) ?? {};
  let kept = 0;
  let rejected = 0;
  let meaning = 0;
  const passed: Array<{ i: number; text: string }> = [];
  todo.forEach((i, k) => {
    const atom = file.atoms[i];
    const text = result[String(k)];
    const typed = atom as unknown as {
      skills: string[];
      text: Record<string, string>;
    };
    if (typeof text !== "string" || !text.trim() || /[가-힣]/.test(text)) {
      rejected += 1;
      delete typed.text[LANG];
      return;
    }
    // 원문이 이름이나 슬롯 문자로 부른 스킬은 번역문에도 대상 언어 이름이나 슬롯 문자가 있어야 한다.
    // 원문이 부르지 않은 스킬(급소처럼 기믹만 말한 패시브)까지 요구했더니 멀쩡한 번역이 떨어졌다.
    const named = (slot: string) => {
      const koName = ko.spells.find((s) => s.slot === slot)?.name.split(/\s*[/|]\s*/)[0];
      return (koName && typed.text.ko.includes(koName)) || new RegExp(`(?<![A-Za-z])${slot}(?![A-Za-z])`).test(typed.text.ko);
    };
    const missing = typed.skills.filter(named).filter((slot) => {
      const name = target.spells.find((s) => s.slot === slot)?.name;
      return !(name && text.includes(name.split(/\s*[/|]\s*/)[0])) && !new RegExp(`(?<![A-Za-z])${slot}(?![A-Za-z])`).test(text);
    });
    if (missing.length) {
      rejected += 1;
      delete typed.text[LANG];
      return;
    }
    passed.push({ i, text: text.trim() });
  });

  // 뜻 대조. 못 읽으면 한 번 더 묻고, 그래도 못 읽으면 싣지 않는다(다음 실행이 다시 옮긴다).
  const check = [
    `League of Legends coaching sentences about ${target.name}: Korean original and ${LANG_NAME[LANG]} translation. For each number answer true/false.`,
    "true only if the translation means the same thing: same subject (whose ability/action), same ability and effect pairing,",
    "nothing added (conditions, numbers, timing, conclusions) and nothing important dropped. Rewording is fine.",
    "",
    ...passed.map((p, k) => `${k}. KO: ${file.atoms[p.i].text.ko}\n   ${LANG}: ${p.text}`),
    "",
    'Reply with ONE JSON object only: {"0": true, "1": false, ...}',
  ].join("\n");
  const verdict = passed.length ? (jsonObject<Record<string, boolean>>(await claude(check)) ?? jsonObject<Record<string, boolean>>(await claude(check))) : {};
  passed.forEach((p, k) => {
    const typed = file.atoms[p.i] as unknown as {
      text: Record<string, string>;
    };
    if (verdict?.[String(k)] === true) {
      typed.text[LANG] = p.text;
      kept += 1;
    } else {
      rejected += 1;
      meaning += 1;
    }
  });
  // 옮기는 동안 원자 파일이 바뀌었을 수 있으니 다시 읽어 번역만 얹는다
  const fresh = JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as typeof file;
  const byId = new Map(file.atoms.map((a) => [(a as unknown as { id: string }).id, a.text[LANG]]));
  for (const a of fresh.atoms) {
    const t = byId.get((a as unknown as { id: string }).id);
    if (t) a.text[LANG] = t;
  }
  fs.writeFileSync(`knowledge/atoms/${id}.json`, `${JSON.stringify(fresh, null, 2)}\n`);
  return [kept, rejected, meaning];
}

/** --recheck: 뜻 대조 없이 실렸던 번역(평가 22명)을 다시 가린다. 떨어진 번역은 지워 다음 실행이 다시 옮긴다. */
async function recheck(id: string): Promise<[number, number, number]> {
  const file = JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile & { atoms: Array<{ text: Record<string, string> }> };
  const target = targetCards.get(id)!;
  const done = file.atoms.map((_, i) => i).filter((i) => file.atoms[i].text[LANG]);
  if (!done.length) return [0, 0, 0];
  const check = [
    `League of Legends coaching sentences about ${target.name}: Korean original and ${LANG_NAME[LANG]} translation. For each number answer true/false.`,
    "true only if the translation means the same thing: same subject (whose ability/action), same ability and effect pairing,",
    "nothing added (conditions, numbers, timing, conclusions) and nothing important dropped. Rewording is fine.",
    "",
    ...done.map((i, k) => `${k}. KO: ${file.atoms[i].text.ko}\n   ${LANG}: ${file.atoms[i].text[LANG]}`),
    "",
    'Reply with ONE JSON object only: {"0": true, "1": false, ...}',
  ].join("\n");
  const verdict = jsonObject<Record<string, boolean>>(await claude(check)) ?? jsonObject<Record<string, boolean>>(await claude(check));
  // 판정을 못 읽으면 건드리지 않는다
  if (!verdict) return [done.length, 0, 0];
  let dropped = 0;
  done.forEach((i, k) => {
    if (verdict[String(k)] !== true) {
      delete file.atoms[i].text[LANG];
      dropped += 1;
    }
  });
  fs.writeFileSync(`knowledge/atoms/${id}.json`, `${JSON.stringify(file, null, 2)}\n`);
  return [done.length - dropped, dropped, dropped];
}

async function main(): Promise<void> {
  const work = process.argv.includes("--recheck") ? recheck : translate;
  // --list <파일>: 쉼표나 줄바꿈으로 적은 챔피언 목록
  const listed = arg("list")
    ? fs
        .readFileSync(arg("list")!, "utf8")
        .split(/[,\s]+/)
        .filter(Boolean)
    : undefined;
  const ids =
    listed ??
    (arg("champions") === "bench"
      ? EVAL_CHAMPIONS
      : arg("champions") === "all"
        ? fs.readdirSync("knowledge/atoms").map((f) => f.replace(/\.json$/, ""))
        : (arg("champions") ?? "").split(",").filter(Boolean));
  let next = 0;
  let kept = 0;
  let rejected = 0;
  let meaning = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const [k, r, m] = await work(id);
        kept += k;
        rejected += r;
        meaning += m;
        console.log(`${LANG} ${id}: 번역 ${k} · 탈락 ${r}(뜻 대조 ${m})`);
      }
    }),
  );
  console.log(`\n${LANG} 번역 ${kept} · 탈락 ${rejected}(뜻 대조 ${meaning})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
