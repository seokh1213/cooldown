import { spawn } from "node:child_process";

export interface Command {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export async function runCommand(step: Command, cwd: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const grouped = process.platform !== "win32";
  const child = spawn(step.command, step.args, {
    cwd, env: { ...process.env, ...step.env }, stdio: "inherit", detached: grouped,
  });
  const stop = () => {
    if (!child.pid) return;
    try { if (grouped) process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  };
  signal?.addEventListener("abort", stop, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, killed) => code === 0 ? resolve()
        : reject(new Error(`${step.command} ${step.args.join(" ")}: ${killed ?? `exit ${code}`}`)));
    });
    signal?.throwIfAborted();
  } finally { signal?.removeEventListener("abort", stop); }
}
