import fs from "node:fs";
import path from "node:path";
import { recordFrame } from "../../../src/lib/advisor/contextFrames";
import { contextFeatures } from "../../../src/lib/advisor/contextRanker";
import type { ContextFrame } from "../../../src/lib/advisor/contextFrameTypes";
import type { DialogueMemory } from "../../../src/lib/advisor/dialogueState";
import type { ResolvedQuestion } from "../../../src/lib/advisor/resolvedQuestion";
import { digest, readRows, ROOT } from "../quality/bank";

const directory = "research/llm-evals/workflow/datasets/context-frames";
const cache = path.join(ROOT, "research/.cache/context-frames/20261007/dedup-training");
fs.mkdirSync(cache, { recursive: true });
for (const split of ["train", "dev"]) {
  const sessions = readRows(`${directory}/selector-${split}.jsonl`) as unknown as Array<{
    id: string; kind: string; question: string; frames: ContextFrame[];
  }>;
  const encoded: unknown[] = [], retained: unknown[] = [];
  for (const session of sessions) {
    let frames: ContextFrame[] = [];
    for (const [index, frame] of session.frames.entries()) {
      const memory = { ...frame.state, patch: frame.patch } as DialogueMemory;
      recordFrame(memory, frames, index * 2 + 1, 32);
      frames = memory.contextFrames!;
    }
    if (frames.length !== new Set(frames.map(frame => frame.key)).size) throw new Error("Duplicate production frame keys");
    const latest = frames.at(-1)!;
    const expected = latest.kind === session.kind ? [latest.key] : frames.filter(frame => frame.kind === session.kind).map(frame => frame.key);
    const input: ResolvedQuestion = { text: session.question, champions: [], mentions: [], spellFocus: undefined };
    frames.forEach((frame, index) => encoded.push({ id: session.id, key: frame.key, latest: latest.key, expected,
      features: contextFeatures(input, frame, index, frames), y: Number(expected.includes(frame.key)) }));
    retained.push({ ...session, frames, expected });
  }
  fs.writeFileSync(path.join(cache, `${split}.jsonl`), encoded.map(row => JSON.stringify(row)).join("\n") + "\n");
  fs.writeFileSync(path.join(cache, `${split}-sessions.jsonl`), retained.map(row => JSON.stringify(row)).join("\n") + "\n");
  console.log(JSON.stringify({ split, sessions: retained.length, pairs: encoded.length, hash: digest(retained),
    note: "Existing independent query templates, candidate states passed through production recordFrame; still synthetic sessions." }));
}
