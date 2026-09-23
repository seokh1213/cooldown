/**
 * 원자 선별 헤드 자료 — "이 칸에서 이 질문에 가장 도움 되는 줄은?"
 *
 * 원자 조립(lib/atomAssembly)은 칸마다 후보를 규칙 순서로 줄 세우고 앞에서부터 싣는다.
 * 규칙은 질문의 말투·조건을 못 본다. 칸 하나를 kev 선택 문제로 바꿔(선택지 = 후보 원자)
 * 0.8B 판정 헤드가 고르게 한다. 한 번의 forward 로 후보 전부의 확률이 나온다.
 *
 * 정답: Codex 가 두 챔피언의 전체 자료를 보고 칸마다 후보를 도움 되는 순으로 고른다.
 *       Claude 가 모른 채 1순위를 따로 고르고, 둘이 같은 칸만 남긴다.
 * 챔피언은 평가(30문항)에 없는 것만 쓴다 — knowledge/atoms 에 원자가 있는 학습용 챔피언.
 *
 * 출력: kev 요청 꼴 JSONL(judge/features.py · train/features_chunked.py 가 읽는다)
 *
 * 사용: npx tsx scripts/llm/build-atom-pick-data.ts --out research/llm-evals/atoms/pick-train.jsonl
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { MatchupNotes } from "../../src/lib/advisor/answer";
import { atomCandidates, type SectionCandidates } from "./lib/atomAssembly";
import { connectorAnswer, connectorData } from "./build-connector-data";
import { materialOf } from "./build-verify-data";
import { EVAL_CHAMPIONS, type AtomFile } from "./build-note-atoms";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const OUT = arg("out") ?? "research/llm-evals/atoms/pick-train.jsonl";
const MAX_PAIRS = Number(arg("pairs") ?? 70);
const CONCURRENCY = 3;
/** 선택지 상한. 규칙 순서로 앞쪽만 싣는다(판정 헤드 입력 길이). */
export const MAX_OPTIONS = 16;

export const PICK_INSTRUCTIONS = "Which line best answers the user's question in this section?";

/** 판정 헤드의 state. 학습과 앱이 글자까지 같아야 한다. */
export function pickState(question: string, me: string, enemy: string, section: string): string {
  return `Question: ${question}\nMatchup: user plays ${me} against ${enemy}\nSection: ${section}`;
}

export function pickRecord(question: string, me: ChampionCard, enemy: ChampionCard, section: SectionCandidates, label?: number) {
  const options = section.candidates.slice(0, MAX_OPTIONS);
  return {
    state: pickState(question, me.name, enemy.name, section.title),
    questions: {
      pick: {
        type: "choice",
        instructions: PICK_INSTRUCTIONS,
        criteria: Object.fromEntries(options.map((c, i) => [String(i), c.text])),
        label: String(label ?? 0),
      },
    },
  };
}

const QUESTIONS: Array<[string, (a: string, b: string) => string]> = [
  ["general", (a, b) => `${a}로 ${b} 상대 어떻게 해?`],
  ["laning", (a, b) => `${a}로 ${b} 라인전 어떻게 풀어?`],
  ["situational-item", (a, b) => `${a}로 ${b} 만나면 템 뭐 가?`],
  ["skill", (a, b) => `${a}로 ${b} 상대할 때 뭘 제일 조심해야 돼?`],
  ["combo", (a, b) => `${a}로 ${b} 딜교 어떻게 해?`],
];

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-pick-"));
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

function sectionBlock(sections: SectionCandidates[]): string {
  return sections
    .map((s) => [`[${s.key}] ${s.title} (${s.size}개 싣는다)`, ...s.candidates.slice(0, MAX_OPTIONS).map((c, i) => `  ${i}. ${c.text}`)].join("\n"))
    .join("\n\n");
}

async function main(): Promise<void> {
  const atomsOf = (id: string): AtomFile | undefined =>
    fs.existsSync(`knowledge/atoms/${id}.json`) ? (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile) : undefined;
  const held = new Set(EVAL_CHAMPIONS);
  const ready = fs
    .readdirSync("knowledge/atoms")
    .map((f) => f.replace(/\.json$/, ""))
    .filter((id) => !held.has(id));
  const byPos = new Map<string, string[]>();
  for (const id of ready) {
    const pos = (connectorData.cardById.get(id) as ChampionCard | undefined)?.wiki?.positions?.[0] ?? "?";
    byPos.set(pos, [...(byPos.get(pos) ?? []), id]);
  }
  const jobs: Array<{ me: ChampionCard; enemy: ChampionCard; question: string; focus: string }> = [];
  let q = 0;
  for (const group of byPos.values())
    for (const a of group)
      for (const b of group) {
        if (a === b || jobs.length >= MAX_PAIRS) continue;
        const [topic, make] = QUESTIONS[q++ % QUESTIONS.length];
        const me = connectorData.cardById.get(a) as ChampionCard;
        const enemy = connectorData.cardById.get(b) as ChampionCard;
        jobs.push({ me, enemy, question: make(me.name, enemy.name), focus: topic });
      }
  console.log(`학습 챔피언 ${ready.length} · 짝 ${jobs.length}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, "");
  const stats = { sections: 0, agreed: 0 };
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const { me, enemy, question, focus } = jobs[next++];
        const answer = connectorAnswer(me, enemy, question);
        const plan = (answer.notes as MatchupNotes | undefined)?.plan;
        if (plan) plan.focus = focus;
        const sections = atomCandidates(answer, atomsOf(me.id), atomsOf(enemy.id)).filter((s) => s.candidates.length >= 2);
        if (!sections.length) continue;
        const material = materialOf(me, enemy, question);
        const ranking = jsonObject<Record<string, number[]>>(
          await codex(
            [
              "리그 오브 레전드 도우미의 상성 답을 칸별로 조립한다. 칸마다 후보 줄 가운데 사용자 질문에 가장 도움 되는 순서대로 번호를 골라라.",
              "기준: 질문에 직접 답하는가, 이 상성에서 실제로 중요한가, 구체적인가(막연한 말보다 스킬·시점·행동). 참고 자료로 판단한다. 파일을 읽거나 명령을 실행하지 말 것.",
              "",
              `[질문] ${question}`,
              "",
              "[참고 자료]",
              material,
              "",
              sectionBlock(sections),
              "",
              '출력: JSON 하나만. 칸 key 마다 번호 배열(도움 되는 순, 칸의 "싣는다" 개수만큼): {"watch": [3, 0], "build": [...], "fight": [...]}',
            ].join("\n"),
          ),
        );
        const top1 = jsonObject<Record<string, number>>(
          await claude(
            [
              "리그 오브 레전드 도우미의 상성 답을 칸별로 조립한다. 칸마다 후보 가운데 사용자 질문에 가장 도움 되는 줄 하나의 번호를 골라라.",
              "기준: 질문에 직접 답하는가, 이 상성에서 실제로 중요한가, 구체적인가.",
              "",
              `[질문] ${question}`,
              "",
              sectionBlock(sections),
              "",
              '출력: JSON 하나만: {"watch": 번호, "build": 번호, "fight": 번호}',
            ].join("\n"),
          ),
        );
        const lines: string[] = [];
        for (const s of sections) {
          stats.sections += 1;
          const best = ranking?.[s.key]?.[0];
          if (best === undefined || best !== top1?.[s.key] || best >= Math.min(MAX_OPTIONS, s.candidates.length)) continue;
          stats.agreed += 1;
          lines.push(JSON.stringify({ ...pickRecord(question, me, enemy, s, best), _meta: { pair: `${me.id}/${enemy.id}`, section: s.key, ranking: ranking?.[s.key] } }));
        }
        fs.appendFileSync(OUT, lines.map((l) => `${l}\n`).join(""));
        if (next % 10 === 0) console.log(`${next}/${jobs.length} · 칸 ${stats.sections} · 일치 ${stats.agreed}`);
      }
    }),
  );
  console.log(`\n칸 ${stats.sections} · 두 채점자 1순위 일치 ${stats.agreed} → ${OUT}`);
}

if (process.argv[1]?.endsWith("build-atom-pick-data.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
