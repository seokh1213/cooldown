import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { appScenarios } from "../stat-classifier/appScenarios";
import { conversations } from "../stat-classifier/conversations";
import { cases as passive } from "../passive-rag/cases";
import { cases as schema } from "../mechanic-schema/cases";
import { dialogueSources, requestSources } from "./sources";
import type { Language } from "../../../../src/shared/i18n";
import type { QualityStory } from "./types";
import { applyReviewedContracts, type ReviewedContract } from "./reviewedContracts";

export const ROOT = path.resolve(import.meta.dirname, "../../../..");
export const EVALS = "dev/research/llm-evals";
export const WORKFLOW = `${EVALS}/workflow`;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value;
}
export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
export function readRows(file: string): Record<string, unknown>[] {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  return file.endsWith(".jsonl") ? text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : JSON.parse(text);
}
const language = (text: string): Language => /[가-힣]/.test(text) ? "ko_KR" : /[一-鿿]/.test(text) ? "zh_CN" : "en_US";

export function mergeStories(stories: QualityStory[]): QualityStory[] {
  const merged = new Map<string, QualityStory>();
  for (const story of stories) {
    const key = digest({ lang: story.lang, turns: story.turns, memory: story.memory, memoryPatch: story.memoryPatch, manual: story.manual, split: story.split });
    const prior = merged.get(key);
    if (prior) {
      prior.sources.push(...story.sources);
      prior.suites = [...new Set([...prior.suites, ...story.suites])];
    } else merged.set(key, { ...story, id: key.slice(0, 20), sources: [...story.sources], suites: [...story.suites] });
  }
  return [...merged.values()];
}

function dialogueBank(): QualityStory[] {
  return dialogueSources.flatMap(relative => {
    const file = `${EVALS}/${relative}`;
    return readRows(file).map(row => {
      const turns = (row.turns as Array<string | Record<string, unknown>>).map(turn => typeof turn === "string"
        ? { q: turn, expected: {} } : { q: String(turn.q), expected: turn });
      return { id: "", suites: [relative.replace(/\.json$/, "")], sources: [{ file, row: String(row.id) }],
        lang: (row.lang ?? turns[0].expected.lang ?? "ko_KR") as Language, turns,
        split: String(row.split ?? (row.holdout || /holdout|variations|fresh/.test(relative) ? "holdout" : "regression")),
        manual: turns.every(turn => Object.keys(turn.expected).length === 0) };
    });
  });
}

function requestBank(): QualityStory[] {
  const stories: QualityStory[] = [];
  const add = (file: string, template: string, scope: string, lang = language(template)) => {
    const names = lang === "ko_KR" ? ["오공", "문도 박사"] : lang === "en_US" ? ["Wukong", "Dr. Mundo"] : ["孙悟空", "蒙多医生"];
    const q = template.replace("◇", names[0]).replace("◇", names[1]);
    stories.push({ id: "", suites: ["request-scope"], lang, split: "heldout",
      sources: [{ file, row: `${scope}:${template}` }], turns: [{ q, expected: { scope } }] });
  };
  for (const name of requestSources) {
    const file = `dev/scripts/advisor/offline-classifier/${name}`;
    const input = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
    if (Array.isArray(input)) { for (const row of input) add(file, row.question, row.expected, row.language); continue; }
    const data = name === "request-negation.json" ? input.test : input;
    const blocks = data.ko_KR ? Object.entries(data) : [[undefined, data]];
    for (const [lang, scopes] of blocks) for (const [scope, texts] of Object.entries(scopes as Record<string, string[]>))
      for (const text of texts) add(file, text, scope, lang as Language | undefined);
  }
  return stories;
}

function extraDialogue(): QualityStory[] {
  const stories: QualityStory[] = [];
  for (const [suite, rows, file] of [
    ["stat-conversation", conversations, "dev/scripts/advisor/stat-classifier/conversations.ts"],
    ["stat-boundary", appScenarios, "dev/scripts/advisor/stat-classifier/appScenarios.ts"],
  ] as const) for (const row of rows) stories.push({ id: "", suites: [suite], lang: row.id === "english" ? "en_US" : row.id === "chinese" ? "zh_CN" : "ko_KR",
    split: "regression", sources: [{ file, row: row.id }], turns: row.turns.map(turn => ({ q: turn.question,
      expected: { statQuery: turn.expected, ...("textIncludes" in turn ? { contains: [turn.textIncludes] } : {}),
        ...("answerKind" in turn ? { answerKind: turn.answerKind } : {}) } })) });
  for (const [suite, rows, file] of [["passive-rag", passive, "dev/scripts/advisor/passive-rag/cases.ts"],
    ["mechanic-schema", schema, "dev/scripts/advisor/mechanic-schema/cases.ts"]] as const) {
    const groups = new Map<string, typeof rows[number][]>();
    for (const row of rows) groups.set(row.group, [...(groups.get(row.group) ?? []), row]);
    for (const [group, entries] of groups) stories.push({ id: "", suites: [suite], lang: "ko_KR", split: "regression",
      sources: [{ file, row: group }], manual: suite === "passive-rag",
      turns: entries.map(row => ({ q: row.question, expected: "checks" in row ? { schemaCase: row } : { criteria: row.criteria, owner: row.expectedOwner } })) });
  }
  const file = `${EVALS}/request-classifier/comparison/flows.json`;
  const rows = (JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")) as { rows: Array<{ mode: string; lang: Language; scenario: string; question: string; expected: string }> }).rows;
  for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) {
    const groups = new Map<string, typeof rows>();
    for (const row of rows.filter(row => row.mode === "current" && row.lang === lang)) groups.set(row.scenario, [...(groups.get(row.scenario) ?? []), row]);
    for (const [group, entries] of groups) stories.push({ id: "", suites: ["request-flow"], lang, split: "regression", sources: [{ file, row: `${lang}:${group}` }],
      turns: entries.map(row => ({ q: row.question, expected: { replyScope: row.expected } })) });
  }
  const heldout = "dev/scripts/advisor/offline-classifier/request-scope-holdout.json";
  const entries = readRows(heldout) as unknown as Array<{ language: Language; question: string; expected: string }>;
  for (const [index, row] of entries.entries()) stories.push({ id: "", suites: ["request-flow-holdout"], lang: row.language, split: "heldout",
    sources: [{ file: heldout, row: String(index) }], turns: [{ q: row.question, expected: { replyScope: row.expected === "ability" ? "R" : row.expected } }] });
  return stories;
}

function singleBank(): QualityStory[] {
  const stories: QualityStory[] = [];
  for (const [suite, file] of [
    ["stat-single", `${EVALS}/stat-query/ml/questions.jsonl`], ["retrieval", `${EVALS}/vector-search/queries.jsonl`],
    ["retrieval", `${EVALS}/datasets/retrieval-v2/questions.jsonl`],
    ["item-alias", `${EVALS}/item-aliases/queries.jsonl`], ["numeric-qa", `${WORKFLOW}/datasets/qa/heldout/numeric.jsonl`],
  ]) for (const [index, row] of readRows(file).entries()) {
    if (row.split && row.split !== "test") continue;
    const q = String(row.question ?? row.q);
    const expected = suite === "stat-single" ? { statQuery: row.expected } : suite === "numeric-qa" ? { numericGold: row } : { docIds: row.gold };
    stories.push({ id: "", suites: [suite, ...(file.includes('/retrieval-v2/') ? ['retrieval-v2'] : [])], lang: (row.lang ?? language(q)) as Language, split: "heldout",
      memory: row.memory as Record<string, unknown> | undefined,
      memoryPatch: suite === "stat-single" && row.memory ? "current" : undefined,
      sources: [{ file, row: String(row.id ?? index) }], turns: [{ q, expected }] });
  }
  return stories;
}

function legacyBank(): QualityStory[] {
  const file = `${EVALS}/kev-agent/a-set.jsonl`;
  const stories: QualityStory[] = readRows(file).map(row => ({ id: "", suites: ["legacy-dialogue-270"], lang: row.lang as Language,
    split: "regression", sources: [{ file, row: String(row.id) }], turns: (row.turns as Array<{ text: string; gold: Record<string, unknown> }>).map(turn => ({ q: turn.text, expected: { legacyGold: turn.gold } })) }));
  const routeFile = `${EVALS}/kev-agent/route-large3.json`;
  const routes = JSON.parse(fs.readFileSync(path.join(ROOT, routeFile), "utf8")) as { cases: Array<{ lang: Language; question: string; kind3: string; mine?: string }> };
  stories.push(...routes.cases.map((row, index) => ({ id: "", suites: ["legacy-route-374"], lang: row.lang, split: "heldout",
    sources: [{ file: routeFile, row: String(index) }], turns: [{ q: row.question, expected: { routeGold: row.kind3, mine: row.mine } }] })));
  for (const name of ["act-test.jsonl", "lookup-test.jsonl"]) {
    const source = `${EVALS}/kev-agent/${name}`;
    for (const [index, row] of readRows(source).entries()) stories.push({ id: "", suites: [name === "act-test.jsonl" ? "legacy-act-60" : "legacy-lookup-39"],
      lang: row.lang as Language, split: "heldout", sources: [{ file: source, row: String(index) }], turns: [
        { q: `${row.mine} vs ${row.enemy}`, expected: { want: { kind: "matchup", mine: row.mine, enemy: row.enemy } } },
        { q: String(row.text), expected: { flowGold: row } },
      ] });
  }
  return stories;
}

function retiredBank(): QualityStory[] {
  const stories: QualityStory[] = [];
  const routeFile = `${WORKFLOW}/datasets/archive/retired/route-cases.json`;
  const routes = JSON.parse(fs.readFileSync(path.join(ROOT, routeFile), "utf8")) as { test: Array<{ lang: Language; question: string; kind: string; mine?: string }> };
  for (const [index, row] of routes.test.entries()) stories.push({ id: "", suites: ["retired-route-60"], lang: row.lang, split: "historical-heldout",
    sources: [{ file: routeFile, row: String(index) }], turns: [{ q: row.question, expected: { routeGold: row.kind, coarseOther: row.kind === "other", mine: row.mine } }] });
  const verifyFile = `${WORKFLOW}/datasets/archive/retired/test.jsonl`;
  for (const [index, row] of readRows(verifyFile).entries()) stories.push({ id: "", suites: ["retired-verifier-330"], lang: "ko_KR", split: "historical-review", manual: true,
    sources: [{ file: verifyFile, row: String(index) }], turns: [{ q: "Is every claim in the sentence supported by the material?", expected: { verifierContext: row.state } }] });
  const facts = `${WORKFLOW}/datasets/archive/retired/eval-cases.json`;
  for (const row of readRows(facts)) stories.push({ id: "", suites: ["retired-matchup-4"], lang: "ko_KR", split: "old-patch-review", manual: true,
    sources: [{ file: facts, row: String(row.id) }], turns: [{ q: `${row.me} vs ${row.enemy} ${row.lane} 상대법`, expected: { oldContract: row } }] });
  return stories;
}

function videoBank(): QualityStory[] {
  return ["questions.json", "coverage-questions.json"].flatMap(name => {
    const file = `dev/research/video-notes/mangdasu-20261006/${name}`;
    const input = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")) as {
      cases: Array<{ id: string; lang: Language; question: string; expected: string[]; forbidden?: string[] }>;
      sessions: Array<{ id: string; lang: Language; turns: Array<{ question: string; expected: string[]; forbidden?: string[] }> }>;
    };
    const turn = (entry: typeof input.cases[number] | typeof input.sessions[number]["turns"][number]) =>
      ({ q: entry.question, expected: { contains: entry.expected, avoid: entry.forbidden ?? [] } });
    return [...input.cases.map(entry => ({ id: "", suites: ["video-tips"], lang: entry.lang, split: "regression",
      sources: [{ file, row: entry.id }], turns: [turn(entry)] })),
      ...input.sessions.map(entry => ({ id: "", suites: ["video-tips"], lang: entry.lang, split: "regression",
        sources: [{ file, row: entry.id }], turns: entry.turns.map(turn) }))];
  });
}
export function buildBank(): QualityStory[] {
  const stories = mergeStories([...dialogueBank(), ...extraDialogue(), ...requestBank(), ...singleBank(), ...legacyBank(), ...retiredBank(), ...videoBank()]);
  return applyReviewedContracts(stories, readRows(`${WORKFLOW}/datasets/regression/reviewed-contracts.jsonl`) as unknown as ReviewedContract[]);
}
