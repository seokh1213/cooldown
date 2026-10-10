/** Prepare primary-assistant review batches; --precheck performs no model calls or writes. */
import * as fs from "node:fs";
import * as path from "node:path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { batchReady, finalAuditReady, fingerprint, prioritizeSections, reviewKey, reviewStatus } from "./lib/translation-review-queue";
import type { ReviewDecision, ReviewSection } from "./lib/translation-review-queue";

type Store = { pairs: Record<string, Record<string, { basis: string; text: string }>> };
type Source = { pairs: Record<string, Record<string, string>> };

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
};

function readStore(file: string): Store {
  if (!fs.existsSync(file)) return { pairs: {} };
  return JSON.parse(fs.readFileSync(file, "utf8")) as Store;
}

function generatorRunning(runDirectory: string): boolean {
  const pidFile = path.join(runDirectory, "worker.lock", "pid");
  if (!fs.existsSync(pidFile)) return false;
  const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function collectSections(runDirectory: string, patchVersion: string): { pending: ReviewSection[]; total: number; missing: number; approved: number; held: number } {
  const sourceDirectory = path.join(PUBLIC_DATA_ROOT, patchVersion, "llm", "matchups");
  const ledger = JSON.parse(fs.readFileSync(path.join(runDirectory, "manual-review.json"), "utf8")) as { entries: ReviewDecision[] };
  const decisions = new Map(ledger.entries.map((entry) => [reviewKey(entry), entry]));
  const result = { pending: [] as ReviewSection[], total: 0, missing: 0, approved: 0, held: 0 };
  for (const file of fs.readdirSync(sourceDirectory).filter((name) => /^[A-Za-z]+\.json$/.test(name)).sort()) {
    const me = file.slice(0, -5);
    const source = JSON.parse(fs.readFileSync(path.join(sourceDirectory, file), "utf8")) as Source;
    for (const lang of ["en_US", "zh_CN"]) {
      const candidates = readStore(path.join(runDirectory, "candidates", lang, file));
      const seed = readStore(path.join(runDirectory, "seed", lang, file));
      const trusted = readStore(path.join("dev/data/knowledge", "matchup-translations", lang, file));
      const sourceSections = Object.entries(source.pairs).flatMap(([enemy, slots]) => Object.entries(slots).map(([slot, ko]) => ({ enemy, slot, ko })));
      for (const { enemy, slot, ko } of sourceSections) {
        result.total += 1;
        let hit = candidates.pairs[enemy]?.[slot];
        if (hit?.basis !== ko) hit = trusted.pairs[enemy]?.[slot];
        if (!hit || hit.basis !== ko) {
          result.missing += 1;
          continue;
        }
        const previous = seed.pairs[enemy]?.[slot];
        const section = { lang, me, enemy, slot, ko, text: hit.text, newCandidate: previous?.basis !== ko || previous?.text !== hit.text };
        const status = reviewStatus(section, decisions.get(reviewKey(section)));
        if (status === "pending") result.pending.push(section);
        else result[status] += 1;
      }
    }
  }
  return result;
}

function main(): void {
  const runDirectory = path.resolve(argument("run-dir") ?? path.join("dev/research", "translation-runs", new Date().toISOString().slice(0, 10)));
  const threshold = Number(argument("threshold") ?? 64);
  const limit = Number(argument("limit") ?? 64);
  if (![threshold, limit].every((value) => Number.isInteger(value) && value > 0)) throw new Error("threshold and limit must be positive integers");
  const precheck = process.argv.includes("--precheck");
  if (precheck && fs.existsSync(path.join(runDirectory, "review.lock"))) {
    console.log(JSON.stringify({ ready: false, reason: "review_in_progress" }));
    process.exitCode = 1;
    return;
  }
  const queue = collectSections(runDirectory, argument("patch") ?? resolvePatchVersion());
  const running = generatorRunning(runDirectory);
  const finalAuditNeeded = finalAuditReady({ pending: queue.pending.length, generatorRunning: running, auditExists: fs.existsSync(path.join(runDirectory, "final-review-audit.json")) });
  const ready = batchReady(queue.pending.length, threshold, running) || finalAuditNeeded;
  const summary = { ready, total: queue.total, pending: queue.pending.length, approved: queue.approved, held: queue.held, missing: queue.missing, generatorRunning: running, finalAuditNeeded };
  console.log(JSON.stringify(summary));
  if (precheck) {
    process.exitCode = ready ? 0 : 1;
    return;
  }
  const output = argument("output");
  if (!output) throw new Error("Pass --output <file> to save a review batch");
  const sections = prioritizeSections(queue.pending).slice(0, limit).map((section) => ({ ...section, sourceSha256: fingerprint(section.ko), candidateSha256: fingerprint(section.text) }));
  fs.writeFileSync(path.resolve(output), `${JSON.stringify({ ...summary, generatedAt: new Date().toISOString(), sections }, null, 2)}\n`);
}

try {
  main();
} catch {
  console.error("Review queue could not be read; no candidates were approved.");
  process.exitCode = 2;
}
