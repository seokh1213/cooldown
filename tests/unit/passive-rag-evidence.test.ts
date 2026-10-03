import assert from "node:assert/strict";
import { test } from "node:test";
import { loadData } from "../../scripts/llm/kev-agent/lib";
import { nextRagState, prompt, rankDocs, spellDocs } from "../../scripts/llm/passive-rag/evidence";

const data = loadData("ko_KR");
test("챔피언을 바꾸면 과거 질문이 새 검색에 섞이지 않는다", () => {
  const first = nextRagState(data, { questions: [] }, "아크샨 평타 한대 치면?");
  const followup = nextRagState(data, first, "두번째까지 다 치면?");
  assert.equal(followup.champion, "Akshan");
  assert.equal(followup.questions.length, 2);
  const changed = nextRagState(data, followup, "파이크 체력템 사면?");
  assert.equal(changed.champion, "Pyke");
  assert.deepEqual(changed.questions, ["파이크 체력템 사면?"]);
});
test("근거 선택은 질문별 정답 코드 없이 다섯 스킬 전체에서 점수로 한다", () => {
  const docs = spellDocs(data.cardById.get("Akshan")!);
  assert.equal(docs.length, 5);
  const found = rankDocs(docs, docs.map((_, i) => [i === 2 ? 1 : 0, i === 2 ? 0 : 1]), [1, 0]);
  assert.equal(found[0].doc.slot, docs[2].slot);
});
test("프롬프트에 채점 정답이나 현행 답변을 넣지 않는다", () => {
  const text = prompt({ champion: "Pyke", questions: ["체력템 사면?"] }, "파이크", spellDocs(data.cardById.get("Pyke")!).slice(0, 2));
  assert.match(text, /현재 질문: 체력템 사면/);
  assert.match(text, /근거:/);
  assert.doesNotMatch(text, /criteria|기대 조건|현행 답변|expectedOwner/);
});
