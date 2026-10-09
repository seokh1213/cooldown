import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { reviewRuleNotes, type RuleCorrection } from "../../scripts/llm/review-rule-notes";

const corrections: RuleCorrection[] = JSON.parse(fs.readFileSync("knowledge/rule-corrections.json", "utf8")).corrections;
const correction = corrections[0];
const rule = { page: correction.page, notes: ["Keep another interaction", correction.original],
  notesKo: ["다른 상호작용 유지", "옛 번역"], notesZh: ["保留其他交互", "旧翻译"] };

test("검수 교정은 일치하는 문장과 세 언어 번역만 바꾸고 재실행해도 같다", () => {
  const [reviewed] = reviewRuleNotes([rule], corrections);
  assert.equal(reviewed.notes[0], rule.notes[0]);
  assert.equal(reviewed.notes[1], correction.text.en_US);
  assert.equal(reviewed.notesKo[1], correction.text.ko_KR);
  assert.equal(reviewed.notesZh[1], correction.text.zh_CN);
  assert.deepEqual(reviewRuleNotes([reviewed], corrections), [reviewed]);
  assert.equal(rule.notes[1], correction.original);
});

test("원문이 바뀌거나 다른 규칙이면 과거 교정을 덮어씌우지 않는다", () => {
  const changed = { ...rule, notes: ["New source timing"] };
  const other = { ...rule, page: "Another spell" };
  assert.deepEqual(reviewRuleNotes([changed, other], corrections), [changed, other]);
  assert.throws(() => reviewRuleNotes([{ ...rule, notesKo: ["misaligned"] }], corrections), /alignment/);
  assert.throws(() => reviewRuleNotes([rule], [...corrections, correction]), /Invalid rule correction/);
});

test("점화 관측은 원자료와 일치하고 고정 서버 주기나 패치 확인을 주장하지 않는다", () => {
  const measurement = JSON.parse(fs.readFileSync("research/ability-ticks/ignite-video-20261009/measurement.json", "utf8"));
  assert.equal(measurement.events.length, 5);
  for (const text of Object.values(correction.text)) {
    assert.match(text, /475/);
    assert.match(text, /0\.833.*1\.125/);
    assert.doesNotMatch(text, /5\.28|1\.056|26\.20/);
  }
  assert.match(correction.text.ko_KR, /확정할 수 없.*패치.*확인되지/);
  for (const [file, lang] of [["ko", "ko_KR"], ["zh", "zh_CN"]] as const) {
    const translations = JSON.parse(fs.readFileSync(`knowledge/rule-translations.${file}.json`, "utf8")).translations;
    assert.equal(translations[correction.text.en_US], correction.text[lang]);
  }
});
