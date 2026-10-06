import { appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function shouldWatch(event, jobs = []) {
  return event !== "workflow_run" || jobs.some(job => job.name === "update-data" && job.conclusion === "success"
    && job.steps?.some(step => step.name === "Generate static data" && step.conclusion === "success"));
}

async function main() {
  const event = process.env.GITHUB_EVENT_NAME;
  let jobs = [];
  if (event === "workflow_run") {
    const url = `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.SOURCE_RUN_ID}/jobs?per_page=100`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }, signal: globalThis.AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Static-data job check failed: HTTP ${response.status}`);
    jobs = (await response.json()).jobs;
    if (!Array.isArray(jobs)) throw new Error("Static-data job list missing");
  }
  const run = shouldWatch(event, jobs);
  console.log(`Game knowledge check: ${run ? "run" : "skip (static data was not generated)"}`);
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
