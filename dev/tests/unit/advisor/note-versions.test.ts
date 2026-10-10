import assert from "node:assert/strict";
import { test } from "node:test";
import { noteVersion, removalNotice } from "../../../../src/domain/knowledge/notes/noteVersion";
import { enrichNotes } from "../../../scripts/advisor/note-versions/backfill";
import { gameMetaAnswer, gameMetaById, gameMetaDocs } from "../../../../src/features/advisor/retrieval/gameMeta";

test("26.19 백필은 명시된 과거 검수 패치와 미확인 변경 시점을 보존한다", () => {
  const version = noteVersion({ verifiedPatch: "26.17" }, { baselinePatch: "26.19" });
  assert.equal(version.baselinePatch, "26.19");
  assert.equal(version.sourcePatch, "26.17");
  assert.equal(version.verifiedThroughPatch, "26.17");
  assert.equal(version.lastChangedPatch, null);
  assert.equal(noteVersion({}, { baselinePatch: "26.19" }).verifiedThroughPatch, null);
});

test("수록 패치와 수집 원천 패치는 구분하고 기존 원천 패치는 유지한다", () => {
  const rule = { page: "Minion", notes: ["A rule."], version: noteVersion({}, { baselinePatch: "26.19", sourcePatch: "26.18" }) };
  const enriched = enrichNotes({ patchVersion: "26.19", rules: [rule] }, { baselinePatch: "26.19" }) as { rules: Array<typeof rule> };
  assert.equal(enriched.rules[0].version.sourcePatch, "26.18");
  assert.deepEqual(enriched.rules[0].notes, rule.notes);
});

test("승인 스킬의 초안은 변경 없이 메타데이터를 스킬에 연결한다", () => {
  const draft = { summary: "A skill.", rules: [{ effects: [], conditions: [] }] };
  const ability = enrichNotes({ job: { patch: "26.19" }, draft }, { baselinePatch: "26.19" }) as { draft: typeof draft; version: ReturnType<typeof noteVersion> };
  assert.deepEqual(ability.draft, draft);
  assert.equal(ability.version.verifiedThroughPatch, "26.19");
});

test("제거된 메타는 직접 답변과 검색 문서 모두 제거 패치를 안내한다", () => {
  const answer = gameMetaAnswer("아타칸 스킬이 뭐야?", "ko_KR")!;
  assert.match(answer, /현재.*제거/);
  assert.match(answer, /26\.1 패치/);
  assert.equal(gameMetaById("meta:atakhan", "ko_KR"), answer);
  assert.equal(gameMetaDocs("ko_KR").find(doc => doc.id === "meta:atakhan")!.text, answer);
  assert.match(gameMetaAnswer("Feats of Strength", "en_US")!, /currently removed.*26\.1/);
  assert.equal(removalNotice("Baron", noteVersion({}, { baselinePatch: "26.19" }), "en_US"), undefined);
});

test("재도입 기록은 이전 제거 상태를 바꾸고 마지막 변경 패치를 보존한다", () => {
  const previous = noteVersion({ id: "atakhan" }, { baselinePatch: "26.19" });
  const version = noteVersion({ id: "atakhan", version: previous }, { baselinePatch: "26.20" }, [{
    id: "atakhan", page: "Atakhan", state: "active", changedInPatch: "26.20", removedInPatch: "26.1", scope: "summoners-rift",
  }]);
  assert.equal(version.lifecycle.state, "active");
  assert.equal(version.lastChangedPatch, "26.20");
  assert.equal(version.lifecycle.removedInPatch, "26.1");
  assert.equal(removalNotice("Atakhan", version, "en_US"), undefined);
});
