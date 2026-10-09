import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { runCommand } from "./command";

function updates(input: string): Array<{ commit: string; base: string }> {
  return input.trim().split("\n").filter(Boolean).flatMap(line => {
    const fields = line.trim().split(/\s+/);
    const oid = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
    if (fields.length !== 4 || !oid.test(fields[1]) || !oid.test(fields[3])) throw new Error("Invalid pre-push input");
    return /^0+$/.test(fields[1]) ? [] : [{ commit: fields[1], base: fields[3] }];
  });
}

export function pushedCommits(input: string): string[] { return [...new Set(updates(input).map(update => update.commit))]; }

export function browserCommits(root: string, input: string): string[] {
  return [...new Set(updates(input).filter(({ commit, base }) => {
    const args = /^0+$/.test(base) ? ["ls-tree", "-r", "--name-only", commit] : ["diff", "--name-only", base, commit];
    const files = execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\n");
    return files.some(file => /^(?:src\/|public\/|knowledge\/|data\/|scripts\/|e2e\/|docs\/lol-fundamentals\.md$|(?:playwright|vite)\.config\.|tsconfig.*\.json$|package(?:-lock)?\.json$)/.test(file));
  }).map(update => update.commit))];
}

function foreignEnvironment(inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const names = execFileSync("git", ["rev-parse", "--local-env-vars"], { encoding: "utf8" }).trim().split("\n");
  // Git이 훅에 넘긴 저장소 위치가 임시 checkout의 Git 명령에 섞이면 원본을 검사·수정하게 된다.
  return { ...inherited, ...Object.fromEntries(names.map(name => [name, undefined])) };
}

export async function validatePush(options: {
  root: string; commits: string[]; browserCommits?: string[]; signal?: AbortSignal; environment?: NodeJS.ProcessEnv;
}, validate = async (snapshot: string, signal: AbortSignal | undefined, browser: boolean, env: NodeJS.ProcessEnv) => runCommand({
    command: "npm", args: ["run", "check:release", ...(browser ? ["--", "--browser"] : [])],
    env,
  }, snapshot, signal)) {
  const { root, commits, signal } = options;
  const env = foreignEnvironment(options.environment ?? process.env);
  for (const commit of commits) {
    signal?.throwIfAborted();
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cooldown-pre-push-"));
    const snapshot = path.join(temporary, "checkout");
    try {
      execFileSync("git", ["clone", "--shared", "--no-checkout", "--quiet", "--", root, snapshot], { env, stdio: "pipe" });
      execFileSync("git", ["config", "core.hooksPath", ".git/disabled-hooks"], { cwd: snapshot, env, stdio: "pipe" });
      execFileSync("git", ["checkout", "--quiet", "--detach", commit], { cwd: snapshot, env, stdio: "pipe" });
      const lock = (directory: string) => fs.readFileSync(path.join(directory, "package-lock.json"));
      if (!lock(snapshot).equals(lock(root))) throw new Error("Pushed commit and local dependency lock differ; check out that commit and run npm ci first");
      const modules = path.join(root, "node_modules");
      if (!fs.existsSync(modules)) throw new Error("Run npm ci before pushing");
      fs.symlinkSync(modules, path.join(snapshot, "node_modules"), "junction");
      console.log(`[pre-push] ${commit.slice(0, 12)}: 배포 준비와 검증, 작업 폴더는 유지`);
      await validate(snapshot, signal, options.browserCommits?.includes(commit) ?? false, env);
    } finally {
      try {
        const report = path.join(snapshot, "research/.cache/preflight/release-all.json");
        if (fs.existsSync(report)) {
          const directory = path.join(root, "research/.cache/preflight");
          fs.mkdirSync(directory, { recursive: true });
          fs.copyFileSync(report, path.join(directory, `push-${commit}.json`));
        }
      } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
    }
  }
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try { await validatePush({ root: process.cwd(), commits: pushedCommits(input),
    browserCommits: browserCommits(process.cwd(), input), signal: controller.signal }); }
  finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[pre-push] 중단: ${error}`); process.exitCode = 1; });
}
