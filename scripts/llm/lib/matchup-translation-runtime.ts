import * as fs from "node:fs";
import { spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";

export interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
}

export function maskNameOccurrences(text: string, names: string[]): string {
  const chars = [...text];
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    let start = 0;
    let index = text.indexOf(name, start);
    while (index >= 0) {
      for (let i = index; i < index + name.length; i += 1) chars[i] = " ";
      start = index + name.length;
      index = text.indexOf(name, start);
    }
  }
  return chars.join("");
}

export function groupMatchupJobs<T extends { enemy: string }>(jobs: T[], maxPairs: number, maxJobs: number): T[][] {
  const byEnemy = new Map<string, T[]>();
  for (const job of jobs) byEnemy.set(job.enemy, [...(byEnemy.get(job.enemy) ?? []), job]);
  const groups: T[][] = [];
  let current: T[] = [];
  let pairCount = 0;
  for (const enemyJobs of byEnemy.values()) {
    for (let offset = 0; offset < enemyJobs.length; offset += maxJobs) {
      const chunk = enemyJobs.slice(offset, offset + maxJobs);
      if (current.length && (pairCount >= maxPairs || current.length + chunk.length > maxJobs)) {
        groups.push(current);
        current = [];
        pairCount = 0;
      }
      current.push(...chunk);
      pairCount += 1;
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

export function codexUsageFromJson(events: string): TokenUsage | undefined {
  let usage: TokenUsage | undefined;
  for (const line of events.split("\n")) {
    try {
      const event = JSON.parse(line) as {
        info?: { total_token_usage?: TokenUsage };
        token_usage?: TokenUsage;
        usage?: TokenUsage;
      };
      usage = event.info?.total_token_usage ?? event.token_usage ?? event.usage ?? usage;
    } catch {
      // Ignore progress lines that are not JSON events.
    }
  }
  return usage;
}

export function appendCodexUsage(logPath: string | undefined, stage: string, lang: string, id: string, usage?: TokenUsage): void {
  if (!logPath || !usage) return;
  const { input_tokens, cached_input_tokens, output_tokens } = usage;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify({ at: new Date().toISOString(), stage, lang, id, input_tokens, cached_input_tokens, output_tokens })}\n`);
}

export async function runCodexTranslation(
  prompt: string,
  options: { model: string; stage: string; lang: string; id: string; logPath?: string },
): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-translation-"));
  const out = path.join(dir, "out.txt");
  const args = [
    "exec", "--json", "--ephemeral", "--ignore-user-config", "--disable", "plugins", "--disable", "multi_agent",
    "--skip-git-repo-check", "-s", "read-only", "-m", options.model, "-c", 'model_reasoning_effort="medium"',
    "-C", dir, "-o", out, "-",
  ];
  try {
    const events = await new Promise<{ text: string; code: number | null }>((resolve, reject) => {
      const child = spawn("codex", args, { cwd: dir });
      let text = "";
      const timeout = setTimeout(() => child.kill("SIGTERM"), 10 * 60 * 1000);
      child.stdout.on("data", (chunk: Buffer) => (text += chunk));
      child.stderr.resume();
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ text, code });
      });
      child.stdin.end(prompt);
    });
    appendCodexUsage(options.logPath, options.stage, options.lang, options.id, codexUsageFromJson(events.text));
    if (events.code !== 0) throw new Error(`Codex translation exited with ${events.code ?? "signal"}`);
    return fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
