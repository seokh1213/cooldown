/**
 * 지식 카드 다국어 번역 — 내보내기와 합치기
 *
 * 지식 카드는 한국어로만 쓰여 있다. 영어·중국어 화면에서 물어보면 근거가 한국어로 나온다.
 *
 * **번역은 모델에 맡기지 않는다.** 판정 규칙을 gemma4:e4b 로 옮겼더니 tick 을 "박자",
 * Press the Attack 을 "공격대" 로 냈다. 카드도 화면에 그대로 나가는 글이라 사정이 같다.
 * 그래서 이 스크립트는 번역하지 않는다. 옮길 거리를 꺼내 주고, 옮긴 결과를 받아 검사한다.
 *
 * 챔피언·스킬·아이템 이름은 짐작하지 않는다. 정적 데이터에서 대응표를 뽑아 함께 넘긴다.
 *
 * 사용:
 *   npm run llm:tr-knowledge -- --export en_US        # 작업 파일 생성
 *   npm run llm:tr-knowledge -- --merge en_US         # 결과 취합 + 검사
 *   npm run llm:tr-knowledge -- --status en_US        # 진행 상황만
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

export type TargetLang = "en_US" | "zh_CN";

const WORK_ROOT = path.resolve(process.cwd(), "research", "knowledge-translation");
const OUT_ROOT = path.resolve(process.cwd(), "knowledge", "translations");

/** 한국어 원문이 바뀌면 번역도 다시 봐야 한다. 짧은 해시로 표시해 둔다. */
const sourceHash = (text: string) =>
  crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);

interface Entry {
  id: string;
  category: string;
  side: "playing" | "against";
  ko: string;
}

export interface TranslationFile {
  schemaVersion: 1;
  lang: TargetLang;
  /** 항목 id → { h: 원문 해시, t: 번역문 } */
  entries: Record<string, { h: string; t: string }>;
}

function loadEntries(): Map<string, Entry[]> {
  const patch = resolvePatchVersion();
  const file = path.join(PUBLIC_DATA_ROOT, patch, "llm", "advisor-knowledge.json");
  if (!fs.existsSync(file)) throw new Error("번들이 없다. npm run llm:bundle 을 먼저 돌려라");
  const bundle = JSON.parse(fs.readFileSync(file, "utf8")) as {
    playbooks: Record<string, { playing?: Entry[]; against?: Entry[] }>;
  };
  const byChampion = new Map<string, Entry[]>();
  for (const [champion, book] of Object.entries(bundle.playbooks)) {
    const list: Entry[] = [];
    for (const side of ["playing", "against"] as const) {
      for (const e of (book[side] ?? []) as Array<Entry & { text: string }>) {
        list.push({ id: e.id, category: e.category, side, ko: e.text });
      }
    }
    if (list.length) byChampion.set(champion, list);
  }
  return byChampion;
}

/** 챔피언·스킬·아이템·룬 이름 대응. 옮기는 쪽이 짐작하지 않도록 함께 넘긴다. */
function nameMap(lang: TargetLang): Record<string, string> {
  const ko = loadStaticData("ko_KR");
  const other = loadStaticData(lang);
  const map: Record<string, string> = {};
  const otherChampions = new Map(other.champions.map((c) => [c.id, c]));
  for (const champion of ko.champions) {
    const match = otherChampions.get(champion.id);
    if (!match) continue;
    map[champion.name] = match.name;
    const koAbilities = champion.abilities as Record<string, { name?: string }>;
    const otherAbilities = match.abilities as Record<string, { name?: string }>;
    for (const slot of Object.keys(koAbilities)) {
      const from = koAbilities[slot]?.name;
      const to = otherAbilities[slot]?.name;
      if (from && to) map[from] = to;
    }
  }
  const pairs: Array<[Array<{ id: string; name: string }>, Array<{ id: string; name: string }>]> = [
    [ko.items.items, other.items.items],
    [ko.runes.runes, other.runes.runes],
    [ko.summoners.spells, other.summoners.spells],
  ];
  for (const [source, target] of pairs) {
    const byId = new Map(target.map((x) => [x.id, x.name]));
    for (const x of source) if (byId.has(x.id)) map[x.name] = byId.get(x.id)!;
  }
  return map;
}

function outFile(lang: TargetLang): string {
  return path.join(OUT_ROOT, `${lang}.json`);
}

function loadTranslations(lang: TargetLang): TranslationFile {
  const file = outFile(lang);
  if (!fs.existsSync(file)) return { schemaVersion: 1, lang, entries: {} };
  return JSON.parse(fs.readFileSync(file, "utf8")) as TranslationFile;
}

function exportJobs(lang: TargetLang, perJob: number): void {
  const byChampion = loadEntries();
  const existing = loadTranslations(lang).entries;
  const dir = path.join(WORK_ROOT, lang);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(
    path.join(dir, "names.json"),
    `${JSON.stringify(nameMap(lang), null, 1)}\n`,
    "utf8",
  );

  const champions = [...byChampion.keys()].sort();
  let job = 0;
  let pending = 0;
  let batch: Array<{ champion: string; entries: Entry[] }> = [];
  const flush = () => {
    if (!batch.length) return;
    job += 1;
    const name = `job-${String(job).padStart(3, "0")}.json`;
    fs.writeFileSync(path.join(dir, name), `${JSON.stringify({ lang, champions: batch }, null, 1)}\n`, "utf8");
    batch = [];
  };

  for (const champion of champions) {
    // 원문이 그대로면 이미 옮긴 것을 다시 시키지 않는다
    const entries = byChampion
      .get(champion)!
      .filter((e) => existing[e.id]?.h !== sourceHash(e.ko));
    if (!entries.length) continue;
    batch.push({ champion, entries });
    pending += entries.length;
    if (batch.reduce((n, b) => n + b.entries.length, 0) >= perJob) flush();
  }
  flush();

  console.log(`${lang}: 옮길 항목 ${pending}건 / 작업 파일 ${job}개`);
  console.log(`위치: ${path.relative(process.cwd(), dir)}`);
}

/** 번역이 원문의 뜻을 잃지 않았는지 기계적으로 확인할 수 있는 것만 본다. */
function checkEntry(ko: string, translated: string, lang: TargetLang): string | undefined {
  if (!translated.trim()) return "비어 있음";
  if (/[가-힣]/.test(translated)) return "한국어가 남아 있음";
  if (lang === "en_US" && /[一-鿿]/.test(translated)) return "한자가 섞여 있음";
  // 스킬 슬롯 표기는 그대로 남아야 한다. Q/W/E/R 이 사라지면 무슨 스킬인지 알 수 없다.
  for (const slot of ["Q", "W", "E", "R"]) {
    const inKo = (ko.match(new RegExp(`\\b${slot}\\b`, "g")) ?? []).length;
    if (inKo && !new RegExp(`\\b${slot}\\b`).test(translated)) return `${slot} 표기 누락`;
  }
  // 수치가 사라지면 조언이 달라진다
  const numbers = [...ko.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
  const missing = numbers.filter((n) => !translated.includes(n));
  if (missing.length) return `수치 누락: ${missing.join(", ")}`;
  return undefined;
}

function merge(lang: TargetLang): void {
  const byChampion = loadEntries();
  const koById = new Map<string, string>();
  for (const list of byChampion.values()) for (const e of list) koById.set(e.id, e.ko);

  const dir = path.join(WORK_ROOT, lang);
  const done = loadTranslations(lang);
  const problems: string[] = [];
  let added = 0;

  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => /^job-\d+\.done\.json$/.test(f)).sort()
    : [];
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as {
      entries: Record<string, string>;
    };
    for (const [id, text] of Object.entries(parsed.entries ?? {})) {
      const ko = koById.get(id);
      if (!ko) {
        problems.push(`${file}: 없는 항목 id ${id}`);
        continue;
      }
      const issue = checkEntry(ko, text, lang);
      if (issue) {
        problems.push(`${file}: ${id} — ${issue}`);
        continue;
      }
      done.entries[id] = { h: sourceHash(ko), t: text.trim() };
      added += 1;
    }
  }

  fs.mkdirSync(OUT_ROOT, { recursive: true });
  fs.writeFileSync(outFile(lang), `${JSON.stringify(done, null, 1)}\n`, "utf8");

  const total = koById.size;
  const covered = [...koById].filter(([id, ko]) => done.entries[id]?.h === sourceHash(ko)).length;
  console.log(`${lang}: 새로 반영 ${added}건 / 완료 ${covered}/${total}건`);
  if (problems.length) {
    console.log(`\n검사 실패 ${problems.length}건:`);
    for (const p of problems.slice(0, 40)) console.log(`  ${p}`);
    process.exitCode = 1;
  }
}

function status(lang: TargetLang): void {
  const byChampion = loadEntries();
  const done = loadTranslations(lang).entries;
  let total = 0;
  let covered = 0;
  const missing: string[] = [];
  for (const [champion, list] of byChampion) {
    const n = list.filter((e) => done[e.id]?.h === sourceHash(e.ko)).length;
    total += list.length;
    covered += n;
    if (n < list.length) missing.push(`${champion} ${n}/${list.length}`);
  }
  console.log(`${lang}: ${covered}/${total}건 (${((covered / total) * 100).toFixed(1)}%)`);
  if (missing.length) console.log(`남은 챔피언 ${missing.length}종: ${missing.slice(0, 12).join(", ")}`);
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const perJob = Number(get("--per-job") ?? 150);
  const lang = (get("--export") ?? get("--merge") ?? get("--status")) as TargetLang | undefined;
  if (!lang || !["en_US", "zh_CN"].includes(lang)) {
    throw new Error("언어를 지정해라: --export|--merge|--status en_US|zh_CN");
  }
  if (argv.includes("--export")) exportJobs(lang, perJob);
  else if (argv.includes("--merge")) merge(lang);
  else status(lang);
}

main();
