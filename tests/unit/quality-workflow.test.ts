import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mergeStories, digest, buildBank } from "../../scripts/llm/quality/bank";
import videoCoverage from "../../research/video-notes/mangdasu-20261006/coverage-questions.json";
import { compareReports, verifyReview, reviewPacket, saveReport } from "../../scripts/llm/quality/report";
import type { QualityReport, QualityStory, QualityRow } from "../../scripts/llm/quality/types";
import { generationTasks, validateArtifact, type GenerationArtifact } from "../../scripts/llm/quality/tasks";
import { numericChecks, numericRequest } from "../../scripts/llm/quality/numeric";
import { openOllama } from "../../scripts/llm/quality/ollama";
import { scopeMatches, observedAnswer } from "../../scripts/llm/quality/checks";
import { graphRoute } from "../../scripts/llm/quality/model";
import { inventoryChanges, refreshedRecords } from "../../scripts/llm/quality/audit";
import { currentDataDirectory, retiredFiles, historicalInputs } from "../../scripts/llm/quality/archive";
import type { AdvisorAnswer } from "../../src/lib/advisor/answer";
import { runDialogue } from "../../scripts/llm/quality/dialogue";

const story = (prefix: string, answer: string, source: string): QualityStory => ({ id: "", suites: [source], lang: "ko_KR",
  split: "regression", sources: [{ file: source, row: "case" }], turns: [{ q: prefix, expected: {} }, { q: "얼마야?", expected: { contains: [answer] } }] });
const report = (): QualityReport => ({ schema: 1, profile: "model", caseHash: "cases", dataHash: "data", sourceHash: "source", scorerHash: "scorer",
  graphHash: "graph", created: "fixed", checks: [], rows: [{ id: "one", suite: ["QA"], mode: "model", question: "Q", text: "A",
      seconds: 0, checks: [{ label: "correct", pass: true }], pass: true }] });

test("CPU 대화 평가도 저장 주기 뒤에 도착한 종료 신호를 처리한다", async () => {
  const controller = new AbortController();
  const fixture: QualityStory = { id: "interrupt", suites: ["test"], lang: "ko_KR", split: "regression", sources: [],
    turns: Array.from({ length: 26 }, () => ({ q: "안녕", expected: {} })) };
  setImmediate(() => controller.abort());
  await assert.rejects(runDialogue({ stories: [fixture], mode: "none",
    deps: { judge: async () => { throw Error("unexpected judge"); }, search: async () => [] },
    record: () => controller.signal.throwIfAborted() }), { name: "AbortError" });
});

test("mixed datasets exclude training and development rows from historical evaluation", () => {
  const rows = historicalInputs([
    { split: "train", question: "training question" }, { split: "dev", question: "selection question" },
    { split: "test", question: "held-out question" },
    { train: [{ question: "nested training question" }], dev: [{ question: "nested development question" }],
      test: [{ turns: ["history", "current question"] }] },
  ]);
  assert.deepEqual(rows.map(row => [row.q, row.history]), [
    ["held-out question", []], ["history", []], ["current question", ["history"]],
  ]);
});

test("quality provenance follows 26.20 and later manifests without selecting an old patch", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "advisor-patch-provenance-"));
  const directory = path.join(root, "public/data");
  fs.mkdirSync(directory, { recursive: true });
  try {
    for (const [patchVersion, ddragon, cdragon] of [["26.20", "16.20.1", "16.20"], ["27.1", "17.1.1", "17.1"]]) {
      fs.writeFileSync(path.join(directory, "version.json"), JSON.stringify({ schemaVersion: 2, patchVersion, sources: { ddragon, cdragon } }));
      assert.equal(currentDataDirectory(root), `public/data/${patchVersion}`);
    }
    fs.writeFileSync(path.join(directory, "version.json"), JSON.stringify({ schemaVersion: 2, patchVersion: "../../old", sources: { ddragon: "16.19.1", cdragon: "16.19" } }));
    assert.throws(() => currentDataDirectory(root), /Invalid current patch/);
    fs.rmSync(path.join(directory, "version.json"));
    assert.throws(() => currentDataDirectory(root), /ENOENT/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("persistent browser caching separates graph contents even when their file path is reused", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "advisor-graph-cache-"));
  const graph = path.join(directory, "model_q4.onnx"), copy = path.join(directory, "copy.onnx");
  try {
    fs.writeFileSync(graph, "base graph without QA gate");
    fs.copyFileSync(graph, copy);
    const baseline = graphRoute(graph);
    assert.equal(graphRoute(copy), baseline);
    fs.writeFileSync(graph, "candidate graph with QA gate");
    assert.notEqual(graphRoute(graph), baseline);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("identical tests share provenance; different histories and answers remain separate", () => {
  const merged = mergeStories([story("오공", "10", "first"), story("오공", "10", "second"), story("문도", "10", "third"), story("오공", "20", "fourth")]);
  assert.equal(merged.length, 3);
  assert.deepEqual(merged[0].suites, ["first", "second"]);
  assert.equal(merged[0].sources.length, 2);
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
});

test("stat follow-up fixtures use the current patch only when explicitly requested", async () => {
  const memory = { patch: "historical", conditions: [], active: "stat",
    stat: { kind: "championStat", champions: ["MonkeyKing", "DrMundo"], field: "health", level: 1 } };
  const fixture: QualityStory = { id: "seed", suites: ["test"], lang: "ko_KR", split: "regression", sources: [], memory,
    turns: [{ q: "그럼 체력은 얼마야?", expected: {} }] };
  const rows: QualityRow[] = [];
  await runDialogue({ stories: [{ ...fixture, id: "current", memoryPatch: "current" }, fixture], mode: "none",
    deps: { judge: async () => { throw Error("unexpected judge"); }, search: async () => [] }, record: row => rows.push(row) });
  assert.match(rows[0].text, /오공/);
  assert.match(rows[0].text, /문도/);
  assert.notEqual(rows[1].observed?.kind, "compare");
  assert.doesNotMatch(rows[1].text, /문도/);
  assert.equal(memory.patch, "historical");
  assert.equal(mergeStories([fixture, { ...fixture, memoryPatch: "current" }]).length, 2);
  const seeded = buildBank().filter(story => story.memory);
  assert.ok(seeded.length > 0);
  assert.ok(seeded.every(story => story.memoryPatch === "current" && story.suites.includes("stat-single")));
});

test("expanded video coverage enters the common model bank with its original assertions", () => {
  const bank = buildBank().filter(story => story.sources.some(source => source.file.endsWith("coverage-questions.json")));
  for (const fixture of videoCoverage.cases) {
    const story = bank.find(story => story.sources.some(source => source.row === fixture.id));
    assert.ok(story, `Missing expanded coverage: ${fixture.id}`);
    assert.equal(story.lang, fixture.lang);
    assert.equal(story.turns[0].q, fixture.question);
    assert.deepEqual(story.turns[0].expected.contains, fixture.expected);
    assert.deepEqual(story.turns[0].expected.avoid, fixture.forbidden ?? []);
  }
});

test("legacy scope contracts check the exact ability, field, and opponent perspective", () => {
  const spell = { kind: "spell", spell: { slot: "R" } } as AdvisorAnswer;
  assert.equal(scopeMatches(spell, "R"), true);
  assert.equal(scopeMatches(spell, "Q"), false);
  const stats = (fields: string[]) => ({ kind: "compare", statQuery: { field: fields[0], fields } }) as unknown as AdvisorAnswer;
  assert.equal(scopeMatches(stats(["attackSpeed"]), "stats"), true);
  assert.equal(scopeMatches(stats(["armor"]), "stats"), false);
  assert.equal(scopeMatches(stats(["attackSpeed", "armor"]), "stats"), false);
  const single = { kind: "champion", card: { id: "MonkeyKing" }, statQuery: { field: "attackSpeed", level: 1 } } as unknown as AdvisorAnswer;
  assert.equal(scopeMatches(single, "stats"), true);
  assert.equal(scopeMatches(JSON.parse(JSON.stringify(observedAnswer(single))) as AdvisorAnswer, "stats"), true);
  const against = { kind: "compare", matchup: true, cards: [{ id: "MonkeyKing" }, { id: "Fiora" }] } as unknown as AdvisorAnswer;
  assert.equal(scopeMatches(against, "against"), true);
  assert.equal(scopeMatches({ ...against, matchup: false } as AdvisorAnswer, "against"), false);
});

test("partial checkpoint files never qualify as completed quality or infrastructure checks", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "advisor-partial-report-"));
  try {
    const current = report();
    current.checks = [{ name: "split-separation", pass: true, log: "unused" }];
    const partial = saveReport(directory, current, { gains: [], regressions: [] });
    assert.equal(partial.complete, false);
    assert.equal(partial.infrastructurePassed, false);
    assert.equal(partial.promotion, "incomplete");
    current.checks.push({ name: "complete-coverage", pass: true, log: "unused" });
    assert.equal(saveReport(directory, current, { gains: [], regressions: [] }).promotion, "eligible");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("a clean checkout may omit ignored research artifacts but must keep required fixtures", () => {
  const locked = [{ file: "fixture.json", localOnly: false }, { file: "local-results.json", localOnly: true }];
  assert.deepEqual(inventoryChanges([{ file: "fixture.json" }], locked), { added: [], removed: [] });
  assert.equal(inventoryChanges([], locked).removed[0].file, "fixture.json");
  assert.equal(inventoryChanges([{ file: "new-case.json" }], locked).added[0].file, "new-case.json");
});

test("inventory refresh retains historical optional provenance without retaining deleted required files", () => {
  const previous = [{ file: "required.json", localOnly: false, hash: "old" }, { file: "removed.json", localOnly: false, hash: "deleted" },
    { file: "local-results.json", localOnly: true, hash: "historical" }];
  const current = [{ file: "required.json", localOnly: false, hash: "new" }, { file: "new-test.ts", localOnly: false, hash: "added" }];
  assert.deepEqual(refreshedRecords(current, previous), [current[0], previous[2], current[1]]);
});

test("retired fixtures come from the tested branch, not an unmerged experiment", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "advisor-history-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, "-c", "user.name=Quality fixture",
    "-c", "user.email=quality@example.invalid", "-c", "commit.gpgsign=false", ...args], { stdio: "pipe" });
  try {
    git("init", "--quiet", "--initial-branch=main");
    fs.mkdirSync(path.join(root, "research/llm-evals/workflow/datasets/archive/retired"), { recursive: true });
    fs.writeFileSync(path.join(root, "research/llm-evals/workflow/datasets/archive/retired/sources.json"), "[]");
    fs.writeFileSync(path.join(root, "research/old.json"), "{}");
    git("add", "research/old.json"); git("commit", "--quiet", "-m", "Initial fixture");
    git("switch", "--quiet", "--create", "experiment");
    fs.writeFileSync(path.join(root, "research/in-progress.json"), "{}");
    git("add", "research/in-progress.json"); git("commit", "--quiet", "-m", "Unmerged experiment");
    git("switch", "--quiet", "main");
    git("rm", "--quiet", "research/old.json"); git("commit", "--quiet", "-m", "Retired fixture");
    assert.deepEqual(retiredFiles(root).map(row => row.file), ["research/old.json"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Ollama cleanup unloads only a model loaded by this run", async () => {
  const original = globalThis.fetch;
  for (const alreadyLoaded of [false, true]) {
    const requests: string[] = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input); requests.push(url);
      if (url.endsWith("/ps")) return Response.json({ models: alreadyLoaded ? [{ name: "qwen" }] : [] });
      if (url.endsWith("/tags")) return Response.json({ models: [{ name: "qwen", digest: "fixed" }] });
      if (url.endsWith("/chat")) {
        const body = JSON.parse(String(init!.body));
        assert.equal(body.think, false); assert.equal(body.options.temperature, 0); assert.equal(body.options.num_predict, 24);
        assert.ok(init?.signal);
        return new Response('{"message":{"content":"3초"},"done":true}\n');
      }
      assert.equal(JSON.parse(String(init!.body)).keep_alive, 0);
      return Response.json({ done: true });
    };
    try {
      const provider = await openOllama("qwen", new AbortController().signal);
      assert.equal(await provider.generate("system", "question", 24), "3초");
      await provider.close();
      assert.equal(requests.some(url => url.endsWith("/generate")), !alreadyLoaded);
    } finally { globalThis.fetch = original; }
  }
});

test("a score increase cannot hide a previously correct answer that regressed", () => {
  const baseline = report(), candidate = report();
  candidate.rows[0].pass = false;
  assert.deepEqual(compareReports(candidate, baseline).regressions, ["model:one"]);
  candidate.dataHash = "other-patch";
  assert.throws(() => compareReports(candidate, baseline), /different cases, data/);
});

test("partial or duplicated coverage cannot be compared as a complete benchmark", () => {
  const baseline = report(), candidate = report();
  candidate.rows = [];
  assert.throws(() => compareReports(candidate, baseline), /coverage mismatch/);
  candidate.rows = [baseline.rows[0], baseline.rows[0]];
  assert.throws(() => compareReports(candidate, baseline), /Duplicate benchmark/);
});

test("unscored semantics and failed contracts require artifact-matched review", () => {
  const current = report(); current.rows[0].pass = null;
  const review = reviewPacket(current);
  assert.equal(review.rows.length, 1);
  assert.equal(verifyReview(current, review).length, 1);
  review.rows[0].verdict = "pass"; review.rows[0].reason = "근거와 조건을 확인함";
  assert.deepEqual(verifyReview(current, review), []);
  review.rows.push({ ...review.rows[0], key: "other" });
  assert.match(verifyReview(current, review)[0], /Unexpected review/);
  review.rows.pop();
  review.dataHash = "new-patch";
  assert.match(verifyReview(current, review)[0], /does not match/);
  review.dataHash = current.dataHash;
  review.graphHash = "another-model";
  assert.match(verifyReview(current, review)[0], /does not match/);
});

test("protected answers cannot change even when both satisfy their coarse assertions", () => {
  const current = report(), baseline = report();
  current.rows[0].preserve = true; current.rows[0].text = "Different claim";
  assert.deepEqual(compareReports(current, baseline).regressions, ["model:one"]);
});

test("Ollama and Colab artifacts use exact shared scoring and complete task provenance", () => {
  const item = story("unused", "unused", "numeric");
  item.turns = [{ q: "쿨타임은?", expected: { numericGold: { answer: "3초", context: "쿨타임 3초, 지속 4초", answerable: true, conflictingSource: false } } }];
  item.id = "numeric";
  const packet = generationTasks([item]);
  assert.equal(JSON.stringify(packet).includes('"answer"'), false);
  const artifact: GenerationArtifact = { schema: 1, taskHash: packet.taskHash,
    model: { backend: "native-cuda", name: "Qwen", revision: "immutable" }, rows: [{ id: packet.tasks[0].id, text: "4초", seconds: 1 }] };
  validateArtifact(packet, artifact);
  assert.equal(numericChecks("4초", item.turns[0].expected.numericGold as Parameters<typeof numericChecks>[1])[0].pass, false);
  assert.equal(numericChecks(" 3초\n", item.turns[0].expected.numericGold as Parameters<typeof numericChecks>[1])[0].pass, true);
  assert.match(numericRequest("쿨타임은?", "쿨타임 3초").prompt, /Question: 쿨타임은\?/);
  artifact.rows.push(artifact.rows[0]);
  assert.throws(() => validateArtifact(packet, artifact), /Incomplete, duplicate/);
  artifact.rows.pop(); artifact.taskHash = "different";
  assert.throws(() => validateArtifact(packet, artifact), /different tasks/);
  const current = report(), baseline = report(); current.backend = "ollama"; baseline.backend = "native-cuda";
  assert.throws(() => compareReports(current, baseline), /different cases, data/);
});
