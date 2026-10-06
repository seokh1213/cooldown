import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { updateKnowledgeDriftIssue } from "../../scripts/ci/knowledge-drift-issue";

test("동일한 점검 보고서는 사람의 댓글 뒤에도 알림을 반복하지 않고 새 본문 지문은 알린다", t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "knowledge-drift-issue-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const report = path.join(directory, "report.md");
  const original = "클레드 | 24 | `old` → `new`";
  const current = { number: 39, body: "이전 보고서", comments: [
    { body: original, author: { login: "github-actions" } },
    { body: "확인 중", author: { login: "maintainer" } },
  ] };
  const writes: string[][] = [];
  const gh = (args: string[]) => {
    if (args[1] === "list") return JSON.stringify([{ number: 39, title: "지식 계층 점검 필요" }]);
    if (args[1] === "view") return JSON.stringify(current);
    writes.push(args);
    return "";
  };
  writeFileSync(report, `${original}\n`);
  assert.equal(updateKnowledgeDriftIssue(report, gh), "unchanged");
  assert.deepEqual(writes, []);
  writeFileSync(report, original.replace("`new`", "`next`"));
  assert.equal(updateKnowledgeDriftIssue(report, gh), "updated");
  assert.deepEqual(writes, [["issue", "comment", "39", "--body-file", report]]);
});

test("새 보고서에는 이슈를 생성하고 기존 이슈 본문과 같거나 보고서가 비면 쓰지 않는다", t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "knowledge-drift-issue-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const report = path.join(directory, "report.md");
  writeFileSync(report, "새 변경\n");
  const writes: string[][] = [];
  const gh = (args: string[]) => {
    if (args[1] === "list") return "[]";
    writes.push(args);
    return "";
  };
  assert.equal(updateKnowledgeDriftIssue(report, gh), "created");
  assert.deepEqual(writes, [["issue", "create", "--title", "지식 계층 점검 필요", "--body-file", report]]);
  assert.equal(updateKnowledgeDriftIssue(report, args => args[1] === "list"
    ? JSON.stringify([{ number: 39, title: "지식 계층 점검 필요" }])
    : JSON.stringify({ number: 39, body: "새 변경", comments: [] })), "unchanged");
  writeFileSync(report, "\n");
  assert.equal(updateKnowledgeDriftIssue(report, () => { assert.fail("empty reports must not call GitHub"); }), "empty");
});

test("미검수 리워크의 본문이 다시 바뀌면 실제 생성 보고서가 달라지고 새 알림을 남긴다", t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "knowledge-drift-rework-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const data = path.join(directory, "public", "data");
  const llm = path.join(data, "26.19", "llm");
  const knowledge = path.join(directory, "knowledge");
  mkdirSync(llm, { recursive: true });
  mkdirSync(knowledge);
  writeFileSync(path.join(data, "version.json"), JSON.stringify({ patchVersion: "26.19" }));
  const baseline = JSON.stringify({ Kled: { names: "old-names", text: "old-text", checkedPatch: "26.19", spells: "P 기존 스킬" } });
  const fingerprints = path.join(knowledge, "champion-fingerprints.json");
  writeFileSync(fingerprints, baseline);
  const report = path.join(directory, "knowledge-drift-report.md");
  const script = fileURLToPath(new URL("../../scripts/llm/report-knowledge-drift.ts", import.meta.url));
  const generate = (text: string) => {
    writeFileSync(path.join(llm, "champion-cards-ko_KR.json"), JSON.stringify({ cards: [{
      id: "Kled", name: "클레드", spells: [{ slot: "P", name: "변경된 스킬", text, effects: [] }],
    }] }));
    execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), script], {
      cwd: directory, timeout: 10_000,
      env: { ...process.env, GITHUB_OUTPUT: path.join(directory, "actions-output"), GITHUB_STEP_SUMMARY: "" },
    });
    return readFileSync(report, "utf8");
  };
  const original = generate("적을 기절시키는 효과를 사용합니다");
  assert.match(original, /리워크 의심/);
  assert.equal(generate("적을 기절시키는 효과를 사용합니다"), original);
  const changed = generate("아군에게 보호막 효과를 사용합니다");
  assert.notEqual(changed, original);
  assert.equal(readFileSync(fingerprints, "utf8"), baseline);
  const writes: string[][] = [];
  const gh = (args: string[]) => {
    if (args[1] === "list") return JSON.stringify([{ number: 39, title: "지식 계층 점검 필요" }]);
    if (args[1] === "view") return JSON.stringify({ number: 39, body: original, comments: [] });
    writes.push(args);
    return "";
  };
  assert.equal(updateKnowledgeDriftIssue(report, gh), "updated");
  assert.deepEqual(writes, [["issue", "comment", "39", "--body-file", report]]);
});
