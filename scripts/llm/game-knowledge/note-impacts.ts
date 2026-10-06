import fs from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "./sources";

interface ReviewedNote { id: string; sources?: string[]; sourceHash?: string; verifiedThroughPatch?: string; version?: { verifiedThroughPatch?: string | null } }

async function optionalJson<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; return fallback; }
}

/** 원문 변경을 승인 노트에 연결한다. 수집한 새 내용을 자동으로 정답에 반영하지 않는다. */
export async function writeNoteImpacts(output: string, snapshots: Snapshot[], baseline: Snapshot[], root: string) {
  const mechanics = await optionalJson<{ notes: ReviewedNote[] }>(path.join(root, "knowledge/mechanics-notes.json"), { notes: [] });
  const lifecycle = await optionalJson<{ entities: ReviewedNote[] }>(path.join(root, "knowledge/game-lifecycle.json"), { entities: [] });
  const previous = new Map(baseline.map(source => [source.id, source.hash]));
  const affected = [...mechanics.notes.map(note => ({ ...note, kind: "mechanic" })), ...lifecycle.entities.map(note => ({ ...note, kind: "lifecycle" }))]
    .flatMap(note => snapshots.filter(source => note.sources?.includes(source.url)).flatMap(source => {
      const approvedMismatch = note.sources?.length === 1 && Boolean(note.sourceHash && note.sourceHash !== source.hash);
      const sourceChanged = previous.has(source.id) && previous.get(source.id) !== source.hash;
      return approvedMismatch || sourceChanged ? [{ id: note.id, kind: note.kind, sourceId: source.id,
        reason: approvedMismatch ? "approved-source-mismatch" : "source-changed", source,
        verifiedThroughPatch: note.version?.verifiedThroughPatch ?? note.verifiedThroughPatch ?? null }] : [];
    }));
  const report = { schemaVersion: 1, reviewStatus: "detection-only", affectedNotes: affected };
  await fs.writeFile(path.join(output, "note-impacts.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
