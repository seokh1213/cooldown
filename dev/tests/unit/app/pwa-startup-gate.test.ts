import assert from "node:assert/strict";
import { test } from "node:test";
import { PwaStartupGate } from "../../../../src/app/pwa/startupGate";

test("최초 방문·수동 갱신·오프라인 진입은 업데이트 확인을 기다리지 않는다", async () => {
  const gate = new PwaStartupGate(false);
  await gate.ready;
  assert.equal(gate.pending, false);
});

test("진입 확인이 늦으면 3초 후 기존 화면을 열고 자동 적용 기회를 종료한다", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = new PwaStartupGate(true);
  context.mock.timers.tick(2999);
  assert.equal(gate.pending, true);
  context.mock.timers.tick(1);
  await gate.ready;
  assert.equal(gate.pending, false);
});

test("확인이 끝나면 본문을 열고 남은 타이머를 해제한다", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = new PwaStartupGate(true);
  gate.finish();
  await gate.ready;
  assert.equal(gate.pending, false);
  gate.finish();
  context.mock.timers.tick(3000);
  assert.equal(gate.pending, false);
});

test("새 워커로 새로고침이 시작되면 이전 본문은 계속 가린다", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const gate = new PwaStartupGate(true);
  gate.holdForReload();
  context.mock.timers.tick(3000);
  assert.equal(gate.pending, true);
  gate.finish();
});
