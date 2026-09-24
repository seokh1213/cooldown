/**
 * ⑤ 문장화(연결문) 학습 자료 — 칸 조립 결과를 질문에 맞게 잇는 글
 *
 * 0.8B 의 상성 답은 이제 코드가 칸으로 조립한다(prose.ts matchupDigest: 조심할 것·아이템·
 * 싸우는 법, 칸마다 노트 첫 문장 두 개). 옳은 말만 나가지만 질문과 상관없이 늘 같은 꼴이고
 * 문장 사이가 끊긴다. 연결문 모델은 **그 칸 안의 사실만으로** 질문에 맞춰 이어 쓴다.
 *
 * 학생(0.8B)이 받는 것: 질문 + 칸 조립 결과(약 500자). 지금 해설 재료(2,200자)의 4분의 1.
 * 교사(Codex)가 받는 것: 위에 더해 두 챔피언의 전체 재료(카드·노트 전부). 판단과 오류 점검에만
 *   쓰고, 문장에 넣는 사실은 칸 안의 것으로 한정한다 — 학생이 못 보는 사실을 배우면 헛말을 배운다.
 * 거르기: 칸마다 정규식 근거 검사 + Claude 문장 판정을 모두 통과해야 남긴다.
 *
 * 평가 짝(PAIRS)의 챔피언은 학습에서 뺀다.
 *
 * 사용: npx tsx scripts/llm/build-connector-data.ts --n 300 --out research/llm-evals/qwen35/connector
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { AdvisorData } from "../../src/lib/advisor/context";
import { matchupNotes } from "../../src/lib/advisor/context";
import { buildCompareAnswer, type AdvisorAnswer } from "../../src/lib/advisor/answer";
import { groundCommentary } from "../../src/lib/advisor/grounding";
import { matchupDigest } from "../../src/lib/advisor/prose";
import { PAIRS } from "./lib/matchupEval";
import { materialOf } from "./build-verify-data";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const N = Number(arg("n") ?? 300);
const OUT = arg("out") ?? "research/llm-evals/qwen35/connector";
const CONCURRENCY = Number(arg("concurrency") ?? 3);

const patch = resolvePatchVersion();
const read = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, file), "utf8")) as T;
const cards = read<{ cards: ChampionCard[] }>("llm/champion-cards-ko_KR.json").cards;
const knowledge = read<{ playbooks: Record<string, Playbook> }>("llm/advisor-knowledge.json");
export const connectorData = {
  cards,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks: new Map(Object.entries(knowledge.playbooks)),
  items: read<{ items: unknown[] }>("items-normalized-ko_KR.json").items,
} as unknown as AdvisorData;

export type Compare = Extract<AdvisorAnswer, { kind: "compare" }>;

export function connectorAnswer(me: ChampionCard, enemy: ChampionCard, question: string): Compare {
  return buildCompareAnswer([me, enemy], question, undefined, {
    matchup: true,
    notes: matchupNotes(connectorData, me, enemy, "ko_KR"),
    lang: "ko_KR",
  }) as Compare;
}

/** 조립 결과를 칸으로 나눈다. `**제목**\n본문` 이 빈 줄로 이어진 꼴이다. */
export function sectionsOf(digest: string): Array<{ title: string; body: string }> {
  return digest
    .split(/\n\n+/)
    .map((block) => /^\*\*(.+?)\*\*\n([\s\S]+)$/.exec(block.trim()))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => ({ title: m[1], body: m[2].trim() }));
}

/** 학생 프롬프트. 브라우저가 보낼 글과 글자까지 같아야 한다. */
export function connectorPrompt(me: ChampionCard, enemy: ChampionCard, sections: Array<{ title: string; body: string }>): string {
  return [
    `사용자는 ${me.name}을(를) 잡고 ${enemy.name}을(를) 상대합니다. ${me.name} 시점으로 씁니다.`,
    "아래 칸마다 적힌 사실만으로, 사용자의 질문에 맞게 칸마다 한두 문장으로 이어 쓰십시오.",
    "- 칸에 없는 사실·아이템·스킬·수치를 더하지 마십시오. 칸의 사실을 뒤집거나 다른 스킬에 붙이지 마십시오.",
    "- 합니다체. 칸 제목을 [제목] 꼴로 그대로 쓰고 그 아래에 문장을 쓰십시오. 질문과 상관없는 칸은 한 문장으로 줄이십시오.",
    "",
    ...sections.flatMap((s) => [`[${s.title}]`, s.body, ""]),
  ].join("\n");
}

/** 모델 출력에서 칸을 읽는다. 제목이 없거나 빈 칸은 빠진다. */
export function parseConnector(text: string, titles: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const pattern = new RegExp(`\\[(${titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\]`, "g");
  const marks = [...text.matchAll(pattern)];
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    // 모델은 제목을 **[제목]** 처럼 굵게 싸기도 한다. 본문 앞뒤에 남는 별표를 걷어낸다.
    const body = text.slice(start, end).trim().replace(/^\*+\s*/, "").replace(/\s*\*+$/, "").trim();
    if (body && !out.has(m[1])) out.set(m[1], body);
  });
  return out;
}

const QUESTIONS: Array<(a: string, b: string) => string> = [
  (a, b) => `${a}로 ${b} 상대 어떻게 해?`,
  (a, b) => `${a}로 ${b} 라인전 어떻게 풀어?`,
  (a, b) => `${a}로 ${b} 상대할 때 뭘 제일 조심해야 돼?`,
  (a, b) => `${a}로 ${b} 만나면 템 뭐 가?`,
  (a, b) => `${a}로 ${b} 딜교 어떻게 해?`,
  (a, b) => `${b} 상대로 ${a} 너무 힘든데 팁 좀`,
  (a, b) => `${a} 잡고 ${b} 이기는 법 알려줘`,
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-connector-"));
  const out = path.join(dir, "out.txt");
  await run("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-C", dir, "-o", out, "-"], prompt, dir);
  const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8").trim() : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return text;
}

async function claudeUnsupported(facts: string, sentences: string[]): Promise<Set<number>> {
  const prompt = [
    "리그 오브 레전드 도우미가 쓴 문장들이 [사실]로 뒷받침되는지 가려라.",
    "supported: 문장의 모든 주장이 [사실]에 있거나 바로 따라 나온다(표현 바꾸기는 괜찮다).",
    "unsupported: [사실]에 없는 것을 더했거나, 뒤집었거나, 다른 스킬·챔피언에 붙였다.",
    "",
    "[사실]",
    facts,
    "",
    ...sentences.map((s, i) => JSON.stringify({ i, sentence: s })),
    "",
    '각 줄에 JSON 하나로만 답한다: {"i": 번호, "label": "supported" 또는 "unsupported"}',
  ].join("\n");
  const text = await run("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], prompt, os.tmpdir());
  const bad = new Set<number>();
  let seen = 0;
  for (const line of text.split("\n")) {
    try {
      const row = JSON.parse(line.trim()) as { i: number; label: string };
      seen += 1;
      if (row.label !== "supported") bad.add(row.i);
    } catch {
      /* 다른 줄은 건너뛴다 */
    }
  }
  // 답을 못 받았으면 모두 의심한다
  if (seen < sentences.length) sentences.forEach((_, i) => bad.add(i));
  return bad;
}

let seed = Number(arg("seed") ?? 31);
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];

async function main(): Promise<void> {
  const held = new Set(PAIRS.flatMap(([a, b]) => [a, b]));
  const byPosition = new Map<string, ChampionCard[]>();
  for (const card of cards) {
    const position = card.wiki?.positions?.[0];
    if (held.has(card.id) || !position) continue;
    byPosition.set(position, [...(byPosition.get(position) ?? []), card]);
  }
  const positions = [...byPosition.keys()].filter((p) => byPosition.get(p)!.length >= 4);
  const jobs: Array<{ me: ChampionCard; enemy: ChampionCard; question: string }> = [];
  const seen = new Set<string>();
  while (jobs.length < N) {
    const list = byPosition.get(pick(positions))!;
    const [me, enemy] = [pick(list), pick(list)];
    if (me.id === enemy.id || seen.has(me.id + enemy.id)) continue;
    seen.add(me.id + enemy.id);
    jobs.push({ me, enemy, question: pick(QUESTIONS)(me.name, enemy.name) });
  }

  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, "all.jsonl");
  fs.writeFileSync(outFile, "");
  const reasons = new Map<string, number>();
  const reject = (why: string) => reasons.set(why, (reasons.get(why) ?? 0) + 1);
  let kept = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const { me, enemy, question } = jobs[next++];
        const answer = connectorAnswer(me, enemy, question);
        const sections = sectionsOf(matchupDigest(answer, "ko_KR"));
        if (sections.length < 2) {
          reject("칸 부족");
          continue;
        }
        const system = connectorPrompt(me, enemy, sections);
        const teacher = [
          "너는 리그 오브 레전드 도우미다. 아래 [학생 지시]를 그대로 따라 답을 써라. 파일을 읽거나 명령을 실행하지 말고 답 본문만 출력하라.",
          "[참고 자료]는 두 챔피언의 전체 자료다. 칸의 사실이 무엇을 뜻하는지, 질문에 어느 칸이 중요한지 판단하는 데만 쓰고,",
          "문장에는 칸에 적힌 사실만 쓴다. 참고 자료에만 있는 사실은 쓰지 않는다.",
          "칸 문장을 바꿔 말하기만 하지 말 것. 칸마다 첫 문장은 사용자 질문에 대한 답이 되게 쓰고(무엇을 하라/조심하라),",
          "칸 사이의 인과를 이어라(조심할 것의 스킬이 싸우는 법의 타이밍과 어떻게 이어지는지 등, 칸에 있는 사실끼리만).",
          "질문이 한 갈래(아이템, 라인전, 조심할 것)를 콕 집으면 그 칸을 가장 충실히, 나머지는 한 문장으로.",
          "",
          "[참고 자료]",
          materialOf(me, enemy, question),
          "",
          "[학생 지시]",
          system,
          "[사용자 질문]",
          question,
        ].join("\n");
        const text = await codex(teacher);
        const parsed = parseConnector(text, sections.map((s) => s.title));
        if (parsed.size !== sections.length) {
          reject("칸 형식");
          continue;
        }
        // 칸마다 정규식 검사. 칸 사실 밖의 스킬·효과 짝을 잡는다.
        if ([...parsed.values()].some((body) => groundCommentary(body, answer, "ko_KR").dropped.length > 0)) {
          reject("정규식 검사");
          continue;
        }
        const sentences = [...parsed.values()].flatMap((body) => body.split(/(?<=[.!?。])\s+/).filter((s) => s.trim()));
        const bad = await claudeUnsupported(sections.map((s) => `[${s.title}] ${s.body}`).join("\n"), sentences);
        if (bad.size) {
          reject("Claude 판정");
          continue;
        }
        kept += 1;
        const assistant = sections.map((s) => `[${s.title}]\n${parsed.get(s.title)}`).join("\n\n");
        fs.appendFileSync(
          outFile,
          `${JSON.stringify({
            messages: [
              { role: "system", content: system },
              { role: "user", content: question },
              { role: "assistant", content: assistant },
            ],
            pair: `${me.id}/${enemy.id}`,
          })}\n`,
        );
        if (kept % 10 === 0) console.log(`남김 ${kept} (시도 ${next}/${jobs.length})`);
      }
    }),
  );
  console.log(`\n남김 ${kept}/${jobs.length} · 버린 까닭 ${[...reasons].map(([k, v]) => `${k} ${v}`).join(", ") || "없음"} → ${outFile}`);
}

if (process.argv[1]?.endsWith("build-connector-data.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
