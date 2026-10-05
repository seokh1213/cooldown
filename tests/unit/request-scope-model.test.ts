import assert from "node:assert/strict";
import { test } from "node:test";
import { readRequestScope, requestScopePrompt, withRequestModel } from "../../src/lib/advisor/requestScopeModel";
import type { ResolvedQuestion } from "../../src/lib/advisor/resolvedQuestion";

test("전체 스킬·단일 R의 모순과 잘못된 JSON을 채택하지 않는다", () => {
  for (const value of ["broken", "null", JSON.stringify({ scope: "skills", slots: ["R"], breadth: "specific" }),
    JSON.stringify({ scope: "skills", slots: ["R"], breadth: "all" }),
    JSON.stringify({ scope: "unknown", slots: [], breadth: "all" }),
    JSON.stringify({ scope: "ability", slots: ["R", "R"], breadth: "specific" })]) {
    assert.equal(readRequestScope(value), undefined);
  }
  assert.deepEqual(readRequestScope('{"scope":"ability","slots":["R"],"breadth":"specific"}'), { scope: "ability", confidence: 0 });
  assert.deepEqual(readRequestScope('{"scope":"skills","slots":[],"breadth":"all"}'), { scope: "skills", confidence: 0 });
});

test("빠른 판정이 승인됐거나 모델을 못 쓰면 생성하지 않는다", async () => {
  const resolved = { text: "오공 설명해줘", mentions: [], champions: [], spellFocus: undefined } as unknown as ResolvedQuestion;
  let calls = 0;
  const model = async () => { calls++; return undefined; };
  assert.equal((await withRequestModel(async () => ({ scope: "overview", confidence: 0.9 }), model)(resolved))?.scope, "overview");
  assert.equal(await withRequestModel(async () => undefined)(resolved), undefined);
  assert.equal(calls, 0);
});

test("낮은 확신만 모델로 넘기며 실패하면 기존 계획기를 사용할 수 있다", async () => {
  const resolved = { text: "오공 R 알려줘", mentions: [{ index: 0, length: 2 }], champions: [], spellFocus: undefined } as unknown as ResolvedQuestion;
  const model = async (text: string) => {
    assert.equal(text, "◇ r 알려줘");
    return { scope: "ability" as const, confidence: 0 };
  };
  assert.equal((await withRequestModel(async () => undefined, model)(resolved))?.scope, "ability");
  assert.equal(await withRequestModel(async () => undefined, async () => { throw new Error("timeout"); })(resolved), undefined);
});

test("세 언어에서 동일한 필드·범위와 현재 질문을 사용한다", () => {
  for (const language of ["ko_KR", "en_US", "zh_CN"] as const) {
    const prompt = requestScopePrompt("current question", language);
    assert.equal(prompt.maxTokens, 80);
    assert.deepEqual(prompt.messages.at(-1), { role: "user", content: "current question" });
    const examples = prompt.messages.filter(row => row.role === "assistant");
    assert.equal(examples.length, 15);
    for (const example of examples) assert.ok(readRequestScope(example.content));
  }
});
