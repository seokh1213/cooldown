/** Deliver reminders to the existing primary TUI. This process never starts a model. */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { acceptedFollowup, terminalBelongsToReview } from "./primary-review-monitor";
import type { CommandReply } from "./primary-review-monitor";

interface Config { enabled: boolean; intervalSeconds: number; minimumPendingSections: number }
const root = process.cwd();
const run = path.resolve(process.env.TRANSLATION_RUN_DIR ?? "dev/research/translation-runs/2026-10-04");
const terminal = process.env.PRIMARY_REVIEW_TERMINAL;
const cli = process.env.PRIMARY_REVIEW_ORCA_CLI ?? "orca";
const statePath = path.join(run, "primary-monitor-runtime.json");
const lock = path.join(run, "primary-monitor.lock");
const configPath = path.join(run, "primary-monitor.json");
const prompt = "이 기존 대화의 주 담당자가 cooldown 번역 검수를 계속합니다. "
  + "dev/research/translation-runs/2026-10-04/PRIMARY_REVIEW.md와 현재 큐를 읽고, "
  + "최소 64개를 원문과 직접 대조·수정·반영하고 진행률을 저장합니다. "
  + "별도 세션·에이전트·검수 모델은 만들지 않습니다. "
  + "문맥이 충분하면 다음 묶음도 계속 검수합니다. 생성 완료 후 남은 항목과 최종 감사도 진행합니다.";

function state(phase: string, extra: Record<string, unknown> = {}): void {
  const previous = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) as { lastFollowupAt?: string } : {};
  const temp = `${statePath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify({ phase, updatedAt: new Date().toISOString(), pid: process.pid,
    sameConversationOnly: true, createsReviewer: false, lastFollowupAt: previous.lastFollowupAt, ...extra }, null, 2)}\n`);
  fs.renameSync(temp, statePath);
}

function orca(args: string[]): CommandReply {
  const response = spawnSync(cli, args.concat("--json"), { cwd: root, encoding: "utf8", timeout: 20_000 });
  // Raw CLI output may contain private runtime identifiers. Never persist it.
  try { return JSON.parse(response.stdout) as CommandReply; }
  catch { return { ok: false, error: { code: "unreadable_reply" } }; }
}

function readConfig(): Config {
  return JSON.parse(fs.readFileSync(configPath, "utf8")) as Config;
}

function queueReady(config: Config): boolean {
  const result = spawnSync(process.execPath, ["--import", "tsx", "dev/scripts/advisor/translations/translation-review-queue.ts",
    "--run-dir", run, "--patch", "26.19", "--precheck", "--threshold", String(config.minimumPendingSections)],
  { cwd: root, encoding: "utf8", timeout: 30_000 });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error("Review queue check failed");
}

function acquireLock(): void {
  if (fs.existsSync(lock)) {
    const owner = Number(fs.readFileSync(path.join(lock, "pid"), "utf8"));
    try { process.kill(owner, 0); throw new Error("An existing monitor is active"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      fs.rmSync(lock, { recursive: true });
    }
  }
  fs.mkdirSync(lock);
  fs.writeFileSync(path.join(lock, "pid"), String(process.pid));
}

async function monitor(): Promise<void> {
  if (!terminal) throw new Error("An existing primary terminal is required");
  acquireLock();
  try {
    state("starting");
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    while (true) {
      const config = readConfig();
      if (!config.enabled) { state("disabled"); return; }
      if (!terminalBelongsToReview(orca(["terminal", "show", "--terminal", terminal]))) {
        throw new Error("The primary terminal cannot be verified");
      }
      if (!queueReady(config)) {
        state("waiting_for_candidates");
        await new Promise((resolve) => setTimeout(resolve, config.intervalSeconds * 1000));
        continue;
      }
      // The host's idle probe stays busy even after the primary finishes. Public
      // terminal send already delivers steering to this exact conversation while
      // active; let the existing TUI queue it rather than starting another agent.
      // A failed/ambiguous send is never retried as a fresh prompt.
      const receipt = orca(["terminal", "send", "--terminal", terminal, "--text", prompt, "--enter", "--wait-submit", "5"]);
      if (!acceptedFollowup(receipt)) throw new Error("Follow-up delivery was not confirmed");
      state("followup_accepted", { lastFollowupAt: new Date().toISOString() });
      await new Promise((resolve) => setTimeout(resolve, config.intervalSeconds * 1000));
    }
  } catch {
    state("failed", { reason: "Monitoring stopped; no replacement reviewer was created" });
    process.exitCode = 1;
  } finally {
    if (fs.readFileSync(path.join(lock, "pid"), "utf8") === String(process.pid)) fs.rmSync(lock, { recursive: true });
  }
}

void monitor().catch(() => { process.exitCode = 1; });
