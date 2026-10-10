/** 고정된 test에서 항목 판정과 전체 조회 요청을 별도로 잰다. */
import fs from "node:fs";
import assert from "node:assert/strict";
import { correctNames, predict } from "./runtime";
import type { Example } from "./contracts";
import { directory, models, modeNames, runQuestion } from "./adapter";
import { nameCases } from "./seeds";
import { data } from "./runtime";
import { resolveQuestion } from "../../../../src/features/advisor/understanding/resolvedQuestion";
import type { ChampionStatQuery } from "../../../../src/features/advisor/understanding/stats/statQuery";

const examples: Example[] = fs.readFileSync(`${directory}/questions.jsonl`, "utf8").trim().split("\n").map(line => JSON.parse(line));
const test = examples.filter(row => row.split === "test");

function same(a: ChampionStatQuery | null, b: ChampionStatQuery | null): boolean { return JSON.stringify(a) === JSON.stringify(b); }
const ratio = (values: boolean[]) => ({ correct: values.filter(Boolean).length, total: values.length });
const expectedField = (row: Example) => row.expected?.field ?? "other";

let maxProbabilityDifference = 0;
for (const [name, model] of Object.entries(models)) {
  const fixture: Array<{ input: Pick<Example, "text" | "features">; probabilities: number[] }> = JSON.parse(fs.readFileSync(`${directory}/${name}-parity.json`, "utf8"));
  for (const row of fixture) {
    predict(model, row.input).probabilities.forEach((value, index) => {
      const difference = Math.abs(value - row.probabilities[index]);
      maxProbabilityDifference = Math.max(maxProbabilityDifference, difference);
      assert.ok(difference < 1e-8, `${name}: Python과 Node 계산 불일치 ${difference}`);
    });
  }
}

const results = modeNames.map(mode => {
  const rows = test.map(row => {
    const result = runQuestion(row, mode);
    return { id: row.id, category: row.category, question: row.question, expected: row.expected, expectedField: expectedField(row),
      ...result, exact: same(result.query, row.expected), field: (result.query?.field ?? "other") === expectedField(row) };
  });
  const negative = rows.filter(row => row.expected === null);
  const positive = rows.filter(row => row.expected !== null);
  const times = rows.map(row => row.milliseconds).sort((a, b) => a - b);
  return { mode, exact: ratio(rows.map(row => row.exact)), field: ratio(rows.map(row => row.field)),
    positiveExact: ratio(positive.map(row => row.exact)), falseQuery: negative.filter(row => row.query !== null).length, negativeCount: negative.length,
    rejectedPositive: positive.filter(row => row.query === null).length,
    categories: Object.fromEntries([...new Set(rows.map(row => row.category))].map(category => [category, ratio(rows.filter(row => row.category === category).map(row => row.exact))])),
    modelCalls: rows.filter(row => "decision" in row).length,
    medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.floor(times.length * 0.95)], rows };
});
const names = nameCases.map(([question, expected]) => {
  const corrected = correctNames(question);
  const before = resolveQuestion(question, data).champions.map(card => card.id);
  const after = resolveQuestion(corrected.text, data).champions.map(card => card.id);
  return { question, expected, before, after, changes: corrected.changes, beforeCorrect: JSON.stringify(before) === JSON.stringify(expected), afterCorrect: JSON.stringify(after) === JSON.stringify(expected) };
});
const summary = { test: test.length, parity: { maximumProbabilityDifference: maxProbabilityDifference },
  results: results.map(({ rows: _rows, ...summary }) => summary), names: { before: ratio(names.map(row => row.beforeCorrect)), after: ratio(names.map(row => row.afterCorrect)),
    falseCorrections: names.filter(row => !row.expected.length && row.changes.length).length } };
fs.writeFileSync(`${directory}/results.json`, JSON.stringify({ ...summary, detail: results, nameDetails: names }, null, 2));
console.log(JSON.stringify(summary, null, 2));
