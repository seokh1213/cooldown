import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { noteVersion, type VersionContext } from "../../../../src/domain/knowledge/notes/noteVersion";

type JsonObject = Record<string, unknown>;
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function isNote(value: JsonObject): boolean {
  return typeof value.text === "string" && value.text.length > 0
    || typeof value.text === "object" && value.text !== null && "ko" in value.text
    || Array.isArray(value.notes) && value.notes.length > 0 && value.notes.every(note => typeof note === "string")
    || Array.isArray(value.effects) && Array.isArray(value.conditions)
    || typeof value.englishName === "string" && value.id !== undefined;
}

export function countNotes(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((total, item) => total + countNotes(item), 0);
  if (!value || typeof value !== "object") return 0;
  const node = value as JsonObject;
  const translations = node.translations && typeof node.translations === "object" ? Object.values(node.translations).filter(value => typeof value === "string").length : 0;
  return translations + Number(isNote(node)) + Object.entries(node).reduce((total, [key, child]) => total + (key === "version" ? 0 : countNotes(child)), 0);
}

function contextFor(node: JsonObject, context: VersionContext): VersionContext {
  const job = node.job as { patch?: string } | undefined;
  return {
    ...context,
    sourcePatch: typeof node.patch === "string" ? node.patch : job?.patch ?? context.sourcePatch,
    verifiedThroughPatch: job?.patch ?? context.verifiedThroughPatch,
    reviewedAt: typeof node.checked === "string" ? node.checked : context.reviewedAt,
    fetchedAt: typeof node.fetchedAt === "string" ? node.fetchedAt : context.fetchedAt,
    scope: typeof node.scope === "string" ? node.scope : context.scope,
  };
}

export function enrichNotes(value: unknown, context: VersionContext): unknown {
  if (Array.isArray(value)) return value.map(item => enrichNotes(item, context));
  if (!value || typeof value !== "object") return value;
  const node = value as JsonObject;
  const next = contextFor(node, context);
  // 승인 초안의 내부 구조는 그대로 두고 스킬 레코드에 버전을 연결한다.
  if (node.job && node.draft) return { ...node, version: noteVersion(node, next) };
  const output = Object.fromEntries(Object.entries(node).map(([key, child]) => [key, key === "version" ? child : enrichNotes(child, next)]));
  return isNote(node) ? { ...output, version: noteVersion(node, next) } : output;
}

function jsonFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? jsonFiles(file) : entry.name.endsWith(".json") ? [file] : [];
  }).sort();
}

function fileRecord(file: string, root: string, baselinePatch: string) {
  const source = fs.readFileSync(file, "utf8");
  const data = JSON.parse(source) as JsonObject;
  const noteCount = countNotes(data);
  if (!noteCount) return undefined;
  return {
    path: path.relative(root, file).split(path.sep).join("/"), sourceHash: hash(source), noteCount,
    version: noteVersion({}, contextFor(data, { baselinePatch })),
  };
}

export function backfill(root = process.cwd()) {
  const marker = JSON.parse(fs.readFileSync(path.join(root, "public/data/version.json"), "utf8")) as { patchVersion: string };
  const baselinePatch = marker.patchVersion;
  const runtime = path.join(root, "public/data", baselinePatch, "llm");
  const files = ["rule-notes.json", "advisor-knowledge.json", "champion-mechanics.json", "item-wiki-meta.json", "champion-wiki-tips.json"];
  for (const name of files) {
    const file = path.join(runtime, name);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as JsonObject;
    if (name === "advisor-knowledge.json" && fs.existsSync(path.join(runtime, "rule-notes.json"))) {
      const rules = JSON.parse(fs.readFileSync(path.join(runtime, "rule-notes.json"), "utf8")) as { rules: JsonObject[] };
      const versions = new Map(rules.rules.map(rule => [rule.page, rule.version]));
      data.rules = (data.rules as JsonObject[]).map(rule => ({ ...rule, version: versions.get(rule.page) ?? rule.version }));
    }
    const output = enrichNotes(data, { baselinePatch });
    const minified = name === "advisor-knowledge.json" || name === "champion-mechanics.json";
    fs.writeFileSync(file, minified ? JSON.stringify(output) : `${JSON.stringify(output, null, 2)}\n`);
  }
  const meta = path.join(root, "dev/data/knowledge/game-meta.json");
  fs.writeFileSync(meta, `${JSON.stringify(enrichNotes(JSON.parse(fs.readFileSync(meta, "utf8")), { baselinePatch }), null, 2)}\n`);
  const current = path.join(root, "dev/research/champion-mechanics/current.json");
  const reviewed = fs.existsSync(current) ? JSON.parse(fs.readFileSync(current, "utf8")) as { directory: string } : undefined;
  const authorFiles = jsonFiles(path.join(root, "dev/data/knowledge")).filter(file => !file.endsWith("note-versions.json") && !file.endsWith("combo-baseline.json"));
  if (reviewed) authorFiles.push(...jsonFiles(path.join(root, "dev/research/champion-mechanics", reviewed.directory, "records")));
  const records = authorFiles.map(file => fileRecord(file, root, baselinePatch)).filter(record => record !== undefined);
  const ledger = {
    schemaVersion: 1, baselinePatch, inheritance: "File defaults apply to every contained note. Explicit verifiedPatch, evidence.patch and lifecycle records override defaults. Backfill is not a new factual review.",
    files: records, counts: { files: records.length, notes: records.reduce((total, record) => total + record.noteCount, 0) },
  };
  fs.writeFileSync(path.join(root, "dev/data/knowledge/note-versions.json"), `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger.counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) console.log(JSON.stringify(backfill()));
