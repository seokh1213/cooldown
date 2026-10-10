import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const OUTAGE_LIMIT_MS = 6 * 60 * 60 * 1000;

export class SourceHttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}: ${url}`);
    this.status = status;
  }
}

export function isTransientError(error) {
  if (error instanceof SourceHttpError) return error.status === 429 || error.status >= 500;
  if (!(error instanceof Error)) return false;
  return ["TimeoutError", "AbortError"].includes(error.name)
    || (error.name === "TypeError" && /^(fetch failed|terminated|NetworkError when attempting to fetch resource\.)$/.test(error.message));
}

export function sourceFailure(id, error) {
  return { id, error: String(error), transient: isTransientError(error),
    ...(error instanceof SourceHttpError ? { httpStatus: error.status } : {}) };
}

export function readHealth(file) {
  let state;
  try { state = JSON.parse(readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
  if (state?.schemaVersion !== 1 || !["available", "deferred", "unavailable"].includes(state.status)
    || !Number.isFinite(Date.parse(state.checkedAt))
    || (state.status !== "available" && !Number.isFinite(Date.parse(state.firstUnavailableAt)))) {
    throw new Error("Invalid saved source-health state");
  }
  return state;
}

export function nextHealth(previous, failures, now = new Date()) {
  const checkedAt = now.toISOString();
  if (!failures.length) return { schemaVersion: 1, status: "available", checkedAt, lastSuccessAt: checkedAt, failures };
  const firstUnavailableAt = previous?.firstUnavailableAt ?? checkedAt;
  const outageMs = now.getTime() - Date.parse(firstUnavailableAt);
  if (!Number.isFinite(outageMs) || outageMs < 0) throw new Error("Invalid source outage start time");
  const deferred = failures.every(failure => failure.transient === true) && outageMs < OUTAGE_LIMIT_MS;
  return { schemaVersion: 1, status: deferred ? "deferred" : "unavailable", checkedAt,
    lastSuccessAt: previous?.lastSuccessAt ?? null, firstUnavailableAt, outageMs, failures };
}

export function saveHealth(file, failures, context = {}) {
  const state = { ...nextHealth(readHealth(file), failures), ...context };
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
  const summary = `## Source availability: ${state.status}\n\n${JSON.stringify(context)}\n\n`
    + `First unavailable: ${state.firstUnavailableAt ?? "none"}; last success: ${state.lastSuccessAt ?? "unknown"}.\n\n`
    + "Transient HTTP 429/5xx and transport failures are deferred for less than 6 hours. "
    + "A deferred refresh is incomplete; the last validated data and approved baseline are retained. "
    + "At 6 hours, or for permanent HTTP/data errors, the check fails.\n\n"
    + failures.map(failure => `- ${failure.id}: ${failure.error}`).join("\n") + "\n";
  writeFileSync(`${file}.md`, summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (state.status === "deferred") console.warn("::warning::Source refresh deferred, incomplete; previous verified data retained. Retry hourly; fail at 6 hours.");
  return state;
}
