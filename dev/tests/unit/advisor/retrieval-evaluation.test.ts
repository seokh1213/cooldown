import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { evaluationSearch } from "../../../scripts/advisor/kev-agent/retrieval_eval";
import { readVectors } from "../../../scripts/advisor/tuning/node_vectors";

test("full retrieval is opt-in and never makes network calls by default", async () => {
  await assert.rejects(evaluationSearch("/missing", {})("question", "en_US"), /disabled/);
});

test("document language offsets and half precision values match app storage", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "retrieval-eval-"));
  try {
    fs.writeFileSync(path.join(directory, "doc-vectors.json"), JSON.stringify({
      dim: 2, languages: { en_US: { offset: 2, ids: ["doc"] } },
    }));
    fs.writeFileSync(path.join(directory, "doc-vectors.bin"), Buffer.from(new Uint16Array([0, 0, 0x3c00, 0x3800]).buffer));
    const vectors = readVectors(directory);
    assert.deepEqual(Array.from(vectors.languages.en_US.matrix), [1, .5]);
    assert.equal(vectors.prompt.en_US, 'This text: "{}" means in one word:');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
