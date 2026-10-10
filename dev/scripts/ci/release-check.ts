import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { runCommand, type Command } from "./command";

type Phase = "all" | "prepare" | "verify";
interface Step extends Command { name: string }
const npm = (script: string, args: string[] = []): Step => ({
  name: script, command: "npm", args: ["run", script, ...(args.length ? ["--", ...args] : [])],
});

export function releaseSteps(phase: Phase, browser = false): Step[] {
  const audit: Step = { name: "inventory", command: process.execPath, args: ["--import", "tsx", "dev/scripts/advisor/quality/audit.ts"] };
  const prepare = [audit, npm("llm:prepare-release")];
  const tests = ["test:unit", "test:data"].map(script => ({ ...npm(script),
    env: { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --test-reporter=dot`.trim() },
  }));
  const verify = [audit, npm("type-check"), npm("lint"), ...tests, npm("llm:ticks:audit"), npm("patch-notes:audit"),
    npm("llm:mechanics-eval", ["dev/research/.cache/preflight/mechanics.json", "--check"])];
  const steps = phase === "prepare" ? prepare : phase === "verify" ? verify : [...prepare, ...verify.slice(1)];
  if (browser) steps.push(npm("build"), npm("prepare-pages"), { ...npm("test:e2e", ["--workers=2", "--retries=0"]), env: { CI: "true" } });
  return steps;
}

export async function checkRelease(options: { root: string; phase: Phase; browser?: boolean; signal?: AbortSignal },
  execute = runCommand): Promise<void> {
  const { root, phase, browser = false, signal } = options;
  if (browser && phase === "prepare") throw new Error("Browser checks require the verify phase");
  const directory = path.join(root, "dev/research/.cache/preflight");
  fs.mkdirSync(directory, { recursive: true });
  const report = { sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    phase, browser, startedAt: new Date().toISOString(), pass: false,
    steps: [] as Array<{ name: string; pass: boolean; seconds: number; error?: string }> };
  try {
    for (const step of releaseSteps(phase, browser)) {
      console.log(`[release-check] ${step.name}`);
      const started = performance.now();
      try {
        await execute(step, root, signal);
        report.steps.push({ name: step.name, pass: true, seconds: (performance.now() - started) / 1000 });
      } catch (error) {
        report.steps.push({ name: step.name, pass: false, seconds: (performance.now() - started) / 1000, error: String(error) });
        throw error;
      }
    }
    report.pass = true;
  } finally { fs.writeFileSync(path.join(directory, `release-${phase}.json`), JSON.stringify(report, null, 2) + "\n"); }
}

async function main() {
  const { values } = parseArgs({ options: { phase: { type: "string", default: "all" }, browser: { type: "boolean", default: false } } });
  if (!["all", "prepare", "verify"].includes(values.phase!)) throw new Error("phase: all, prepare, verify");
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try { await checkRelease({ root: process.cwd(), phase: values.phase as Phase, browser: values.browser, signal: controller.signal }); }
  finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`[release-check] ${error}`); process.exitCode = 1; });
}
