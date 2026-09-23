/**
 * 챔피언 별명 사전을 짓는다 — Codex 가 뽑고, Claude 가 따로 거르고, 코드가 게임 용어와 대조한다
 *
 * 사람들은 챔피언을 정식 이름보다 별명으로 부른다. 狗头(나서스)·龙龟(람머스)·딩거(하이머딩거)·
 * heca(헤카림)·morde(모데카이저). 이름에서 기계적으로 만드는 줄임말로는 이것이 안 나오고,
 * 두 글자 접두사는 "모르겠어" 를 모르가나로 잡는 헛잡음을 냈다. 그래서 별명을 사전으로 둔다.
 *
 *   1. Codex 가 언어마다 챔피언 10명씩, 그 언어권 사용자가 실제로 쓰는 별명을 뽑는다.
 *      한국어는 --ko-prefixes 로 이름의 두 글자 앞부분(갱플·칼리·피들)을 기계적으로 후보에 넣는다.
 *   2. Claude 가 별명마다 모른 채 가린다: 그 챔피언을 흔히 가리키나, 일상 낱말·다른 챔피언·
 *      게임 용어와 헷갈리지 않나. 둘 다 예일 때만 남긴다.
 *   3. 코드가 아이템·룬·소환사 주문 이름과 겹치는 별명을 뺀다("惩戒" 는 강타다). 챔피언 전용 아이템
 *      이름 속 제 이름("칼리스타의 검은 창")은 먼저 지운다.
 * 여러 번 돌린 결과를 합친다(모두 Claude 거름을 거쳤다). 판마다 Codex 가 떠올리는 별명이 다르다.
 * 처음에는 (2) 를 "일상 낱말과 겹치지 않는다" 로 물었더니 狗头·狗熊·狐狸·女警·갱플·문도 같은
 * 실제 별명이 다 빠졌다(162개, 374문항 중국어 65%). 도우미 질문 안에서 읽힐 때를 묻도록 고쳤다.
 * 결과는 사람이 검토하는 원본(knowledge/champion-aliases.json)이다. build-champion-names 가 합친다.
 *
 * 사용: npx tsx scripts/llm/build-champion-aliases.ts [--only ko_KR] [--out knowledge/champion-aliases.json]
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

type Lang = "ko_KR" | "en_US" | "zh_CN";
const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const OUT = arg("out") ?? "knowledge/champion-aliases.json";
const LANGS = (arg("only") ? [arg("only")] : ["ko_KR", "en_US", "zh_CN"]) as Lang[];
const CHUNK = Number(arg("chunk") ?? 10);
const CONCURRENCY = 3;
const LANG_NAME: Record<Lang, string> = { ko_KR: "한국", en_US: "영어권(북미·유럽)", zh_CN: "중국" };

const patch = resolvePatchVersion();
const root = path.join(PUBLIC_DATA_ROOT, patch);
const read = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as T;
// champion-names.json 에는 지난번 별명까지 합쳐져 있다. 정식 이름 명단으로 쓰려면 별명을 뺀다 —
// 안 빼면 Codex 가 기존 별명을 "이미 있는 이름" 으로 보고 다시 적지 않아 재생성 때 사라진다.
const previous = fs.existsSync(OUT)
  ? new Set(
      Object.values((JSON.parse(fs.readFileSync(OUT, "utf8")) as { aliases: Record<string, Record<string, string[]>> }).aliases)
        .flatMap((byLang) => Object.values(byLang).flat())
        .map((a) => a.toLowerCase()),
    )
  : new Set<string>();
const names = Object.fromEntries(
  Object.entries(read<{ names: Record<string, string[]> }>("llm/champion-names.json").names).map(([id, list]) => [
    id,
    list.filter((n) => !previous.has(n.toLowerCase())),
  ]),
);

/** 게임 용어. 별명이 이것과 같거나 이것 안에 들어 있으면 헛잡음이 된다. */
const vocabulary = new Set<string>();
for (const lang of ["ko_KR", "en_US", "zh_CN"]) {
  for (const i of read<{ items: Array<{ name: string }> }>(`items-normalized-${lang}.json`).items) vocabulary.add(i.name.toLowerCase());
  for (const r of read<{ runes: Array<{ name: string }> }>(`runes-normalized-${lang}.json`).runes) vocabulary.add(r.name.toLowerCase());
  for (const s of read<{ spells: Array<{ name: string }> }>(`summoner-normalized-${lang}.json`).spells) vocabulary.add(s.name.toLowerCase());
}
/*
 * 게임 용어 안의 챔피언 이름은 먼저 지운다. "칼리스타의 검은 창" 처럼 챔피언 전용 아이템 이름에
 * 제 이름이 들어 있어, 안 지우면 "칼리" 가 제 이름 때문에 게임 용어로 판정돼 빠졌다.
 */
let scrubbed: string[] | undefined;
const clashesWithVocabulary = (alias: string): boolean => {
  const key = alias.toLowerCase();
  scrubbed ??= (() => {
    const official = Object.values(names).flat().filter((n) => n.length >= 2).map((n) => n.toLowerCase()).sort((a, b) => b.length - a.length);
    return [...vocabulary].map((word) => official.reduce((w, n) => w.split(n).join(" "), word));
  })();
  if (scrubbed.includes(key)) return true;
  // 한자·한글 별명이 게임 용어 안에 통째로 들어 있으면 그 용어를 말할 때 잡힌다
  if (!/^[ -~]+$/.test(alias)) return scrubbed.some((word) => word.includes(key));
  return false;
};

function run(cmd: string, args: string[], input: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stdin.end(input);
    child.on("close", () => resolve(out));
  });
}

async function codex(prompt: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-alias-"));
  const out = path.join(dir, "out.txt");
  await run("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-C", dir, "-o", out, "-"], prompt, dir);
  const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return text;
}

const claude = (prompt: string) => run("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], prompt, os.tmpdir());

function jsonObject<T>(text: string): T | undefined {
  const match = /\{[\s\S]*\}/.exec(text);
  try {
    return match ? (JSON.parse(match[0]) as T) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 한국어 이름의 두 글자 앞부분(갱플·문도·칼리·아트). 한국 사용자가 가장 흔히 쓰는 별명 꼴인데
 * Codex 가 잘 떠올리지 못했다. 기계적으로 후보를 내고 Claude 가 거른다 — 모르(모르가나)·아무(아무무)
 * 처럼 별명이 아닌 것은 여기서 떨어진다.
 */
function koPrefixCandidates(ids: string[]): Record<string, string[]> {
  const koName = (id: string) => names[id].find((n) => /[가-힣]/.test(n)) ?? "";
  const owners = new Map<string, string[]>();
  for (const id of Object.keys(names)) {
    const compact = koName(id).replace(/\s+/g, "");
    if (compact.length < 3) continue;
    const prefix = compact.slice(0, 2);
    owners.set(prefix, [...(owners.get(prefix) ?? []), id]);
  }
  const out: Record<string, string[]> = {};
  for (const [prefix, list] of owners) if (list.length === 1 && ids.includes(list[0])) (out[list[0]] ??= []).push(prefix);
  return out;
}

async function chunkAliases(lang: Lang, ids: string[]): Promise<Record<string, string[]>> {
  const roster = ids.map((id) => `${id}: ${names[id].join(" / ")}`).join("\n");
  const drafted = process.argv.includes("--ko-prefixes")
    ? koPrefixCandidates(ids)
    :     jsonObject<Record<string, string[]>>(
      await codex(
        [
          `리그 오브 레전드 ${LANG_NAME[lang]} 사용자가 채팅·커뮤니티에서 아래 챔피언을 부를 때 실제로 흔히 쓰는 별명·줄임말을 적어라.`,
          "- 정식 이름(아래에 적힌 것)은 다시 적지 않는다. 그 언어권에서 흔히 쓰는 별명을 챔피언마다 빠짐없이(보통 1~4개). 없으면 빈 배열.",
          "- 거르는 일은 뒤에서 따로 한다. 흔히 쓰는데 일상어와 겹칠까 봐 빼지는 말 것(예: 狗头, 狐狸, 女警, 船长, 갱플, 문도, blitz, eve).",
          "- 한 글자 별명, 다른 챔피언·아이템·룬·소환사 주문 이름과 같은 것은 적지 않는다.",
          lang === "zh_CN" ? "- 중국어 별명(예: 狗头, 龙龟, 男刀)과 흔한 음역 줄임." : lang === "en_US" ? "- 영어 줄임(예: heca, morde, TF, GP, J4). 대소문자는 신경 쓰지 않는다." : "- 한국어 줄임(예: 말파, 모데, 트페, 딩거, 블츠).",
          "파일을 읽거나 명령을 실행하지 말고, JSON 하나로만 답한다: {\"챔피언id\": [\"별명\", …], …}",
          "",
          roster,
        ].join("\n"),
      ),
    ) ?? {};
  const pairs = Object.entries(drafted as Record<string, string[]>).flatMap(([id, list]) =>
    ids.includes(id) && Array.isArray(list) ? list.filter((a) => typeof a === "string" && a.trim().length >= 2).map((a) => ({ id, alias: a.trim() })) : [],
  );
  if (!pairs.length) return {};
  // 응답을 못 읽으면 그 묶음이 통째로 빠진다. 한 번 더 묻는다.
  const ask = async () =>
    jsonObject<Record<string, boolean>>(
      await claude(
        [
          `리그 오브 레전드 ${LANG_NAME[lang]} 사용자의 챔피언 별명 후보를 검토하라. 번호마다 true 또는 false.`,
          "true 는 두 조건을 모두 만족할 때만: (1) 이 별명이 그 챔피언을 흔히 가리킨다. (2) **롤 도우미에 들어온 질문 문장 안에서** 이 말이 나오면 그 챔피언으로 읽는 것이 자연스럽다.",
          "일상어로도 쓰이는 말(예: 狗头, 船长)이어도 롤 질문 맥락에서 그 챔피언을 뜻하면 true. 다른 챔피언·아이템·룬·소환사 주문·게임 용어(오브젝트·시스템)와 헷갈리면 false.",
          "확실하지 않으면 false.",
          "",
          ...pairs.map((p, i) => `${i}. ${p.alias} → ${p.id} (${names[p.id].join(" / ")})`),
          "",
          'JSON 하나로만 답한다: {"0": true, "1": false, …}',
        ].join("\n"),
      ),
    );
  const verdicts = (await ask()) ?? (await ask()) ?? {};
  if (!Object.keys(verdicts).length) console.log(`  ! ${lang} ${ids[0]}… 판정을 못 읽음`);
  const out: Record<string, string[]> = {};
  pairs.forEach((p, i) => {
    if (verdicts[String(i)] !== true || clashesWithVocabulary(p.alias)) return;
    (out[p.id] ??= []).push(p.alias);
  });
  return out;
}

async function main(): Promise<void> {
  const ids = Object.keys(names).sort();
  const jobs = LANGS.flatMap((lang) => Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, i) => ({ lang, ids: ids.slice(i * CHUNK, (i + 1) * CHUNK) })));
  const existing = fs.existsSync(OUT) ? (JSON.parse(fs.readFileSync(OUT, "utf8")) as { aliases: Record<string, Partial<Record<Lang, string[]>>> }).aliases : {};
  const aliases: Record<string, Partial<Record<Lang, string[]>>> = existing;
  // 지난 판과 합친다. 판마다 Codex 가 떠올리는 별명이 달라 합집합이 더 넓다(모두 Claude 거름을 거쳤다).
  let next = 0;
  let kept = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const result = await chunkAliases(job.lang, job.ids);
        for (const [id, list] of Object.entries(result)) {
          const slot = (aliases[id] ??= {});
          slot[job.lang] = [...new Set([...(slot[job.lang] ?? []), ...list])];
          kept += list.length;
        }
        console.log(`${job.lang} ${job.ids[0]}… 별명 ${Object.values(result).flat().length}`);
      }
    }),
  );
  const sorted = Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(
    OUT,
    `${JSON.stringify({ note: "사람이 검토하는 원본. build-champion-aliases.ts 가 짓고 build-champion-names.ts 가 합친다.", aliases: sorted }, null, 2)}\n`,
  );
  console.log(`\n별명 ${kept}개 → ${OUT}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
