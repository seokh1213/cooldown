import test from "node:test";
import assert from "node:assert/strict";
import { loadData, type Lang } from "../../scripts/llm/kev-agent/lib";
import { translations } from "../../src/i18n/translations";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { controlQuery } from "../../src/lib/advisor/crowdControlQuestion";
import { detectSpellFocus } from "../../src/lib/advisor/spellFocus";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

test("CC 시간 질문에는 종류 목록 대신 현재 패치의 지속시간을 답한다", async () => {
  for (const [lang, question] of [
    ["ko_KR", "릴리아 R 수면 시간은?"],
    ["ko_KR", "릴리아 R 수면 지속 시간은?"],
    ["en_US", "Lillia R sleep duration?"],
    ["zh_CN", "莉莉娅 R 睡眠时间？"],
  ] as Array<[Lang, string]>) {
    const ctx: PlanContext = { data: loadData(lang), lang, copy: translations[lang].advisor,
      turns: [], championIds: [], judge: "none", consented: false, canUseModel: false, retrieval: false };
    const { reply } = await answerDialogue(question, ctx, {
      judge: async () => { throw new Error("Unexpected model call"); }, search: async () => [],
    });
    for (const duration of ["2.5", "2.75", "3"]) assert.ok(reply.text.includes(duration), `${question}: ${reply.text}`);
    assert.notEqual(controlQuery(question), "types");
  }
  assert.equal(controlQuery("릴리아 R은 무슨 CC야?"), "types");
  assert.equal(controlQuery("릴리아 R 수면에 강인함 적용돼?"), "tenacity");
  assert.equal(controlQuery("릴리아 R 졸음 먼저 수면 나중이야?"), "sequence");
  assert.equal(detectSpellFocus("릴리아 R 피해 얼마나 줘?")?.focus, "damage");
  assert.equal(detectSpellFocus("Lillia R AP ratio?")?.focus, "ratio");
});
