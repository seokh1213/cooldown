import test from "node:test";
import assert from "node:assert/strict";
import { loadData, type Lang } from "../../../scripts/advisor/kev-agent/lib";
import { translations } from "../../../../src/shared/i18n/translations";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { controlQuery } from "../../../../src/features/advisor/understanding/spells/crowdControlQuestion";
import { detectSpellFocus } from "../../../../src/features/advisor/understanding/spells/spellFocus";
import type { PlanContext } from "../../../../src/features/advisor/contracts/planTypes";
import { runDialogue, evaluationDeps, localFetch } from "../../../scripts/advisor/quality/dialogue";
import { buildBank } from "../../../scripts/advisor/quality/bank";
import type { QualityRow } from "../../../scripts/advisor/quality/types";

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
  assert.equal(detectSpellFocus("그럼 W는 몇 초야?"), undefined);
});

test("쿨타임 후속 질문의 몇 초는 효과 지속시간으로 바꾸지 않는다", async () => {
  const fixture = buildBank().find(story => story.id === "b482a9b6c686265cdbb6");
  assert.ok(fixture);
  const rows: QualityRow[] = [], restore = localFetch();
  try {
    for (const mode of ["none", "offline"] as const) {
      await runDialogue({ stories: [fixture], mode, deps: evaluationDeps(), record: row => rows.push(row) });
    }
  } finally { restore(); }
  assert.equal(rows.length, 10);
  assert.ok(rows.every(row => row.pass === true));
  for (const row of rows.filter(row => row.id.endsWith(":2"))) assert.match(row.text, /22\/19\.5\/17\/14\.5\/12/);
});
