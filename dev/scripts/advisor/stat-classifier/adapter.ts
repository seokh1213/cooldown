import fs from "node:fs";
import { correctNames, inputFeatures, predict, queryFor } from "./runtime";
import type { Example, LinearModel } from "./contracts";

export const directory = "dev/research/llm-evals/stat-query/ml";
export const models = Object.fromEntries(["char", "context"].map(name => [name, JSON.parse(fs.readFileSync(`${directory}/${name}.json`, "utf8")) as LinearModel]));
export const modeNames = ["current", "rules", "char", "context", "hybridChar", "hybridContext"] as const;
export type Mode = typeof modeNames[number];

export function runQuestion(row: Pick<Example, "question" | "memory">, mode: Mode) {
  const start = performance.now();
  const corrected = mode === "current" ? { text: row.question, changes: [] } : correctNames(row.question);
  const rule = queryFor(corrected.text, row.memory);
  if (mode === "current" || mode === "rules" || mode.startsWith("hybrid") && rule) {
    return { query: rule, milliseconds: performance.now() - start, changes: corrected.changes };
  }
  const model = models[mode.toLowerCase().includes("context") ? "context" : "char"];
  const decision = predict(model, inputFeatures(corrected.text, row.memory));
  const learned = queryFor(corrected.text, row.memory, decision.label);
  return { query: learned, decision, milliseconds: performance.now() - start, changes: corrected.changes };
}
