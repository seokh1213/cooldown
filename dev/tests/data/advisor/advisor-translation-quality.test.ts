import assert from "node:assert/strict";
import test from "node:test";
import { loadData, offlineFileJudge } from "../../../scripts/advisor/kev-agent/lib";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { translations } from "../../../../src/shared/i18n/translations";

test("English As clauses keep the matchup intact at the shipping dialogue entry point", async () => {
  const data = loadData("en_US");
  const deps = { judge: offlineFileJudge(), search: async () => [] };
  for (const [question, mine, enemy] of [
    ["As Ahri, give me matchup tips against Zed", "Ahri", "Zed"],
    ["As Aatrox, how should I lane against Fiora?", "Aatrox", "Fiora"],
    ["As Nasus, how should I lane against Akali?", "Nasus", "Akali"],
    ["how do i lane vs zed as ahri", "Ahri", "Zed"],
  ]) {
    const result = await answerDialogue(question, { data, lang: "en_US", copy: translations.en_US.advisor,
      turns: [], championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" }, deps);
    assert.equal(result.dialogue.parts.length, 1, question);
    const plan = result.dialogue.parts[0].plan;
    assert.equal(plan.type, "matchup", question);
    if (plan.type === "matchup") {
      assert.equal(plan.mine.id, mine);
      assert.equal(plan.enemy.id, enemy);
    }
    assert.doesNotMatch(result.reply.text, /Attack speed \(level 1\)|[가-힣]/);
    assert.ok(result.reply.text.length > 20);
  }
});
