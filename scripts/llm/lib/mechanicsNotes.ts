import fs from "node:fs";
import path from "node:path";
import type { MechanicsIndex } from "../../../src/lib/knowledge/mechanics";
import { CROWD_CONTROL } from "../../../src/lib/knowledge/crowdControl";
import { resolvePatchVersion } from "./data";

/** 원문 복사 대신 검증한 판정을 적는다. 출처와 검토일을 번들에도 보존한다. */
export function loadMechanicsNotes(patch = resolvePatchVersion()): MechanicsIndex {
  const file = path.resolve("knowledge", "mechanics-notes.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { notes: MechanicsIndex };
  const video = JSON.parse(fs.readFileSync(path.resolve("knowledge", "video-tips.json"), "utf8")) as {
    patch: string; verifiedPatches?: string[]; notes: MechanicsIndex;
  };
  if (video.patch === patch || video.verifiedPatches?.includes(patch)) data.notes.push(...video.notes);
  const seen = new Set<string>();
  for (const note of data.notes) {
    if (seen.has(note.id) || !note.sources?.length || !note.reviewedAt || !note.questionGroups?.length
      || note.questionGroups.some(group => !group.length) || !note.localized?.en_US || !note.localized.zh_CN
      || note.topic && (!note.topic.id || !note.topic.terms.length || note.topic.terms.some(term => !term))
      || note.controls?.some(type => !(type in CROWD_CONTROL))
      || note.subjects?.some(subject => !subject.champion || !/^[PQWER]$/.test(subject.slot))) {
      throw new Error(`Invalid mechanics note: ${note.id}`);
    }
    seen.add(note.id);
  }
  return data.notes.map(note => ({ ...note, tags: note.tags ?? ["tip", "interaction"] }));
}
