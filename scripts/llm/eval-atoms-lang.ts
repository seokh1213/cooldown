/**
 * 영어·중국어 상성 답: 지금(카드 도출 문장만) 대 번역 원자를 더한 판 — 맹검
 *
 * 노트가 한국어뿐이라 두 언어 답은 도출 문장만으로 지어진다(context.ts matchupNotes).
 * translate-atoms.ts 가 원자를 옮겨 두었으니, 같은 칸 규칙으로 원자를 실은 판을 견준다.
 * 문항은 eval-connector 의 30문항을 같은 주제의 그 언어 질문으로 바꾼 것이다.
 *
 * 채점 자료에는 한국어 노트 전문을 싣는다 — 원자 판의 근거가 그 노트이므로, 빠지면 원자
 * 판이 "자료에 없는 말" 로 깎인다(eval-connector 에서 세 번 겪었다).
 *
 *   npx tsx scripts/llm/eval-atoms-lang.ts --lang en_US --out <결과.json>   # JUDGE=codex 로 채점자 바꿈
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { matchupNotes, type AdvisorData } from "../../src/lib/advisor/context";
import { buildCompareAnswer, buildCommentaryPrompt, type MatchupNotes } from "../../src/lib/advisor/answer";
import { matchupDigest } from "../../src/lib/advisor/prose";
import { atomSections, eligibleNotes, renderSections, type Candidate } from "./lib/atomAssembly";
import type { Compare } from "./build-connector-data";
import type { AtomFile } from "./build-note-atoms";
import { evalItems, focusOf } from "./eval-connector";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const LANG = (arg("lang") ?? "en_US") as "en_US" | "zh_CN";
const OUT = arg("out") ?? `research/llm-evals/atoms/lang-${LANG}.json`;

const patch = resolvePatchVersion();
const read = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, file), "utf8")) as T;
const cards = read<{ cards: ChampionCard[] }>(`llm/champion-cards-${LANG}.json`).cards;
const knowledge = read<{ playbooks: Record<string, Playbook> }>("llm/advisor-knowledge.json");
const playbooks = new Map(Object.entries(knowledge.playbooks));
const data = {
  cards,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks,
  items: read<{ items: unknown[] }>(`items-normalized-${LANG}.json`).items,
} as unknown as AdvisorData;

const QUESTIONS: Record<typeof LANG, Record<string, (a: string, b: string) => string>> = {
  en_US: {
    general: (a, b) => `How do I play ${a} against ${b}?`,
    laning: (a, b) => `How should I play the laning phase as ${a} vs ${b}?`,
    "situational-item": (a, b) => `What should I build as ${a} against ${b}?`,
    skill: (a, b) => `As ${a} vs ${b}, what should I watch out for the most?`,
    combo: (a, b) => `How do I trade as ${a} against ${b}?`,
  },
  zh_CN: {
    general: (a, b) => `用${a}打${b}怎么玩？`,
    laning: (a, b) => `${a}对线${b}怎么打？`,
    "situational-item": (a, b) => `${a}碰到${b}出什么装备？`,
    skill: (a, b) => `${a}打${b}最需要注意什么？`,
    combo: (a, b) => `${a}打${b}怎么换血？`,
  },
};

const atoms = (id: string): AtomFile | undefined =>
  fs.existsSync(`knowledge/atoms/${id}.json`) ? (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile) : undefined;

function build(item: { me: string; enemy: string; question: string }) {
  const me = data.cardById.get(item.me) as ChampionCard;
  const enemy = data.cardById.get(item.enemy) as ChampionCard;
  const focus = focusOf(item.question);
  const question = QUESTIONS[LANG][focus](me.name, enemy.name);
  const answer = buildCompareAnswer([me, enemy], question, undefined, { matchup: true, notes: matchupNotes(data, me, enemy, LANG), lang: LANG }) as Compare;
  const plan = (answer.notes as MatchupNotes | undefined)?.plan;
  if (plan) plan.focus = focus;
  const eligible = eligibleNotes(playbooks, me, enemy);
  const current = matchupDigest(answer, LANG);
  const withAtoms = renderSections(atomSections(answer, atoms(item.me), atoms(item.enemy), undefined, true, eligible, LANG), answer);
  // 한국어에서 이긴 fullall(첫 칸 원자를 노트 전문으로)의 두 언어판. 노트 번역이 없으니 같은 노트의
  // 번역 원자를 순서대로 이어 전문을 대신한다. 번역이 탈락한 원자는 빠진다.
  let first = true;
  const noteOf = (c: Candidate) => {
    const file = c.side === "enemy" ? atoms(item.enemy) : atoms(item.me);
    const parts = (file?.atoms ?? []).filter((a) => a.source === c.atom!.source).map((a) => a.text[LANG]).filter(Boolean);
    return parts.length ? parts.join(" ") : c.text;
  };
  const fullPick = (_key: string, candidates: Candidate[], size: number) => {
    const picked = candidates.slice(0, size);
    if (!first) return picked;
    first = false;
    return picked.map((c) => (c.atom ? { ...c, text: noteOf(c) } : c));
  };
  const withNotes = renderSections(atomSections(answer, atoms(item.me), atoms(item.enemy), fullPick, true, eligible, LANG), answer);
  // 원자 판의 근거: 조건이 맞는 한국어 노트 전문
  const notes = [
    ...(playbooks.get(item.me)?.playing ?? []).filter((n) => n.id && eligible.mine.has(n.id)),
    ...(playbooks.get(item.enemy)?.against ?? []).filter((n) => n.id && eligible.enemy.has(n.id)),
  ].map((n) => `- ${n.text}`);
  const prompt = buildCommentaryPrompt(answer, patch, LANG) ?? "";
  const cut = prompt.search(/\[(Request|요청|请求)\]/);
  const material = [
    (cut >= 0 ? prompt.slice(0, cut) : prompt).trim(),
    "",
    "[카드에서 도출한 사실]",
    ...(plan?.claims ?? []).map((c) => `- ${c.text}`),
    ...(notes.length ? ["", "[검증된 운용 노트 전문(한국어 원문 — 판이 이것을 옮겨 썼을 수 있다)]", ...notes] : []),
  ].join("\n");
  return { question, current, withAtoms, withNotes, material };
}

function run(program: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(program, args, { cwd: os.tmpdir() });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stdin.end(input);
    child.on("close", () => resolve(out));
  });
}

async function codexJudge(prompt: string): Promise<string> {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/codex-judge-`);
  const out = `${dir}/out.txt`;
  await new Promise<void>((resolve) => {
    const child = spawn("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-C", dir, "-o", out, "-"], { cwd: dir });
    child.stdin.end(`${prompt}\n파일을 읽거나 명령을 실행하지 말 것.`);
    child.on("close", () => resolve());
  });
  const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return text;
}

async function main(): Promise<void> {
  const list = evalItems();
  if (process.argv.includes("--dry")) {
    for (const item of list.slice(0, Number(arg("dry") ?? 2))) {
      const b = build(item);
      console.log(`## ${b.question}\n--- current\n${b.current}\n--- atoms\n${b.withAtoms}\n--- notes\n${b.withNotes}\n`);
    }
    return;
  }
  const results: Array<{ id: string; question: string; scores: Record<string, number>; note: string; current: string; atoms: string; notes: string }> = [];
  let seed = 1213;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < list.length) {
        const item = list[next++];
        const b = build(item);
        const versions = [
          { name: "current", text: b.current },
          { name: "atoms", text: b.withAtoms },
          { name: "notes", text: b.withNotes },
        ].sort(() => rand() - 0.5);
        const letters = versions.map((_, i) => String.fromCharCode(65 + i));
        const prompt = [
          "리그 오브 레전드 도우미의 상성 답 여러 판을 채점하라. 판마다 1~5점. 답은 질문의 언어로 쓰였다.",
          "기준(중요한 순): 1) 정확성 — [자료]와 모순되거나 자료에 없는 사실(아이템·스킬·효과·시점)을 지어내면 크게 깎는다.",
          "   번역이 원문 노트의 뜻을 바꿨으면 틀린 말로 본다.",
          "2) 질문에 답했나 — 사용자가 물은 것을 먼저, 분명하게. 3) 읽기 좋은가 — 그 언어로 자연스럽고 되풀이가 없다.",
          "틀린 말이 하나라도 있으면 3점을 넘지 않는다. 판마다 출처는 가려져 있다.",
          "",
          `[질문] ${b.question}`,
          "",
          "[자료] (도우미가 가진 사실 전부)",
          b.material,
          "",
          ...versions.flatMap((v, i) => [`[판 ${letters[i]}]`, v.text || "(없음)", ""]),
          `JSON 한 줄로만 답한다: {${letters.map((l) => `"${l}": 점수`).join(", ")}, "note": "가장 큰 차이 한 줄"}`,
        ].join("\n");
        const text = process.env.JUDGE === "codex" ? await codexJudge(prompt) : await run("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], prompt);
        let scores: Record<string, number> = {};
        let note = "";
        try {
          const parsed = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? "{}") as Record<string, number | string>;
          scores = Object.fromEntries(versions.map((v, i) => [v.name, Number(parsed[letters[i]])]));
          note = String(parsed.note ?? "");
        } catch {
          // 읽지 못한 답은 점수 없이 남긴다
        }
        results.push({ id: item.id, question: b.question, scores, note, current: b.current, atoms: b.withAtoms, notes: b.withNotes });
      }
    }),
  );
  for (const name of ["current", "atoms", "notes"]) {
    const s = results.map((r) => r.scores[name]).filter((x) => Number.isFinite(x));
    const avg = s.reduce((t, x) => t + x, 0) / (s.length || 1);
    console.log(`${LANG} ${name.padEnd(8)} 평균 ${avg.toFixed(2)} · 4점 이상 ${s.filter((x) => x >= 4).length}/${s.length} · 2점 이하 ${s.filter((x) => x <= 2).length}`);
  }
  const w = results.filter((r) => r.scores.atoms > r.scores.current).length;
  const l = results.filter((r) => r.scores.atoms < r.scores.current).length;
  console.log(`원자 판 승 ${w} · 패 ${l} · 무 ${results.length - w - l}`);
  fs.writeFileSync(OUT, JSON.stringify({ lang: LANG, versions: ["current", "atoms", "notes"], results }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
