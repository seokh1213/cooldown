import assert from "node:assert/strict";
import { test } from "node:test";
import { kevJudge } from "../../../scripts/advisor/kev-agent/lib";

test("systemone evaluation uses the selected Ollama model", async () => {
  const previousModel = process.env.JUDGE_MODEL;
  const previousFetch = globalThis.fetch;
  let requestedModel: string | undefined;
  process.env.JUDGE_MODEL = "tev1:0.8b";
  globalThis.fetch = async (_input, init) => {
    requestedModel = JSON.parse(String(init?.body)).model as string;
    return new Response(JSON.stringify({ answers: { q0: { probabilities: { matchup: 0.8, guide: 0.2 } } } }));
  };

  try {
    const judge = kevJudge("http://127.0.0.1:11435");
    const result = await judge("unused", "Question: Aatrox vs Fiora", [{
      instructions: "What does the question ask?",
      options: [{ name: "matchup", description: "Two champions" }, { name: "guide", description: "One champion" }],
    }]);
    assert.equal(requestedModel, "tev1:0.8b");
    assert.deepEqual(result, [[0.8, 0.2]]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousModel === undefined) delete process.env.JUDGE_MODEL;
    else process.env.JUDGE_MODEL = previousModel;
  }
});
