/**
 * ⑥ 검증 헤드 자료 — "이 문장을 자료가 뒷받침하나?"
 *
 * 정규식 근거 검사(groundCommentary)는 스킬·효과 짝과 수치만 본다. 4B 가 쓴 "둔화 저항을
 * 갖춘 의상", "럭스 Q 가 맞으면 무방비" 같은 문장은 그 그물을 빠져나갔다. 문장 하나와
 * 재료를 주고 뒷받침 여부를 판정하는 헤드를 가르친다.
 *
 * 학습(train): 평가 짝(PAIRS)의 챔피언을 뺀 짝마다
 *   재료 = 두 챔피언 카드 줄 + 운용 노트 일부(문장화 단계가 받을 꼴)
 *   문장 = Codex 가 지은 것(뒷받침되는 것과 교묘하게 틀린 것) + 코드가 스킬 이름을 바꿔친 것
 *   라벨 = Codex 라벨과 Claude 의 독립 라벨이 같을 때만. 코드가 바꿔친 문장은 그 자체로 unsupported.
 * 시험(test): 평가 짝 14쌍에서 0.8B·4B 가 **실제로 쓴** 문장. 라벨은 Claude.
 *
 * 출력은 kev 요청 꼴 JSONL(judge/features.py 가 그대로 읽는다).
 *
 * 사용:
 *   npx tsx scripts/llm/build-verify-data.ts train --pairs 80 --out research/llm-evals/qwen35/verify
 *   npx tsx scripts/llm/build-verify-data.ts test --runs a.json,b.json --out research/llm-evals/qwen35/verify
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { AdvisorData } from "../../src/lib/advisor/context";
import { buildCommentaryPrompt, splitSentences } from "../../src/lib/advisor/answer";
import { PAIRS, matchupAnswer, type Row } from "./lib/matchupEval";

const mode = process.argv[2];
const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const OUT = arg("out") ?? "research/llm-evals/qwen35/verify";
const CONCURRENCY = Number(arg("concurrency") ?? 3);

export const VERIFY_INSTRUCTIONS = "Is every claim in the sentence supported by the material?";
export const VERIFY_CRITERIA = {
  supported: "Every claim in the sentence is stated in or directly follows from the material",
  unsupported: "The sentence adds, reverses or misattributes something the material does not say",
};

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;
const knowledge = JSON.parse(fs.readFileSync(path.join(llmDir, "advisor-knowledge.json"), "utf8")) as {
  playbooks: Record<string, Playbook>;
};
const data = {
  cards,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks: new Map(Object.entries(knowledge.playbooks)),
} as unknown as AdvisorData;

let seed = 99;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];

/** 해설 프롬프트에서 재료만 뗀다(지시문은 뺀다). 노트는 keep 개만 남긴다. */
export function materialOf(me: ChampionCard, enemy: ChampionCard, question: string, keepNotes?: number): string {
  const prompt = buildCommentaryPrompt(matchupAnswer(data, me, enemy, question), patch, "ko_KR") ?? "";
  const lines = prompt.split("\n");
  const end = lines.findIndex((line) => line.startsWith("[요청]"));
  const body = (end >= 0 ? lines.slice(0, end) : lines).filter((line) => line.trim());
  const notes = body.filter((line) => /^- [^:]+: /.test(line) && !line.includes("주 피해 유형"));
  const kept = keepNotes === undefined ? new Set(notes) : new Set([...notes].sort(() => rand() - 0.5).slice(0, keepNotes));
  return body.filter((line) => !notes.includes(line) || kept.has(line)).join("\n");
}

function record(material: string, sentence: string, label: "supported" | "unsupported", meta: Record<string, unknown>) {
  return {
    state: `[자료]\n${material}\n\n[문장]\n${sentence}`,
    questions: { verify: { type: "choice", instructions: VERIFY_INSTRUCTIONS, criteria: VERIFY_CRITERIA, label } },
    _meta: meta,
  };
}

function run(cmd: string, args: string[], input: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stdin.end(input);
    child.on("close", () => resolve(out));
  });
}

async function codex(prompt: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-verify-"));
  const out = path.join(dir, "out.txt");
  await run("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-C", dir, "-o", out, "-"], prompt, dir);
  const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return text;
}

const claude = (prompt: string): Promise<string> =>
  run("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], prompt, os.tmpdir());

function jsonLines<T>(text: string): T[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

const LABEL_RULE = `판정 기준
- supported: 문장의 모든 주장이 자료에 적혀 있거나 자료에서 바로 따라 나온다. 표현을 바꾼 것은 괜찮다.
- unsupported: 자료에 없는 사실(아이템·룬·스킬·효과·수치·시점)을 더했거나, 자료를 뒤집었거나, 스킬·효과를 다른 챔피언이나 다른 스킬에 붙였다.
어느 챔피언에나 맞는 막연한 말(예: "신중하게 플레이해야 합니다")은 자료와 모순이 없으면 supported 로 본다.`;

async function claudeLabels(material: string, sentences: string[]): Promise<Map<number, string>> {
  const prompt = [
    "리그 오브 레전드 도우미가 쓴 문장이 아래 자료로 뒷받침되는지 가려라.",
    "",
    LABEL_RULE,
    "",
    "[자료]",
    material,
    "",
    "[문장들]",
    ...sentences.map((s, i) => JSON.stringify({ i, sentence: s })),
    "",
    '각 줄에 JSON 하나로만 답한다: {"i": 번호, "label": "supported" 또는 "unsupported"}',
  ].join("\n");
  return new Map(jsonLines<{ i: number; label: string }>(await claude(prompt)).map((r) => [r.i, r.label]));
}

async function pool<T>(items: T[], worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const index = next++;
        await worker(items[index], index);
      }
    }),
  );
}

/** 문장 속 스킬 이름을 같은 짝의 다른 스킬 이름으로 바꾼다. 바뀐 문장은 짝이 틀린 문장이다. */
function swapSkill(sentence: string, me: ChampionCard, enemy: ChampionCard): string | undefined {
  const spells = [...me.spells, ...enemy.spells].filter((s) => s.name.length >= 2);
  const hit = spells.find((s) => sentence.includes(s.name));
  if (!hit) return undefined;
  const other = pick(spells.filter((s) => s.name !== hit.name && !sentence.includes(s.name)));
  return other ? sentence.replace(hit.name, other.name) : undefined;
}

async function buildTrain(): Promise<void> {
  const nPairs = Number(arg("pairs") ?? 80);
  const held = new Set(PAIRS.flatMap(([a, b]) => [a, b]));
  const byPosition = new Map<string, ChampionCard[]>();
  for (const card of cards) {
    const position = card.wiki?.positions?.[0];
    if (held.has(card.id) || !position) continue;
    byPosition.set(position, [...(byPosition.get(position) ?? []), card]);
  }
  const positions = [...byPosition.keys()].filter((p) => byPosition.get(p)!.length >= 4);
  const pairs: Array<[ChampionCard, ChampionCard]> = [];
  const seen = new Set<string>();
  while (pairs.length < nPairs) {
    const list = byPosition.get(pick(positions))!;
    const [a, b] = [pick(list), pick(list)];
    if (a.id === b.id || seen.has(a.id + b.id)) continue;
    seen.add(a.id + b.id);
    pairs.push([a, b]);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, "train.jsonl");
  fs.writeFileSync(outFile, "");
  const stats = { codex: 0, agreed: 0, swapped: 0 };
  await pool(pairs, async ([me, enemy], index) => {
    const material = materialOf(me, enemy, `${me.name}로 ${enemy.name} 상대 어떻게 해?`, 3 + Math.floor(rand() * 4));
    const prompt = [
      "아래 [자료]는 리그 오브 레전드 도우미가 받는 재료다. 이 재료를 근거로 도우미가 쓸 법한 한국어 합니다체 문장을 만들어라.",
      "- supported 7개: 자료의 사실을 풀어 쓰거나 두 사실을 이은 문장. 자료에 없는 것은 넣지 않는다.",
      "- unsupported 7개: 그럴듯하지만 틀린 문장. 섞어서: 사실 뒤집기(빗나가면↔맞으면, 높다↔낮다), 스킬·효과를 다른 스킬이나 다른 챔피언에 붙이기, 자료에 없는 아이템·룬·효과 지어내기, 시점 뒤집기.",
      "  틀린 곳은 문장 하나에 한 군데만, 티 나지 않게.",
      "",
      LABEL_RULE,
      "",
      "[자료]",
      material,
      "",
      '출력: 한 줄에 JSON 하나, 다른 글 없이. {"sentence": "...", "label": "supported" 또는 "unsupported", "error": "unsupported 일 때 틀린 곳 한 줄"}',
    ].join("\n");
    const drafted = jsonLines<{ sentence: string; label: string }>(await codex(prompt)).filter(
      (d) => d.sentence && (d.label === "supported" || d.label === "unsupported"),
    );
    stats.codex += drafted.length;
    const labels = await claudeLabels(material, drafted.map((d) => d.sentence));
    const rows: string[] = [];
    drafted.forEach((d, i) => {
      if (labels.get(i) !== d.label) return;
      stats.agreed += 1;
      rows.push(JSON.stringify(record(material, d.sentence, d.label as "supported", { pair: `${me.id}/${enemy.id}`, source: "codex" })));
      if (d.label === "supported") {
        const swapped = swapSkill(d.sentence, me, enemy);
        if (swapped) {
          stats.swapped += 1;
          rows.push(JSON.stringify(record(material, swapped, "unsupported", { pair: `${me.id}/${enemy.id}`, source: "swap" })));
        }
      }
    });
    fs.appendFileSync(outFile, rows.map((r) => `${r}\n`).join(""));
    console.log(`${index + 1}/${pairs.length} ${me.name}/${enemy.name}: Codex ${drafted.length} · 일치 ${rows.length}`);
  });
  console.log(`\nCodex 문장 ${stats.codex} · 두 라벨 일치 ${stats.agreed} · 스킬 바꿔치기 ${stats.swapped} → ${outFile}`);
}

async function buildTest(): Promise<void> {
  const runs = (arg("runs") ?? "").split(",").filter(Boolean);
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, "test.jsonl");
  fs.writeFileSync(outFile, "");
  const jobs: Array<{ source: string; row: Row; me: ChampionCard; enemy: ChampionCard }> = [];
  for (const file of runs) {
    const run = JSON.parse(fs.readFileSync(file, "utf8")) as { model: string; rows: Row[] };
    for (const row of run.rows) {
      const pair = PAIRS.find(([, , q]) => q === row.question);
      if (!pair) continue;
      jobs.push({ source: `${path.basename(file)}`, row, me: data.cardById.get(pair[0])!, enemy: data.cardById.get(pair[1])! });
    }
  }
  let total = 0;
  await pool(jobs, async ({ source, row, me, enemy }) => {
    const material = materialOf(me, enemy, row.question);
    // 화면에 나가기 전의 원문을 쓴다. 정규식 검사가 걸러 낸 문장도 판정 대상이어야 견줄 수 있다.
    const sentences = [...new Set(splitSentences(row.raw).map((s) => s.trim()).filter((s) => s.length >= 12))].slice(0, 20);
    const labels = await claudeLabels(material, sentences);
    const rows = sentences.flatMap((sentence, i) => {
      const label = labels.get(i);
      if (label !== "supported" && label !== "unsupported") return [];
      return [JSON.stringify(record(material, sentence, label, { pair: `${me.id}/${enemy.id}`, source, shown: row.shown.includes(sentence) }))];
    });
    total += rows.length;
    fs.appendFileSync(outFile, rows.map((r) => `${r}\n`).join(""));
    console.log(`${source} ${row.question}: ${rows.length}문장`);
  });
  console.log(`\n시험 문장 ${total} → ${outFile}`);
}

/**
 * real: 모델이 **실제로 쓴** 해설을 학습 자료로 쓴다.
 *
 * Codex 가 일부러 지은 틀린 문장만으로 배운 헤드는 합성 dev 에서 균형 76% 였지만 실제 문장
 * 시험에서 57% 였다. 모델이 실제로 틀리는 방식(피해 유형·저항 뒤섞기, 없는 효과 붙이기)이 다르다.
 * 입력은 chat JSONL(system 에 해설 프롬프트, assistant 에 답)이나 {system, text} JSONL 이다.
 * 재료는 system 의 [패치]~[요청] 사이를 그대로 쓴다. 평가 짝 챔피언이 든 것은 뺀다.
 */
async function buildReal(): Promise<void> {
  const inputs = (arg("in") ?? "").split(",").filter(Boolean);
  const heldNames = new Set(PAIRS.flatMap(([a, b]) => [a, b]).map((id) => data.cardById.get(id)!.name));
  const jobs: Array<{ material: string; text: string; source: string }> = [];
  for (const file of inputs) {
    for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
      const row = JSON.parse(line) as { messages?: Array<{ role: string; content: string }>; system?: string; text?: string };
      const system = row.system ?? row.messages?.find((m) => m.role === "system")?.content ?? "";
      const text = row.text ?? row.messages?.find((m) => m.role === "assistant")?.content ?? "";
      const start = system.indexOf("[패치]");
      const end = system.indexOf("[요청]");
      if (start < 0 || !text) continue;
      const material = system.slice(start, end > start ? end : undefined).trim();
      const matchupLine = /\[상성\] 사용자는 (.+?)을 잡고 (.+?)를 상대/.exec(material);
      if (matchupLine && (heldNames.has(matchupLine[1]) || heldNames.has(matchupLine[2]))) continue;
      jobs.push({ material, text, source: path.basename(file) });
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, arg("name") ?? "real.jsonl");
  fs.writeFileSync(outFile, "");
  let total = 0;
  await pool(jobs, async ({ material, text, source }, index) => {
    const sentences = [...new Set(splitSentences(text).map((s) => s.trim()).filter((s) => s.length >= 12))].slice(0, 20);
    const labels = await claudeLabels(material, sentences);
    const rows = sentences.flatMap((sentence, i) => {
      const label = labels.get(i);
      if (label !== "supported" && label !== "unsupported") return [];
      return [JSON.stringify(record(material, sentence, label, { pair: `real-${index}`, source }))];
    });
    total += rows.length;
    fs.appendFileSync(outFile, rows.map((r) => `${r}\n`).join(""));
    if (index % 10 === 0) console.log(`${index + 1}/${jobs.length} · 누적 ${total}`);
  });
  console.log(`\n실제 문장 ${total} → ${outFile}`);
}

// 다른 스크립트가 materialOf 만 가져다 쓸 때는 돌지 않는다(돌면 test.jsonl 을 빈 파일로 덮는다)
if (process.argv[1]?.endsWith("build-verify-data.ts")) {
  (mode === "train" ? buildTrain() : mode === "real" ? buildReal() : buildTest()).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
