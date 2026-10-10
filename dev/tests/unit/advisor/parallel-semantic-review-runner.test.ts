import assert from "node:assert/strict";
import test from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { officialGlossary, parseArguments, prepareJobs, reviewBatch, validateLiveSections, workPool } from "../../../scripts/advisor/review/parallel-semantic-review";
import type { ManifestSection } from "../../../scripts/advisor/review/parallel-semantic-review";
import { fingerprint } from "../../../scripts/advisor/translations/lib/translation-review-queue";
import { readCurrentPatchVersion } from "../../../scripts/advisor/lib/data";

const section: ManifestSection = {
  lang: "en_US", me: "Lux", enemy: "Akali", slot: "watch", ko: "원문", text: "Translation", newCandidate: true,
  sourceSha256: fingerprint("원문"), candidateSha256: fingerprint("Translation"),
};
const manifest = (sections: ManifestSection[]) => ({ generatedAt: "2026-10-04T00:00:00Z", sections });

test("manifest partition preserves all sections and rejects duplicates and bad hashes", () => {
  const sections = Array.from({ length: 257 }, (_, index) => ({ ...section, slot: `slot${index}` }));
  const jobs = prepareJobs(manifest(sections), 128);
  assert.deepEqual(jobs.map((job) => job.sections.length), [128, 128, 1]);
  assert.equal(new Set(jobs.flatMap((job) => job.sections).map((row) => row.slot)).size, sections.length);
  assert.equal(sections[2].slot, "slot2");
  assert.throws(() => prepareJobs(manifest([section, section]), 128), /Duplicate/);
  assert.throws(() => prepareJobs(manifest([{ ...section, candidateSha256: "bad" }]), 128), /fingerprint/);
});

test("CLI accepts only Sol, bounded concurrency/batches and UTC deadline", () => {
  const args = ["--input", "input.json", "--output-dir", "out", "--deadline", "2026-10-04T10:00:00Z"];
  assert.equal(parseArguments(args).concurrency, 8);
  assert.equal(parseArguments(args).batch, 256);
  for (const extra of [["--model", "other"], ["--concurrency", "25"], ["--batch", "64"]]) assert.throws(() => parseArguments([...args, ...extra]));
  assert.throws(() => parseArguments(args.map((arg) => arg.replace(/Z$/, "+09:00"))));
});

test("pool never exceeds its bound and leaves unstarted jobs at deadline", async () => {
  let running = 0, maximum = 0, now = 0;
  const started: number[] = [];
  const deferred = await workPool([0, 1, 2, 3], { concurrency: 2, deadline: 10, now: () => now }, async (job) => {
    running += 1;
    maximum = Math.max(maximum, running);
    started.push(job);
    await Promise.resolve();
    now = 10;
    running -= 1;
  });
  assert.equal(maximum, 2);
  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(deferred, [2, 3]);
});

test("deadline is checked again after preparation and prevents model call", async () => {
  let now = 0, calls = 0;
  const artifact = await reviewBatch({ id: "sample", sections: [section] }, { model: "gpt-6.1-sol", deadline: 10 }, {
    validate: () => {}, glossary: () => { now = 10; return ""; }, now: () => now,
    call: async () => { calls += 1; return ""; },
  });
  assert.equal(calls, 0);
  assert.equal(artifact.status, "deadline");
  assert.deepEqual(artifact.decisions, []);
});

test("changed source after model call discards all approvals", async () => {
  let checks = 0;
  const artifact = await reviewBatch({ id: "sample", sections: [section] }, { model: "gpt-6.1-sol", deadline: 10 }, {
    validate: () => { if (++checks === 2) throw new Error("secret session id must not be logged"); },
    glossary: () => "", now: () => 0, call: async () => "unparsed approval",
  });
  assert.equal(checks, 2);
  assert.equal(artifact.reason, "source_changed_during_review");
  assert.equal(artifact.sourceFingerprintValidated, false);
  assert.equal(artifact.directModelComparison, true);
  assert.deepEqual(artifact.decisions, []);
  assert.ok(!JSON.stringify(artifact).includes("secret session"));
});

test("failed model call has no retry and independent jobs continue", async () => {
  let calls = 0;
  const artifacts: Awaited<ReturnType<typeof reviewBatch>>[] = [];
  await workPool([0, 1, 2, 3], { concurrency: 2, deadline: 10, now: () => 0 }, async (id) => {
    artifacts.push(await reviewBatch({ id: String(id), sections: [section] }, { model: "gpt-6.1-sol", deadline: 10 }, {
      validate: () => {}, glossary: () => "", now: () => 0,
      call: async () => { calls += 1; throw new Error("failed"); },
    }));
  });
  assert.equal(calls, 4);
  assert.equal(artifacts.length, 4);
  assert.ok(artifacts.every((artifact) => artifact.reason === "model_call_failed" && artifact.decisions.length === 0));
});

test("live validation prefers valid staging and falls back only when its basis differs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-review-test-"));
  const locations = { sourceDir: path.join(root, "source"), candidateDir: path.join(root, "candidate"), trustedDir: path.join(root, "trusted") };
  function write(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }
  const store = (basis: string, text: string) => ({ pairs: { Akali: { watch: { basis, text } } } });
  try {
    write(path.join(locations.sourceDir, "Lux.json"), { pairs: { Akali: { watch: section.ko } } });
    const candidateFile = path.join(locations.candidateDir, "en_US", "Lux.json");
    write(candidateFile, store(section.ko, section.text));
    write(path.join(locations.trustedDir, "en_US", "Lux.json"), store(section.ko, "Different trusted text"));
    validateLiveSections([section], locations);
    write(candidateFile, store(section.ko, "Regenerated candidate"));
    assert.throws(() => validateLiveSections([section], locations));
    write(candidateFile, store("Old source", "Old candidate"));
    const trustedSection = { ...section, text: "Different trusted text", candidateSha256: fingerprint("Different trusted text") };
    validateLiveSections([trustedSection], locations);
    write(path.join(locations.sourceDir, "Lux.json"), { pairs: { Akali: { watch: "Changed source" } } });
    assert.throws(() => validateLiveSections([trustedSection], locations));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});


test("jobs group both languages of the same Korean row without mutating the manifest", () => {
  const zh = { ...section, lang: "zh_CN" };
  const other = { ...section, enemy: "Zed" };
  const input = manifest([zh, other, section]);
  assert.deepEqual(prepareJobs(input, 128)[0].sections, [section, zh, other]);
  assert.deepEqual(input.sections, [zh, other, section]);
});


test("successful explicit decisions use supplied patch context and require primary integration", async () => {
  for (const patch of ["26.20", undefined]) {
    let prompt = "";
    const glossary = "Supplied official names and rework summaries";
    const artifact = await reviewBatch({ id: "sample", sections: [section] }, { model: "gpt-6.1-sol", deadline: 10, patch }, {
      validate: () => {}, glossary: () => glossary, now: () => 0,
      call: async (value) => {
        prompt = value;
        return JSON.stringify({ reviewedCount: 1, unchanged: [0], corrections: [], held: [] });
      },
    });
    assert.equal(artifact.status, "completed");
    assert.ok(prompt.includes(glossary));
    if (patch) assert.ok(prompt.includes(`authoritative for current patch ${patch}.`));
    else assert.ok(!/current patch \d+\.\d+/.test(prompt));
    assert.equal(artifact.sourceFingerprintValidated, true);
    assert.equal(artifact.decisions[0].sourceSha256, section.sourceSha256);
    assert.equal(artifact.decisions[0].candidateSha256, section.candidateSha256);
    assert.equal(artifact.decisions[0].needsPrimaryReview, true);
    assert.equal(artifact.decisions[0].text, section.text);
  }
});

test("incomplete model partition yields a failed artifact with no approval", async () => {
  const artifact = await reviewBatch({ id: "sample", sections: [section] }, { model: "gpt-6.1-sol", deadline: 10 }, {
    validate: () => {}, glossary: () => "", now: () => 0,
    call: async () => JSON.stringify({ reviewedCount: 1, unchanged: [], corrections: [], held: [] }),
  });
  assert.equal(artifact.status, "failed");
  assert.equal(artifact.reason, "invalid_model_decisions");
  assert.deepEqual(artifact.decisions, []);
});


test("official glossary carries names, title and HTML-stripped summaries capped at 800 characters", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-glossary-test-"));
  try {
    fs.mkdirSync(path.join(root, "en_US"));
    for (const champion of ["Lux", "Akali"]) {
      fs.writeFileSync(path.join(root, "en_US", `${champion}.json`), JSON.stringify({ champion: {
        name: champion, title: "<b>Champion title</b>", abilities: {
          P: { name: "Official Passive", summary: "<font color='red'>Form &amp; weapon</font><br>" + "x".repeat(900), bodyHtml: "DO NOT INCLUDE BODY" },
        },
      } }));
    }
    const glossary = officialGlossary(root)([section]);
    assert.ok(glossary.includes("P: Official Passive"));
    assert.ok(glossary.includes("title: Champion title"));
    const summaries = glossary.split("\n").filter((line) => line.startsWith("P summary: "));
    assert.equal(summaries.length, 2);
    assert.equal([...summaries[0].slice("P summary: ".length)].length, 800);
    assert.ok(summaries[0].includes("Form & weapon"));
    assert.ok(!glossary.includes("<font"));
    assert.ok(!glossary.includes("DO NOT INCLUDE BODY"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Chinese Kayn form names come from local passive metadata including body fallback", () => {
  const row = { ...section, lang: "zh_CN", me: "Kayn", enemy: "Kayn" };
  const local = officialGlossary(path.resolve("public/data", readCurrentPatchVersion(), "champions"))([row]);
  assert.ok(local.includes("影流刺客"));
  assert.ok(local.includes("暗裔杀手"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-kayn-test-"));
  try {
    fs.mkdirSync(path.join(root, "zh_CN"));
    fs.writeFileSync(path.join(root, "zh_CN", "Kayn.json"), JSON.stringify({ champion: {
      name: "凯隐", title: "凯隐", abilities: { P: { name: "暗裔魔镰", summary: "简述", bodyHtml: "<b>影流刺客</b>与暗裔杀手" } },
    } }));
    assert.ok(officialGlossary(root)([row]).includes("P local form names: 影流刺客 / 暗裔杀手"));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
