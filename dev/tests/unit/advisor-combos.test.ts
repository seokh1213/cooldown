import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { loadData } from "../../scripts/advisor/kev-agent/lib";
import { loadComboNotes, compileComboNotes, abilityTextHash } from "../../scripts/advisor/lib/comboNotes";
import { comboHash, reviewCombos, type ComboBaseline } from "../../scripts/advisor/lib/comboReview";
import type { NumericChampion } from "../../scripts/patch-notes/sourceTypes";
import { answerDialogue } from "../../../src/features/advisor/conversation/dialogueFlow";
import { planAnswer } from "../../../src/features/advisor/application/plan";
import { dehydrateTurn, reviveTurn } from "../../../src/features/advisor/storage/history";
import { comboSlots, type ComboGuideFile } from "../../../src/domain/knowledge/comboGuide";
import { translations } from "../../../src/shared/i18n/translations";
import type { PlanContext } from "../../../src/features/advisor/contracts/planTypes";
import type { JudgeQuestion } from "../../../src/features/advisor/model/judge";
import { comboBaselineData } from "../fixtures/comboBaselineData";
import type { AdvisorData } from "../../../src/features/advisor/conversation/context";

const deps = { judge: async () => { throw new Error("명시적 콤보는 모델을 부르지 않습니다"); }, search: async () => [] };
const liveData = loadData("ko_KR");
const baseline = JSON.parse(readFileSync("dev/data/knowledge/combo-baseline.json", "utf8")) as ComboBaseline;
const authored = JSON.parse(readFileSync("dev/data/knowledge/combo-guides.json", "utf8")) as ComboGuideFile;
const data = comboBaselineData(liveData, authored, baseline);
const numericSources = Object.fromEntries(Object.entries(baseline.sources).flatMap(([id, source]) => source.card.numeric ? [[id, source.card.numeric]] : []));
const liveNumbers = JSON.parse(readFileSync(`dev/data/patch-notes/sources/${liveData.patch}.json`, "utf8")) as Record<string, NumericChampion>;
function context(source: AdvisorData = data): PlanContext {
  return { data: source, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [],
    judge: "none", consented: false, canUseModel: false, retrieval: false };
}
async function ask(ctx: PlanContext, question: string) {
  const { reply } = await answerDialogue(question, ctx, deps);
  ctx.turns = [...ctx.turns, ...[{ id: ctx.turns.length, role: "user" as const, content: question },
    { id: ctx.turns.length + 1, role: "assistant" as const, content: reply.text, answer: reply.answer, memory: reply.memory }]
    .flatMap(turn => { const restored = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn))), ctx.data!); return restored ? [restored] : []; })];
  return reply;
}

test("현재 모든 챔피언의 콤보·조건·출처와 스킬 본문 검수 기록이 있다", () => {
  const file = JSON.parse(readFileSync("dev/data/knowledge/combo-guides.json", "utf8")) as ComboGuideFile;
  const guides = new Map(file.champions.map(guide => [guide.champion, guide]));
  assert.equal(guides.size, liveData.cards.length);
  const compiled = loadComboNotes();
  const reviews = new Map(reviewCombos({ guides: file, cards: liveData.cards, baseline, numericSources: liveNumbers, patch: liveData.patch }).map(row => [row.id, row]));
  for (const card of liveData.cards) {
    const guide = guides.get(card.id);
    assert.ok(guide, card.id);
    assert.equal(guide.abilityTextHash, abilityTextHash(baseline.sources[card.id].card as typeof card), card.id);
    assert.ok(guide.patterns.length >= 2, card.id);
    for (const pattern of guide.patterns) {
      assert.ok(pattern.keys.length >= 2 && pattern.tip.length > 15 && pattern.title, pattern.id);
      assert.equal(new URL(pattern.sourceUrl).protocol, "https:");
      assert.ok(comboSlots(pattern.keys).every(slot => card.spells.some(spell => spell.slot === slot)), pattern.id);
      const review = reviews.get(pattern.id)!;
      const entry = compiled.get(card.id)!.find(entry => entry.id === pattern.id);
      if (review.status === "needs-review") assert.equal(entry, undefined, `${pattern.id}: 검수 대기는 배포하지 않는다`);
      else assert.match(entry!.text, /^- \*\*/);
    }
  }
  const kled = guides.get("Kled")!;
  assert.ok(kled.reviewedAt && kled.reviewedAt >= file.reviewedAt, "클레드만 최신 원문으로 재검수했다");
  for (const pattern of kled.patterns) {
    assert.match(pattern.tip, /스칼에 탑승한 상태/, "E 연계는 탑승 상태를 명시한다");
    assert.match(pattern.tip, /W가 준비/, "네 번의 빠른 평타는 W 준비 조건을 명시한다");
  }
  const chase = kled.patterns.find(pattern => pattern.keys.includes("E2"))!;
  assert.match(chase.tip, /적 챔피언이나 대형 정글 몬스터에게 적중/);
  assert.match(chase.tip, /3초 안에 같은 대상에게 E2/);
  assert.ok(kled.sources.some(source => source.kind === "usage-guide" && source.url.includes("na.leagueoflegends.com")));
});

test("전 챔피언 콤보 질문이 실제 대화 진입점에서 상황별 순서와 요령으로 답한다", async () => {
  for (const card of liveData.cards) {
    const reply = await ask(context(liveData), `${card.name} 콤보 알려줘`);
    assert.equal(reply.answer?.kind, "champion", card.id);
    if (reply.answer?.kind === "champion") assert.equal(reply.answer.card.id, card.id);
    if (liveData.playbooks.get(card.id)?.comboReview?.pendingIds.length) {
      assert.match(reply.text, /현재 패치 검수 중/, card.id);
      continue;
    }
    assert.match(reply.text, /- \*\*.+:\*\* `.+ → .+` — /, card.id);
    assert.doesNotMatch(reply.text, /의 스킬 구성입니다|\*\*상대할 때\*\*/, card.id);
    assert.doesNotMatch(reply.text, /참고 자료|https?:\/\//, card.id);
    if (reply.answer?.kind === "champion") assert.ok(reply.answer.notes?.sources?.length, card.id);
  }
});

test("스킬 소개로 오판한 판정기와 여러 슬롯의 순서 질문도 콤보를 답한다", async () => {
  const ctx = { ...context(), judge: "offline" as const };
  const wrongJudge = { ...deps, judge: async (_head: string, _state: string, qs: JudgeQuestion[]) => qs.map(q => q.options.map(o => o.name === "skills" ? 1 : 0)) };
  for (const question of ["자헨 콤보가 있을까?", "자헨 Q W E 순서 알려줘"]) {
    const plan = await planAnswer(question, ctx, wrongJudge);
    assert.equal(plan.type, "card");
    if (plan.type === "card" && plan.answer.kind === "champion") assert.equal(plan.answer.notes?.topic, "combo");
    else assert.fail(question);
  }
  assert.match((await ask(context(), "자헨 스킬 설명해줘")).text, /스킬 구성/);
});

test("콤보와 라인전 팁을 한 문장에 물어도 두 요청을 함께 답한다", async () => {
  const reply = await ask(context(), "빅토르 콤보는? 라인전 팁은?");
  assert.match(reply.text, /짧은 견제/);
  assert.match(reply.text, /\*\*라인전\*\*|라인전 팁/);
  assert.match(reply.text, /미니언과 상대를 함께/);
});

test("궁·점멸 상태를 새로고침 가능한 기억으로 유지하고 준비 상태로 바꾸면 복원한다", async () => {
  const ctx = context();
  await ask(ctx, "오공 콤보 알려줘");
  const unavailable = await ask(ctx, "그럼 궁 없이? 점멸도 없어");
  assert.match(unavailable.text, /짧은 딜교|빠른 딜교/);
  assert.doesNotMatch(unavailable.text, /`[^`]*(?:R|점멸)[^`]*`/);
  assert.deepEqual(unavailable.memory.combo?.unavailable.sort(), ["R", "점멸"].sort());
  const ready = await ask(ctx, "궁 돌아왔고 점멸도 있어");
  assert.match(ready.text, /한타 진입/);
  assert.deepEqual(ready.memory.combo?.unavailable, []);
  const fact = await ask(ctx, "궁 쿨타임 몇 초야?");
  assert.equal(fact.answer?.kind, "spell");
  assert.equal(fact.memory.combo, undefined);
  const switched = await ask(ctx, "아리 콤보 알려줘");
  assert.equal(switched.memory.combo?.champion, "Ahri");
  assert.doesNotMatch(switched.text, /분신/);
});

test("쓸 수 있는 연계가 없으면 불가능한 버튼 순서를 추천하지 않는다", async () => {
  const reply = await ask(context(), "자헨 Q W E R이 없는데 콤보 있어?");
  assert.match(reply.text, /지금 쓸 수 있는 스킬로 구성된 콤보는 확인한 노트에 없어요/);
  assert.doesNotMatch(reply.text, /`/);
});

test("콤보 유무와 스킬 상태를 구분하고 다른 스킬의 정정도 함께 유지한다", async () => {
  const ctx = context();
  const unavailable = await ask(ctx, "오공 R 없는데 콤보 있어?");
  assert.deepEqual(unavailable.memory.combo?.unavailable, ["R"]);
  assert.doesNotMatch(unavailable.text, /`[^`]*R[^`]*`/);
  const corrected = await ask(ctx, "E는 없고 R은 돌아왔어. 콤보 있나?");
  assert.deepEqual(corrected.memory.combo?.unavailable, ["E"]);
  assert.doesNotMatch(corrected.text, /`[^`]*E[^`]*`/);
  assert.match(corrected.text, /짧은 딜교/);
});

test("개별 재검수 패치는 해당 챔피언의 콤보와 라인전에만 적용한다", () => {
  const guides = JSON.parse(readFileSync("dev/data/knowledge/combo-guides.json", "utf8")) as ComboGuideFile;
  const [reviewed, previous] = guides.champions;
  guides.patch = "26.18";
  reviewed.verifiedPatch = "26.20";
  delete previous.verifiedPatch;
  reviewed.laning = { text: "개별 재검수한 라인전 조건", sourceUrl: reviewed.patterns[0].sourceUrl };
  const updatedBaseline = structuredClone(baseline);
  const id = `${reviewed.champion.toLowerCase()}-web-laning`;
  updatedBaseline.noteHashes[id] = comboHash({ id, ...reviewed.laning });
  const notes = compileComboNotes(guides, data.cards, { baseline: updatedBaseline, numericSources });
  assert.ok(notes.get(reviewed.champion)!.every(entry => entry.verifiedPatch === "26.20"));
  assert.ok(notes.get(previous.champion)!.every(entry => entry.verifiedPatch === "26.18"));
  assert.ok(notes.get(reviewed.champion)!.some(entry => entry.category === "laning"));
});

test("출처 변경은 해당 콤보만 보류하고 다른 챔피언의 생성을 계속한다", () => {
  const guides = JSON.parse(readFileSync("dev/data/knowledge/combo-guides.json", "utf8")) as ComboGuideFile;
  for (const [champion, slot] of [["Zaahen", "Q"], ["Kled", "E"]]) {
    const cards = structuredClone(data.cards);
    cards.find(card => card.id === champion)!.spells.find(spell => spell.slot === slot)!.text += " 스킬이 변경됨";
    const notes = compileComboNotes(guides, cards, { baseline, numericSources });
    assert.equal(notes.get(champion)?.length, 0);
    assert.ok(notes.get("Ambessa")!.length >= 2);
  }
  const changed = structuredClone(data.cards);
  for (const champion of ["Zaahen", "Kled"]) changed.find(card => card.id === champion)!.spells[0].text += " 새 본문";
  const notes = compileComboNotes(guides, changed, { baseline, numericSources });
  assert.equal(notes.get("Zaahen")?.length, 0);
  assert.equal(notes.get("Kled")?.length, 0);
  assert.ok(notes.get("Ambessa")!.length >= 2);
});
