/**
 * 오프라인 판정기 시험 — 파이썬(`scripts/llm/offline-classifier/train.py`)과 TS(`offlineJudge.ts`)가 같은 해시·버킷·확률을 내는가
 *
 * 고정값(`tests/fixtures/offline-judge.json`)은 학습 스크립트가 내보낸다. 특징 뽑기를 한쪽만 고치면 여기서 깨진다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { ACT_INSTRUCTIONS, actQuestion } from "../../src/lib/advisor/conversation";
import { JUDGE_KIND_INSTRUCTIONS, JUDGE_KIND9_CRITERIA, JUDGE_MINE_INSTRUCTIONS } from "../../src/lib/advisor/routeAsk";
import { TOPIC_INSTRUCTIONS, TOPIC_LABELS } from "../../src/lib/advisor/topicJudge";
import { answerOffline, featureBuckets, fnv1a32, normalizeMessage, offlineJudge, parseJudgeState, readOfflineModel, type OfflineJudgeMeta } from "../../src/lib/advisor/offlineJudge";

interface Fixture {
  hashes: Record<string, number>;
  buckets: number;
  cases: Array<{ state: string; normalized: string; buckets: number[]; probs: Record<string, number[]>; marked?: string[]; mine?: number[] }>;
}

const root = process.cwd();
const fixture = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "offline-judge.json"), "utf8")) as Fixture;
const meta = JSON.parse(fs.readFileSync(path.join(root, "public", "models", "offline", "judge.json"), "utf8")) as OfflineJudgeMeta;
const bin = fs.readFileSync(path.join(root, "public", "models", "offline", "judge.bin"));
const model = readOfflineModel(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer);

test("FNV-1a 32비트 해시가 파이썬과 같다", () => {
  for (const [key, want] of Object.entries(fixture.hashes)) assert.equal(fnv1a32(key), want, `해시 ${JSON.stringify(key)}`);
  assert.equal(fnv1a32(""), 2166136261, "빈 글은 offset basis");
});

test("상태 글 읽기와 정규화", () => {
  assert.deepEqual(parseJudgeState("Question: Q\nChampions named: A, B"), { message: "Q", names: ["A", "B"] });
  assert.deepEqual(parseJudgeState("Earlier in this chat the user asked how to play M against E.\nNew message: hi\nChampion named in the new message: X"), {
    message: "hi",
    names: ["X"],
  });
  assert.equal(normalizeMessage("How  do I beat Darius as Garen?", ["Darius", "Garen"]), "how do i beat ◇ as ◇ ?", "ASCII 소문자·이름 자리표·공백 한 칸");
  assert.equal(normalizeMessage("How do I beat Darius as Garen?", ["Darius", "Garen"], "Garen"), "how do i beat ◇ as ★ ?", "후보는 ★");
  for (const c of fixture.cases) {
    const { message, names } = parseJudgeState(c.state);
    assert.equal(normalizeMessage(message, names), c.normalized, `정규화 ${c.state}`);
    for (const [i, marked] of (c.marked ?? []).entries()) assert.equal(normalizeMessage(message, names, names[i]), marked, `후보 표시 ${names[i]}`);
  }
});

test("내 챔피언 고르기가 파이썬과 같다(후보 모드)", () => {
  const cases = fixture.cases.filter((c) => c.mine);
  assert.ok(cases.length >= 2, "두 이름 문항이 고정값에 있다");
  for (const c of cases) {
    const { names } = parseJudgeState(c.state);
    const [got] = answerOffline(model, c.state, [{ instructions: JUDGE_MINE_INSTRUCTIONS, options: names.map((name) => ({ name })) }]);
    for (const [i, p] of got.entries()) assert.ok(Math.abs(p - c.mine![i]) < 1e-4, `mine ${names[i]}: ${p} vs ${c.mine![i]}`);
  }
});

test("특징 버킷이 파이썬과 같다", () => {
  assert.equal(model.buckets, fixture.buckets, "버킷 수");
  for (const c of fixture.cases) assert.deepEqual(featureBuckets(c.state, model.buckets), c.buckets, `버킷 ${c.state.split("\n")[0]}`);
});

test("확률이 파이썬과 같다(fp16 가중치)", () => {
  const questions = {
    kind: { instructions: JUDGE_KIND_INSTRUCTIONS, options: Object.keys(JUDGE_KIND9_CRITERIA).map((name) => ({ name })) },
    topic: { instructions: TOPIC_INSTRUCTIONS, options: TOPIC_LABELS.map((name) => ({ name })) },
    // 앱의 흐름 질문은 일곱 칸(lookup 포함)이다 — 분류기가 배운 라벨과 같다
    act: actQuestion("M", "E"),
  };
  for (const c of fixture.cases) {
    for (const [task, want] of Object.entries(c.probs)) {
      const [got] = answerOffline(model, c.state, [questions[task as keyof typeof questions]]);
      assert.equal(got.length, want.length, `${task} 선택지 수`);
      for (const [i, p] of got.entries()) assert.ok(Math.abs(p - want[i]) < 1e-4, `${task} 확률 ${i}: ${p} vs ${want[i]} (${c.state.split("\n")[0]})`);
      assert.ok(Math.abs(got.reduce((a, b) => a + b, 0) - 1) < 1e-6, "확률의 합은 1");
    }
  }
});

test("선택지는 이름으로 맞추고, 모르는 지시문은 고른 확률", () => {
  const state = "Earlier in this chat the user asked how to play Garen against Darius.\nNew message: why?";
  // 앱의 흐름 질문은 일곱 칸(lookup 이 마지막). 여섯 칸은 lookup 을 뺀 옛 꼴
  const seven7 = actQuestion("Garen", "Darius");
  const [six, seven] = answerOffline(model, state, [{ ...seven7, options: seven7.options.filter((option) => option.name !== "lookup") }, seven7]);
  assert.equal(six.length, 6);
  assert.equal(seven.length, 7);
  // 여섯 칸은 일곱 칸에서 lookup 을 뺀 뒤 다시 1 로 맞춘 것
  for (let i = 0; i < 6; i += 1) assert.ok(Math.abs(six[i] - seven[i] / (1 - seven[6])) < 1e-9, `여섯 칸 ${i}`);
  const [unknown] = answerOffline(model, state, [{ instructions: ACT_INSTRUCTIONS, options: [{ name: "zzz" }, { name: "more" }] }]);
  assert.deepEqual(unknown, [0, 1], "모르는 이름은 0, 남은 것은 1");
  const [mine] = answerOffline(model, "Question: hello\nChampions named: X, Y", [{ instructions: JUDGE_MINE_INSTRUCTIONS, options: [{ name: "X" }, { name: "Y" }] }]);
  assert.ok(Math.abs(mine[0] - 0.5) < 1e-9 && Math.abs(mine[1] - 0.5) < 1e-9, "글에 이름이 없으면 후보 둘의 특징이 같아 반반");
  const [none] = answerOffline(model, "Question: a", [{ instructions: "Unknown instructions?", options: [{ name: "x" }, { name: "y" }, { name: "z" }] }]);
  assert.deepEqual(none, [1 / 3, 1 / 3, 1 / 3], "모르는 지시문은 고른 확률");
});

test("파일을 받아 만든 판정기", async () => {
  let reads = 0;
  const judge = offlineJudge(async (file) => {
    reads += 1;
    const buf = fs.readFileSync(path.join(root, "public", file));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  });
  const state = "Question: 大龙多久刷新";
  const [a] = await judge("ignored", state, [{ instructions: JUDGE_KIND_INSTRUCTIONS, options: Object.keys(JUDGE_KIND9_CRITERIA).map((name) => ({ name })) }]);
  const [b] = await judge("ignored", state, [{ instructions: JUDGE_KIND_INSTRUCTIONS, options: Object.keys(JUDGE_KIND9_CRITERIA).map((name) => ({ name })) }]);
  assert.deepEqual(a, b);
  assert.equal(reads, 2, "파일은 한 번만(json + bin) 받는다");
  assert.equal(Object.keys(JUDGE_KIND9_CRITERIA)[a.indexOf(Math.max(...a))], "game", "바론 리젠은 게임 규칙");
});
