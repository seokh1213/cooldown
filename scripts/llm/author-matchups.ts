/**
 * 매치업 조언 저술 — 작업거리 내보내기와 결과 취합
 *
 * 사전 생성한 매치업 답변은 브라우저에 그대로 실려 화면에 나간다. 저술물이지 계산물이 아니다.
 * 그런데 이것을 gemma4:e2b 에 맡기고 있었다. 규칙 번역을 e4b 에 맡겼다가 tick 을 "박자" 로
 * 낸 것과 같은 실수다. 작은 모델은 문장을 만들 뿐 판단하지 않는다.
 *
 * **그래서 이 스크립트는 글을 쓰지 않는다.** 코드가 확정한 구간과 근거를 모아 작업 파일로 내주고,
 * 사람이 쓴 결과를 받아 검사한 뒤 배포 형태로 합친다.
 *
 * 코드가 확정하는 구간(아이템·룬·선마·치유 감소·위협 순서)은 그대로 코드가 만든다.
 * 저술이 필요한 것은 서술 구간뿐이다.
 *
 * 사용:
 *   npm run llm:author -- --export --per-job 12       # 작업 파일 생성 (표본 큰 순서)
 *   npm run llm:author -- --merge                     # 결과 취합 + 검사 + 배포 파일 생성
 *   npm run llm:author -- --status
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT } from "./lib/data";
import { loadOracleBundle } from "./lib/oracle";
import { renderDecidedSections, buildSections } from "./lib/prompt";
import { buildMatchupContext } from "./matchup-cli";

const WORK_ROOT = path.resolve(process.cwd(), "research", "matchup-authoring");
const LIST_FILE = path.resolve(process.cwd(), "knowledge", "matchup-list.json");

interface Target {
  me: string;
  enemy: string;
  lane: string;
}

/** 작업 파일에 담기는 한 건. 저술자가 이것만 보고 쓸 수 있어야 한다. */
interface Job {
  key: string;
  me: string;
  enemy: string;
  lane: string;
  meName: string;
  enemyName: string;
  /** 코드가 확정한 구간. 저술자는 이것을 다시 쓰지 않는다. */
  decided: string;
  /** 저술에 필요한 근거. 사실 카드, 지식 카드, 통계가 들어 있다. */
  briefs: Array<{ id: string; title: string; brief: string }>;
}

export interface AuthoredSections {
  [key: string]: Array<{ id: string; title: string; text: string }>;
}

function matchupKey(t: Target): string {
  return `${t.lane}/${t.me}-vs-${t.enemy}`;
}

function outPath(t: Target, patch: string): string {
  return path.join(PUBLIC_DATA_ROOT, patch, "llm", "matchups", t.lane, `${t.me}-vs-${t.enemy}.json`);
}

/**
 * 표본이 큰 순서로 정렬한다.
 *
 * 4072건을 한 번에 다 쓸 수는 없다. 앞에서부터 쓰면 어디서 멈추든 많이 하는 조합이 먼저 채워진다.
 */
function rankTargets(targets: Target[]): Target[] {
  const oracle = loadOracleBundle();
  const games = new Map<string, number>();
  if (oracle) {
    for (const champion of oracle.byChampion.values()) {
      for (const lane of champion.lanes) {
        games.set(`${lane.lane}/${champion.id}`, lane.games ?? 0);
      }
    }
  }
  const weight = (t: Target) =>
    (games.get(`${t.lane}/${t.me}`) ?? 0) + (games.get(`${t.lane}/${t.enemy}`) ?? 0);
  return [...targets].sort((a, b) => weight(b) - weight(a));
}

function buildJob(target: Target): Job | undefined {
  const { ctx } = buildMatchupContext({
    me: target.me,
    enemy: target.enemy,
    lane: target.lane,
    lang: "ko_KR",
    compact: true,
    curated: true,
    profile: "web",
  });
  const knowledge = (ctx.playbook?.mine.length ?? 0) + (ctx.playbook?.vsEnemy.length ?? 0) + ctx.tips.length;
  if (knowledge === 0) return undefined;

  // 프롬프트의 사용자 메시지에 근거가 모두 들어 있다. 저술자에게는 그것만 있으면 된다.
  const briefs = buildSections(ctx).map((section) => ({
    id: section.id,
    title: section.title,
    brief: section.messages.map((m) => m.content).join("\n\n"),
  }));

  return {
    key: matchupKey(target),
    me: ctx.me.id,
    enemy: ctx.enemy.id,
    lane: target.lane,
    meName: ctx.me.name,
    enemyName: ctx.enemy.name,
    decided: renderDecidedSections(ctx),
    briefs,
  };
}

function exportJobs(perJob: number, limit?: number): void {
  const list = JSON.parse(fs.readFileSync(LIST_FILE, "utf8")) as { matchups: Target[] };
  const ranked = rankTargets(list.matchups);
  const patch = loadStaticData("ko_KR").patch;

  fs.rmSync(WORK_ROOT, { recursive: true, force: true });
  fs.mkdirSync(WORK_ROOT, { recursive: true });

  let job = 0;
  let made = 0;
  let skipped = 0;
  let batch: Job[] = [];
  const flush = () => {
    if (!batch.length) return;
    job += 1;
    const name = `job-${String(job).padStart(4, "0")}.json`;
    fs.writeFileSync(path.join(WORK_ROOT, name), `${JSON.stringify({ patch, matchups: batch }, null, 1)}\n`, "utf8");
    batch = [];
  };

  for (const target of ranked) {
    if (limit && made >= limit) break;
    const built = buildJob(target);
    if (!built) {
      skipped += 1;
      continue;
    }
    batch.push(built);
    made += 1;
    if (batch.length >= perJob) flush();
  }
  flush();

  console.log(`작업 ${made}건 / 파일 ${job}개 (지식 카드 부재로 제외 ${skipped}건)`);
  console.log(`위치: ${path.relative(process.cwd(), WORK_ROOT)}`);
  console.log(`배포 대상 패치: ${patch}`);
}

/**
 * 협곡에서 살 수 없는 아이템, 주체가 뒤바뀐 서술을 걸러낸다.
 *
 * 이름이 룬과 겹치는 경우는 빼야 한다. 과잉성장은 룬이면서 상점에 없는 내부 아이템 id 로도
 * 존재해서, 정상적인 룬 추천이 전부 오탐으로 잡혔다.
 */
function checkText(
  text: string,
  job: Job,
  riftItems: Set<string>,
  otherModeItems: Set<string>,
  runeNames: Set<string>,
): string[] {
  const issues: string[] = [];
  // 근거에 이미 나오는 낱말은 지어낸 것이 아니다. 이 검사는 없는 아이템을 만들어 내는 것을
  // 잡으려는 것이지, 이름이 겹쳤다고 저술을 막으려는 것이 아니다.
  // lol.ps 지표 이름 "포탑 방패" 가 비협곡 아이템 이름과 겹쳐 실제로 정상 서술이 막혔다.
  const evidence = job.briefs.map((b) => b.brief).join("\n");
  for (const name of otherModeItems) {
    if (riftItems.has(name) || runeNames.has(name) || evidence.includes(name)) continue;
    if (name.length >= 3 && text.includes(name)) issues.push(`협곡에 없는 아이템: ${name}`);
  }
  // "조심할 스킬" 구간에 내 챔피언이 주어로 나오면 주체가 뒤바뀐 것이다
  const threat = /## 조심할 스킬\n([\s\S]*?)(?=\n## |$)/.exec(text);
  if (threat && threat[1].includes(`[${job.meName}]`)) {
    issues.push(`조심할 스킬 구간의 주체가 ${job.meName}(자신)으로 되어 있음`);
  }
  if (!text.includes(job.enemyName)) issues.push(`상대 ${job.enemyName} 미언급`);
  return issues;
}

function merge(): void {
  const data = loadStaticData("ko_KR");
  const riftItems = new Set(
    data.items.items
      .filter((i) => i.availableOnMap11 && i.purchasable !== false && i.inStore !== false)
      .map((i) => i.name),
  );
  const otherModeItems = new Set(data.items.items.map((i) => i.name));
  const runeNames = new Set([
    ...data.runes.runes.map((r) => r.name),
    ...data.runes.statShards.map((s) => s.name),
  ]);

  const jobFiles = fs.existsSync(WORK_ROOT)
    ? fs.readdirSync(WORK_ROOT).filter((f) => /^job-\d+\.json$/.test(f)).sort()
    : [];
  const problems: string[] = [];
  let written = 0;
  let pending = 0;

  for (const file of jobFiles) {
    const jobs = (JSON.parse(fs.readFileSync(path.join(WORK_ROOT, file), "utf8")) as { matchups: Job[] }).matchups;
    const donePath = path.join(WORK_ROOT, file.replace(/\.json$/, ".done.json"));
    if (!fs.existsSync(donePath)) {
      pending += jobs.length;
      continue;
    }
    const authored = (JSON.parse(fs.readFileSync(donePath, "utf8")) as { sections: AuthoredSections }).sections ?? {};

    for (const job of jobs) {
      const sections = authored[job.key];
      if (!sections?.length) {
        problems.push(`${file}: ${job.key} 누락`);
        continue;
      }
      const missing = job.briefs.filter((b) => !sections.some((s) => s.id === b.id));
      if (missing.length) {
        problems.push(`${file}: ${job.key} 구간 누락 — ${missing.map((m) => m.id).join(", ")}`);
        continue;
      }
      const answer = [job.decided, ...sections.map((s) => s.text)].join("\n\n");
      const issues = checkText(answer, job, riftItems, otherModeItems, runeNames);
      if (issues.length) {
        problems.push(`${file}: ${job.key} — ${issues.join(" / ")}`);
        continue;
      }
      const payload = {
        schemaVersion: 1 as const,
        patch: data.patch,
        lang: "ko_KR" as const,
        me: job.me,
        enemy: job.enemy,
        lane: job.lane,
        author: "curated" as const,
        generatedAt: new Date().toISOString(),
        decided: job.decided,
        sections,
        answer,
      };
      const target = outPath({ me: job.me, enemy: job.enemy, lane: job.lane }, data.patch);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      written += 1;
    }
  }

  console.log(`반영 ${written}건 / 미제출 ${pending}건`);
  if (problems.length) {
    console.log(`\n검사 실패 ${problems.length}건:`);
    for (const p of problems.slice(0, 40)) console.log(`  ${p}`);
    process.exitCode = 1;
  }
}

function status(): void {
  const data = loadStaticData("ko_KR");
  const root = path.join(PUBLIC_DATA_ROOT, data.patch, "llm", "matchups");
  let curated = 0;
  let model = 0;
  if (fs.existsSync(root)) {
    for (const lane of fs.readdirSync(root)) {
      const dir = path.join(root, lane);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as { author?: string };
        if (parsed.author === "curated") curated += 1;
        else model += 1;
      }
    }
  }
  const list = JSON.parse(fs.readFileSync(LIST_FILE, "utf8")) as { matchups: Target[] };
  console.log(`목표 ${list.matchups.length}건 / 저술 ${curated}건 / 모델 생성 ${model}건`);
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  if (argv.includes("--export")) {
    exportJobs(Number(get("--per-job") ?? 12), get("--limit") ? Number(get("--limit")) : undefined);
  } else if (argv.includes("--merge")) merge();
  else status();
}

main();
