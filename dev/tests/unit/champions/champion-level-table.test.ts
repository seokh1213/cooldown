/**
 * 툴팁 아래 "챔피언 레벨별 수치" 표의 칸 고르기
 * npm run test:one dev/tests/unit/champions/champion-level-table.test.ts 로 실행
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AbilityLevelValues } from "../../../../src/domain/game/contracts/championData";
import { breakpointLevelValues, interpolationLevelValues } from "../../../../src/domain/game/levels/championLevel";
import { levelTableColumns, type LevelTableColumn } from "../../../../src/domain/game/levels/championLevelTable";
import { formatLevelRangeLabel } from "../../../../src/domain/game/tooltip/formatting/calculationResultFormatter";

/** 머리·칸을 읽기 쉬운 글로 줄인다 */
function describe(columns: LevelTableColumn[]): string[] {
  return columns.map(({ head, cell }) => {
    const left = head.kind === "perLevel"
      ? "per"
      : `${head.from}${head.to != null ? `-${head.to}` : ""}${head.onward ? "~" : ""}`;
    const right = cell.kind === "value"
      ? cell.text
      : cell.kind === "step" ? `${cell.text}/lv` : `${cell.first}>${cell.last}`;
    return `${left} ${right}`;
  });
}

const entry = (values: number[], extra: Partial<AbilityLevelValues> = {}): AbilityLevelValues => ({
  values,
  digits: 0,
  ...extra,
});

test("값이 바뀌는 레벨이 적으면 바뀌는 레벨만 적는다 (벡스 P 파멸 주기)", () => {
  const values = [25, 22, 19, 16].flatMap((value) => Array(5).fill(value));
  assert.deepEqual(describe(levelTableColumns(entry(values))), ["1 25", "6 22", "11 19", "16~ 16"]);
  assert.equal(formatLevelRangeLabel(entry(values)), "(25 ~ 16)");
});

test("정수로 반올림해 계단처럼 오르는 값은 바뀌는 레벨만 적는다 (오리아나 P 추가 피해)", () => {
  const values = interpolationLevelValues(10, 50).map((value) => value * 0.15);
  assert.deepEqual(
    describe(levelTableColumns(entry(values))),
    ["1 2", "4 3", "7 4", "10 5", "13 6", "16 7", "18~ 8"],
  );
});

test("레벨당 증가량이 몇 번만 바뀌면 증가량 구간으로 적는다 (요네 W 미니언 최소 피해)", () => {
  const values = breakpointLevelValues(30, 0, [
    { mBonusPerLevelAtAndAfter: 10 },
    { mLevel: 9, mBonusPerLevelAtAndAfter: 20 },
    { mLevel: 14, mBonusPerLevelAtAndAfter: 40 },
  ]);
  assert.deepEqual(describe(levelTableColumns(entry(values))), ["1 40", "2-8 +10/lv", "9-13 +20/lv", "14~ +40/lv"]);
});

test("19레벨부터 증가량이 바뀌는 값은 그 구간을 따로 적는다 (라칸 P 보호막 재사용 대기시간)", () => {
  const values = breakpointLevelValues(40, -1.5, [{ mLevel: 19, mBonusPerLevelAtAndAfter: -0.875 }]);
  assert.deepEqual(
    describe(levelTableColumns(entry(values, { digits: 1 }))),
    ["1 40.0", "2-18 −1.5/lv", "19~ −0.875/lv"],
  );
});

test("고르게 오르다 18레벨에서 멈추는 값은 레벨당 증가량을 적는다 (벡스 P 우울 추가 피해)", () => {
  const values = interpolationLevelValues(40, 150);
  assert.deepEqual(describe(levelTableColumns(entry(values))), ["1 40", "18~ 150", "per +6.47/lv"]);
});

test("스탯 성장 곡선을 따르는 값은 처음과 끝 증가량을 적는다 (나르 P 공격 속도)", () => {
  const values = interpolationLevelValues(5.5, 99, true);
  assert.deepEqual(
    describe(levelTableColumns(entry(values, { digits: 1, percent: true }))),
    ["1 5.5%", "18~ 99.0%", "per +3.96%>+7.04%"],
  );
});

test("더 오르지 않는 구간은 그 값을 적는다 (신짜오 W 미니언 피해)", () => {
  // 16레벨 브레이크포인트에 레벨당 증가량이 없어 16레벨에 20 을 더한 뒤로는 오르지 않는다
  const values = breakpointLevelValues(50, 5, [{ mLevel: 16, mAdditionalBonusAtThisLevel: 20 }]);
  assert.deepEqual(describe(levelTableColumns(entry(values))), ["1 50", "2-15 +5/lv", "16 +20/lv", "17~ 140"]);
});
