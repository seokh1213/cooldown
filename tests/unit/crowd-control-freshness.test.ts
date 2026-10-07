import assert from "node:assert/strict";
import test from "node:test";
import { crowdControlTextHash, currentControl } from "../../scripts/llm/lib/crowdControl";
import { digestSpellText } from "../../scripts/llm/lib/spellOverrides";

test("전체 원문이 같은 CC만 패치를 넘어 재사용하고 수치 변경도 기각한다", () => {
  const text = "적을 2초 동안 기절시킵니다.";
  const known = { status: "known" as const, effects: [], textDigest: digestSpellText(text), textHash: crowdControlTextHash(text) };
  assert.equal(currentControl(known, text, "26.20", "26.19"), true);
  assert.equal(currentControl(known, text.replace("2", "3"), "26.20", "26.19"), false);
  assert.equal(currentControl(known, text.replace("2", "3"), "26.19", "26.19"), false);
  const { textHash: _hash, ...legacy } = known;
  assert.equal(currentControl(legacy, text, "26.20", "26.19"), false);
  assert.equal(currentControl(legacy, text, "26.19", "26.19"), true);
});
