import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { buildBank, readRows, ROOT } from "../quality/bank";
import { contextProbability, learnedContextRanker, type ContextRankModel } from "../../../../src/features/advisor/conversation/memory/contextRanker";

const directory = "dev/research/llm-evals/workflow/datasets/context-frames";
const normalize = (text: string) => text.toLowerCase().replace(/\d+(?:\.\d+)?/g, "#").replace(/[^\p{L}#]/gu, "");
const train = readRows(`${directory}/selector-train.jsonl`) as unknown as Array<{ question: string }>;
const dev = readRows(`${directory}/selector-dev.jsonl`) as unknown as Array<{ question: string }>;
const evaluated = [...buildBank().flatMap(story => story.turns.map(turn => turn.q)),
  ...["development", "validation"].flatMap(split => readRows(`${directory}/${split}.jsonl`)
    .flatMap(story => (story.turns as Array<{ q: string }>).map(turn => turn.q)))];
const training = new Set(train.map(row => normalize(row.question)));
assert.equal(dev.filter(row => training.has(normalize(row.question))).length, 0, "Train/dev query overlap");
assert.equal(evaluated.filter(question => training.has(normalize(question))).length, 0, "Training/evaluation query overlap");
const model = JSON.parse(fs.readFileSync(path.join(ROOT, "dev/research/llm-evals/workflow/models/context-selector.json"), "utf8")) as ContextRankModel;
learnedContextRanker(model);
const parity = JSON.parse(fs.readFileSync(path.join(ROOT, "dev/research/.cache/context-frames/20261007/training/parity.json"), "utf8")) as Array<{
  features: Array<[number, number]>; probability: number;
}>;
const error = Math.max(...parity.map(row => Math.abs(contextProbability(model, row.features) - row.probability)));
assert.ok(error < 1e-12, `Python/TypeScript probability mismatch: ${error}`);
console.log(JSON.stringify({ trainSessions: train.length, devSessions: dev.length, trainingQueryTemplates: training.size,
  evaluatedQueries: evaluated.length, normalizedQueryOverlap: 0, parityRows: parity.length, maxProbabilityError: error }));
