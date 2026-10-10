import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { reviewRuleNotes, type RuleCorrection } from "../../../scripts/advisor/review/review-rule-notes";

const corrections: RuleCorrection[] = JSON.parse(fs.readFileSync("dev/data/knowledge/rule-corrections.json", "utf8")).corrections;
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

test("점화 카드는 근사 간격과 틱 수만 전달하고 상세 계측은 연구 자료에 보존한다", () => {
  const measurement = JSON.parse(fs.readFileSync("dev/research/ability-ticks/ignite-video-20261009/measurement.json", "utf8"));
  assert.equal(measurement.events.length, 5);
  for (const text of Object.values(correction.text)) {
    assert.doesNotMatch(text, /5\.28|1\.056|26\.20|475|0\.833|1\.125/);
  }
  assert.match(correction.text.ko_KR, /약 1초.*5틱/);
  assert.match(correction.text.en_US, /five ticks.*about one second/);
  assert.match(correction.text.zh_CN, /约每秒.*5跳/);
  assert.equal(measurement.summary.totalDamage, 475);
  assert.ok(measurement.method.observationalLimits.length > 0);
  for (const [file, lang] of [["ko", "ko_KR"], ["zh", "zh_CN"]] as const) {
    const translations = JSON.parse(fs.readFileSync(`dev/data/knowledge/rule-translations.${file}.json`, "utf8")).translations;
    assert.equal(translations[correction.text.en_US], correction.text[lang]);
  }
});
