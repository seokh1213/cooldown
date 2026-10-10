import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync, execFileSync } from "node:child_process";
import { families } from "./sources";
import { ROOT, EVALS, WORKFLOW, buildBank, digest, readRows } from "./bank";
import { filesUnder, fileHash, archivedInputs, retiredFiles } from "./archive";
import type { QualityStory } from "./types";

export function inventoryChanges(current: Array<{ file: string; localOnly?: boolean }>, locked: Array<{ file: string; localOnly?: boolean }>) {
  const known = new Set(locked.map(row => row.file)), present = new Set(current.map(row => row.file));
  return { added: current.filter(row => !row.localOnly && !known.has(row.file)),
    removed: locked.filter(row => !row.localOnly && !present.has(row.file)) };
}

export function refreshedRecords<T extends { file: string; localOnly?: boolean }>(records: T[], previous: T[]): T[] {
  const current = new Map(records.map(record => [record.file, record]));
  const known = new Set(previous.map(record => record.file));
  return previous.flatMap(record => current.has(record.file) ? [current.get(record.file)!] : record.localOnly ? [record] : [])
    .concat(records.filter(record => !known.has(record.file)));
}

export function audit(refresh = false) {
  const bank = buildBank();
  const roots = ["dev/research", "dev/scripts/advisor", "dev/tests/unit", "dev/tests/data", "dev/tests/fixtures", "dev/tests/e2e", `${WORKFLOW}/datasets/qa`, `${WORKFLOW}/datasets/archive`];
  const files = roots.flatMap(filesUnder);
  const ignore = spawnSync("git", ["check-ignore", "-z", "--stdin"], { cwd: ROOT,
    input: files.join("\0") + "\0", encoding: "utf8", maxBuffer: 20_000_000 });
  if (ignore.error || ![0, 1].includes(ignore.status!)) throw ignore.error ?? new Error("Cannot inspect local-only research artifacts");
  const localOnly = new Set(ignore.stdout.split("\0").filter(Boolean));
  const tracked = new Set(execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 20_000_000 }).split("\0"));
  const inputFiles = new Set(bank.flatMap(story => story.sources.map(source => source.file)));
  for (const file of files) {
    if (file.startsWith("dev/research/") && !tracked.has(file) && !inputFiles.has(file) && !file.startsWith(`${WORKFLOW}/`)) localOnly.add(file);
  }
  const unknown = [...new Set(files.filter(file => file.startsWith(`${EVALS}/`)).map(file => file.slice(EVALS.length + 1).split("/")[0]))].filter(family => !families[family]);
  if (unknown.length) throw new Error(`Unregistered evaluation families: ${unknown.join(", ")}`);
  let records = files.map(file => {
    const role = inputFiles.has(file) ? "registered-input" : /(?:^dev\/tests\/|test_.*\.py$)/.test(file) ? "executable-test"
      : /\.(?:ts|py|sh)$/.test(file) ? "runner-or-support" : /\.(?:md|html|txt)$/.test(file) ? "protocol-or-review"
      : /train|seed|examples|corpus|\.bin$|head\.json|char\.json|context\.json/.test(file) ? "training-or-model-artifact" : "historical-result-or-audit";
    const family = file.startsWith(`${EVALS}/`) ? file.slice(EVALS.length + 1).split("/")[0] : file.split("/")[2];
    return { file, sha256: fileHash(file), localOnly: localOnly.has(file), role, workflow: families[family] ?? "node/Python tests or runner dependency" };
  });
  const target = path.join(ROOT, WORKFLOW, "inventory.json");
  if (refresh && fs.existsSync(target)) {
    const previous = JSON.parse(fs.readFileSync(target, "utf8")) as { files: typeof records };
    records = refreshedRecords(records, previous.files);
  }
  const trackedManual = archivedInputs(files.filter(file => !localOnly.has(file)), bank);
  const manual = refresh ? archivedInputs(files, bank)
    : readRows(`${WORKFLOW}/datasets/review/archive.jsonl`) as unknown as QualityStory[];
  const result = { schema: 2, roots,
    files: records, retired: retiredFiles(), bankHash: digest(bank), manualHash: digest(manual), trackedManualHash: digest(trackedManual),
    automaticStories: bank.filter(story => !story.manual).length, registeredTurns: bank.reduce((sum, story) => sum + story.turns.length, 0),
    manualArchiveStories: manual.length, suites: [...new Set(bank.flatMap(story => story.suites))] };
  if (refresh) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(result, null, 2) + "\n");
    fs.mkdirSync(path.join(ROOT, WORKFLOW, "datasets/regression"), { recursive: true });
    fs.mkdirSync(path.join(ROOT, WORKFLOW, "datasets/review"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, WORKFLOW, "datasets/regression/cases.jsonl"), bank.map(story => JSON.stringify(story)).join("\n") + "\n");
    fs.writeFileSync(path.join(ROOT, WORKFLOW, "datasets/review/archive.jsonl"), manual.map(story => JSON.stringify(story)).join("\n") + "\n");
  } else {
    if (!fs.existsSync(target)) throw new Error("Run llm:test:audit to register the inventory");
    const locked = JSON.parse(fs.readFileSync(target, "utf8")) as typeof result;
    const { added: extra, removed } = inventoryChanges(records, locked.files);
    if (extra.length || removed.length || locked.schema !== result.schema || locked.bankHash !== result.bankHash
      || locked.manualHash !== result.manualHash || locked.trackedManualHash !== result.trackedManualHash)
      throw new Error(`Inventory changed (${extra.length} added, ${removed.length} removed files or cases); run llm:test:audit and review the diff`);
  }
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = audit(process.argv.includes("--refresh"));
  console.log(JSON.stringify({ files: result.files.length, retired: result.retired.length, registeredTurns: result.registeredTurns,
    manualArchiveStories: result.manualArchiveStories, suites: result.suites.length }));
}
