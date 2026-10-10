import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkRelease } from "../../../scripts/ci/release-check";
import { browserCommits, pushedCommits, validatePush } from "../../../scripts/ci/pre-push";

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cooldown-harness-test-"));
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Harness fixture");
  git("config", "user.email", "fixture@example.invalid");
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\ndev/research/.cache/\n");
  fs.writeFileSync(path.join(root, "package-lock.json"), "{}");
  fs.writeFileSync(path.join(root, "bank.json"), "missing combo");
  fs.mkdirSync(path.join(root, "node_modules"));
  git("add", "."); git("commit", "--quiet", "-m", "fixture");
  return { root, git, commit: git("rev-parse", "HEAD"), close: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("등록 누락은 배포 준비 전에 중단하며 목록을 자동 갱신하지 않는다", async () => {
  const fixture = repository(), executed: string[] = [];
  try {
    await assert.rejects(checkRelease({ root: fixture.root, phase: "all" }, async step => {
      executed.push(step.args.join(" "));
      throw new Error("Inventory changed (9 added, 0 removed)");
    }), /Inventory changed/);
    assert.equal(executed.length, 1);
    const report = JSON.parse(fs.readFileSync(path.join(fixture.root, "dev/research/.cache/preflight/release-all.json"), "utf8"));
    assert.equal(report.pass, false);
    assert.equal(report.steps[0].name, "inventory");
    assert.equal(fixture.git("status", "--porcelain"), "");
  } finally { fixture.close(); }
});

test("배포 준비 후 데이터가 빠지면 데이터 검사에서 멈추고 빌드하지 않는다", async () => {
  const fixture = repository(), executed: string[] = [];
  try {
    await assert.rejects(checkRelease({ root: fixture.root, phase: "all", browser: true }, async step => {
      const script = step.args[1]; executed.push(script);
      if (script === "llm:prepare-release") fs.writeFileSync(path.join(fixture.root, "bank.json"), "quarantined");
      if (script === "test:data") assert.equal(fs.readFileSync(path.join(fixture.root, "bank.json"), "utf8"), "reviewed combo");
    }), /quarantined/);
    assert.ok(executed.indexOf("llm:prepare-release") < executed.indexOf("test:data"));
    assert.equal(executed.includes("build"), false);
  } finally { fixture.close(); }
});

test("작업 폴더의 미커밋 수정이 푸시할 커밋의 실패를 숨길 수 없다", async () => {
  const fixture = repository(); let snapshot = "";
  try {
    fs.writeFileSync(path.join(fixture.root, "bank.json"), "reviewed combo");
    await assert.rejects(validatePush({ root: fixture.root, commits: [fixture.commit] }, async directory => {
      snapshot = directory;
      assert.equal(fs.readFileSync(path.join(directory, "bank.json"), "utf8"), "reviewed combo");
    }), /missing combo/);
    assert.equal(fs.existsSync(path.dirname(snapshot)), false, "failed checkouts must be reclaimed");
    assert.equal(fs.readFileSync(path.join(fixture.root, "bank.json"), "utf8"), "reviewed combo");
    assert.equal(fixture.git("worktree", "list", "--porcelain").match(/^worktree /gm)?.length, 1);
  } finally { fixture.close(); }
});

test("성공·중단 모두 임시 복사본을 제거하고 원본 자료를 유지한다", async () => {
  const fixture = repository(), controller = new AbortController(); let snapshot = "";
  try {
    await validatePush({ root: fixture.root, commits: [fixture.commit] }, async directory => {
      snapshot = directory; fs.writeFileSync(path.join(directory, "bank.json"), "generated");
    });
    assert.equal(fs.existsSync(path.dirname(snapshot)), false);
    assert.equal(fs.readFileSync(path.join(fixture.root, "bank.json"), "utf8"), "missing combo");
    await assert.rejects(validatePush({ root: fixture.root, commits: [fixture.commit], signal: controller.signal }, async directory => {
      snapshot = directory; controller.abort(); controller.signal.throwIfAborted();
    }), /abort/i);
    assert.equal(fs.existsSync(path.dirname(snapshot)), false);
  } finally { fixture.close(); }
});

test("같은 커밋은 한 번 검사하고 삭제만 하는 푸시는 검사하지 않는다", () => {
  const commit = "a".repeat(40), zero = "0".repeat(40);
  assert.deepEqual(pushedCommits(`refs/heads/master ${commit} refs/heads/master ${zero}\nrefs/tags/v1 ${commit} refs/tags/v1 ${zero}`), [commit]);
  assert.deepEqual(pushedCommits(`(delete) ${zero} refs/heads/old ${commit}`), []);
  assert.throws(() => pushedCommits("refs/heads/master --help refs/heads/master zero"), /Invalid/);
});

test("여러 커밋을 한 번에 푸시해도 중간의 화면·자료 변경을 브라우저 검사 대상으로 잡는다", () => {
  const fixture = repository();
  try {
    fs.mkdirSync(path.join(fixture.root, "src"));
    fs.writeFileSync(path.join(fixture.root, "src/component.ts"), "export const updated = true;");
    fixture.git("add", "."); fixture.git("commit", "--quiet", "-m", "ui");
    fs.writeFileSync(path.join(fixture.root, "README.md"), "docs");
    fixture.git("add", "."); fixture.git("commit", "--quiet", "-m", "docs");
    const head = fixture.git("rev-parse", "HEAD");
    assert.deepEqual(browserCommits(fixture.root, `refs/heads/master ${head} refs/heads/master ${fixture.commit}`), [head]);
    const ui = fixture.git("rev-parse", "HEAD^");
    assert.deepEqual(browserCommits(fixture.root, `refs/heads/master ${head} refs/heads/master ${ui}`), []);
  } finally { fixture.close(); }
});

test("훅의 GIT_DIR·GIT_WORK_TREE·인덱스 위치가 임시 checkout으로 새지 않는다", async () => {
  const fixture = repository();
  try {
    const environment = { ...process.env, GIT_DIR: path.join(fixture.root, ".git"), GIT_WORK_TREE: fixture.root,
      GIT_INDEX_FILE: path.join(fixture.root, ".git/index"), GIT_COMMON_DIR: path.join(fixture.root, ".git") };
    await validatePush({ root: fixture.root, commits: [fixture.commit], environment }, async (snapshot, _signal, _browser, env) => {
      const actual = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: snapshot, env, encoding: "utf8" }).trim();
      assert.equal(fs.realpathSync(actual), fs.realpathSync(snapshot));
      execFileSync("git", ["add", "."], { cwd: snapshot, env });
    });
    assert.equal(fixture.git("status", "--porcelain"), "");
  } finally { fixture.close(); }
});
