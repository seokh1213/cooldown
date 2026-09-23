/**
 * 판정기 시험
 *
 * 헤드는 파이썬에서 학습하고 브라우저에서 계산한다. 두 쪽이 같은 확률을 내는지, 입력
 * 꼴이 kev 와 같은지, 상성 요약이 검증된 문장만 쓰는지 본다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import type { Playbook } from "./llm/lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { encodeJudgeRow, readJudgeHead, scoreJudge, type JudgeHeadMeta } from "../src/lib/advisor/judge";
import { JUDGE_KIND_INSTRUCTIONS, JUDGE_MINE_INSTRUCTIONS, routeFromJudge } from "../src/lib/advisor/routeAsk";
import { buildCompareAnswer } from "../src/lib/advisor/answer";
import { matchupNotes, type AdvisorData } from "../src/lib/advisor/context";
import { answerProse } from "../src/lib/advisor/prose";

let checks = 0;
const ok = (value: unknown, message: string) => {
  assert.ok(value, message);
  checks += 1;
};

// --- 헤드: 내보낸 파일로 계산한 확률이 파이썬(torch)과 같다 ---
const dir = path.join(process.cwd(), "public", "models", "judge");
const meta = JSON.parse(fs.readFileSync(path.join(dir, "route-v2.json"), "utf8")) as JudgeHeadMeta;
const bin = fs.readFileSync(path.join(dir, "route-v2.bin"));
const head = readJudgeHead(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
ok(head.dim === head.subset.length, "특징 차원은 고른 토큰 수와 같다");
ok(meta.instructions.kind === JUDGE_KIND_INSTRUCTIONS && meta.instructions.mine === JUDGE_MINE_INSTRUCTIONS, "헤드가 배운 지시문과 앱이 묻는 지시문이 같다");
const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "fixtures", "judge-route-v2.json"), "utf8")) as {
  features: number[][];
  probs: number[];
  label: number;
};
const probs = scoreJudge(head, fixture.features.map((row) => Float32Array.from(row)));
ok(probs.length === fixture.probs.length, "선택지 수만큼 확률이 나온다");
for (const [i, p] of probs.entries()) ok(Math.abs(p - fixture.probs[i]) < 1e-4, `확률 ${i} 가 파이썬과 같다 (${p} vs ${fixture.probs[i]})`);
ok(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-6, "확률의 합은 1");

// --- 입력 꼴: kev 와 같다. 선택지마다 </opt>, 마지막이 <decide> ---
{
  const special = [1, 2, 3, 4, 5];
  const tokenize = (text: string) => [...text].map((ch) => ch.charCodeAt(0));
  const row = encodeJudgeRow(tokenize, special, "ab", { instructions: "q", options: [{ name: "x", description: "d" }, { name: "y" }] });
  ok(row.ids[0] === 1 && row.ids[3] === 2, "<state> 로 시작하고 지시 앞에 <q> 가 온다");
  ok(row.positions.length === 3, "선택지 둘 + decide");
  ok(row.ids[row.positions[0]] === 4 && row.ids[row.positions[1]] === 4, "선택지 판정 위치는 </opt>");
  ok(row.ids[row.positions[2]] === 5 && row.positions[2] === row.ids.length - 1, "마지막 판정 위치는 <decide>");
  // 설명이 있는 선택지는 "이름: 설명" 으로 적는다(학습 자료의 꼴)
  const optStart = row.ids.indexOf(3) + 1;
  ok(String.fromCharCode(...row.ids.slice(optStart, row.positions[0])) === "x: d", "설명은 '이름: 설명' 꼴");
}

// --- 갈래 확률 → 화면이 쓰는 갈래 ---
const llmDir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const card = (id: string) => cards.find((c) => c.id === id)!;
{
  const [wukong, rumble] = [card("MonkeyKing"), card("Rumble")];
  const route = routeFromJudge([0.9, 0.05, 0.02, 0.02, 0.01], [0.2, 0.8], [wukong, rumble]);
  ok(route.kind === "matchup" && route.mine?.id === "Rumble", "matchup 이면 확률이 높은 쪽이 내 챔피언");
  ok(routeFromJudge([0.9, 0.05, 0.02, 0.02, 0.01], undefined, [wukong]).kind === "guide", "이름이 하나면 matchup 을 guide 로 내린다");
  ok(routeFromJudge([0.1, 0.1, 0.1, 0.6, 0.1], undefined, [wukong]).kind === "spellStat", "가장 높은 갈래를 고른다");
}

// --- 상성 요약: 칸(조심할 것·아이템·싸우는 법)을 코드가 정하고 검증된 문장만 쓴다 ---
{
  const knowledge = JSON.parse(fs.readFileSync(path.join(llmDir, "advisor-knowledge.json"), "utf8")) as { playbooks: Record<string, Playbook> };
  const items = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "items-normalized-ko_KR.json"), "utf8")) as { items: unknown[] }).items;
  const data = { cards, items, cardById: new Map(cards.map((c) => [c.id, c])), playbooks: new Map(Object.entries(knowledge.playbooks)) } as unknown as AdvisorData;
  const [me, enemy] = [card("MonkeyKing"), card("Rumble")];
  const notes = matchupNotes(data, me, enemy, "ko_KR");
  const answer = buildCompareAnswer([me, enemy], "오공으로 럼블 팁", undefined, { matchup: true, notes, lang: "ko_KR" });
  const digest = answerProse(answer, "ko_KR");
  const section = (title: string) => new RegExp(`\\*\\*${title}\\*\\*\\n([^\\n]+)`).exec(digest)?.[1] ?? "";
  // 사용자가 짚은 두 가지: 럼블 E 가 마법 저항력을 깎는다, 오공은 마저가 낮아 마저 아이템이 먼저다
  ok(/럼블 E 전기 작살/.test(section("조심할 것")) && /마법 저항력/.test(section("조심할 것")), "조심할 것: 럼블 E 전기 작살이 마법 저항력을 깎는다");
  ok(/오공의 마법 저항력이 낮은/.test(section("아이템")), "아이템: 오공의 마법 저항력이 낮다");
  ok(/마법무효화의 망토/.test(section("아이템")) && /헤르메스의 발걸음/.test(section("아이템")), "아이템: 초반 마저 아이템 이름은 아이템 자료에서");
  ok(/Q 파쇄격/.test(section("싸우는 법")), "싸우는 법: 내 콤보, 슬롯이 붙는다");
  // 초반 아이템 한 줄 말고는 노트·도출 문장 그대로다
  const first = (text: string) => text.split(/(?<=[.!?])\s+/)[0];
  const pool = [...(notes.plan?.claims.map((c) => c.text) ?? []), ...(notes.plan?.mine ?? []), ...(notes.plan?.enemy ?? [])].map((entry) =>
    first(typeof entry === "string" ? entry : entry.text),
  );
  const bare = (text: string) => text.replace(/\b[PQWER] (?=\S)/g, "").replace(/^럼블 /, "");
  const sentences = digest.split("\n").filter((line) => line && !line.startsWith("**")).flatMap((line) => line.split(/(?<=[.!?])\s+/));
  for (const sentence of sentences) ok(pool.some((note) => bare(note) === bare(sentence)), `검증된 문장이다: ${sentence}`);
  // 한 칸은 두 문장을 넘지 않는다
  for (const title of ["조심할 것", "아이템", "싸우는 법"]) ok(section(title).split(/(?<=[.!?])\s+/).length <= 2, `${title} 는 두 문장 이하`);
}

console.log(`✅ 판정기 통과 (${checks}건)`);
