import assert from "node:assert/strict";
import { test } from "node:test";
import { findAbilityLevelIssues } from "../../scripts/data-pipeline/ability-level-validation";
import type { AbilityLevelValues } from "../../../src/domain/game/contracts/championData";

const entry = (steps: number[], percent?: true): AbilityLevelValues => ({
  values: steps.flatMap((value) => Array(5).fill(value)), digits: 0, ...(percent ? { percent } : {}),
});

test("본문에 있는 레벨 범위 중 표 데이터가 빠진 범위를 찾는다", () => {
  assert.deepEqual(findAbilityLevelIssues({
    bodyHtml: "(5 ~ 26[[si:scalelevel]]) 방어력, (25 ~ 130[[si:scalelevel]]) 피해",
    levelValues: [entry([5, 12, 19, 26])],
  }), [{ reason: "missing-level-values", range: "(25 ~ 130)" }]);
});

test("여러 번 나오는 동일 레벨 범위는 하나의 표로 충분하다", () => {
  assert.deepEqual(findAbilityLevelIssues({
    bodyHtml: "<span>(20% ~ 35%[[si:scalelevel]])</span> 방어력, (20% ~ 35%[[si:scalelevel]]) 마법 저항력",
    levelValues: [entry([20, 25, 30, 35], true)],
  }), []);
});

test("충전·이동 거리·대상 체력에 따른 범위는 레벨 표를 요구하지 않는다", () => {
  assert.deepEqual(findAbilityLevelIssues({ bodyHtml: "0.5 ~ 1.5초 도발, 몬스터에게 60 ~ 150 피해" }), []);
});

test("본문과 연결되지 않는 표와 잘못된 레벨 마커를 찾는다", () => {
  assert.deepEqual(findAbilityLevelIssues({
    bodyHtml: "5 ~ 26[[si:scalelevel]]", levelValues: [entry([5, 12, 19, 26])],
  }), [
    { reason: "unreferenced-level-values", range: "(5 ~ 26)" },
    { reason: "unmatched-level-marker", range: "1 markers / 0 ranges" },
  ]);
});
