/**
 * 챔피언 레벨 축
 *
 * 최대 레벨은 20 이다. 기본은 18 이고 탑 라인 역할 퀘스트를 마치면 20 까지 오른다.
 * 툴팁의 레벨 범위와 스킬 시뮬레이션이 같은 값을 써야 끝값이 서로 어긋나지 않는다.
 *
 * 레벨별 값 배열은 [0] 이 1레벨이고 길이는 CHAMPION_MAX_LEVEL 이다.
 */
export const CHAMPION_MAX_LEVEL = 20;

/**
 * 역할 퀘스트 없이 오르는 최대 레벨. ByCharLevelInterpolation 의 mEndValue 가 이 레벨의 값이다.
 * 19레벨부터는 같은 기울기로 이어진다 (위키: 라칸 P 보호막 `30 + (225-30)/17*(x-1) for 20`).
 */
const DEFAULT_MAX_LEVEL = 18;

/**
 * 19레벨부터 부호가 뒤집히는 값은 0 에서 멈춘다.
 *
 * 아이번 P 숲 생성 비용은 1레벨 체력 15% 에서 레벨당 0.882% 씩 줄어 18레벨에 0 에 닿는다.
 * 그대로 이으면 20레벨 비용이 -1.76% 가 된다. 게임이 19레벨 뒤를 어떻게 다루는지는 자료로
 * 알 수 없고, 음수 비용은 뜻이 없어 0 에서 멈춘 값을 보인다.
 */
function stopAtZeroCrossing(values: number[]): number[] {
  const atDefaultMax = values[DEFAULT_MAX_LEVEL - 1];
  if (atDefaultMax === undefined || atDefaultMax === 0) return values;
  return values.map((value, index) =>
    index >= DEFAULT_MAX_LEVEL && value * atDefaultMax < 0 ? 0 : value);
}

export interface LevelBreakpoint {
  mLevel?: number;
  mAdditionalBonusAtThisLevel?: number;
  mBonusPerLevelAtAndAfter?: number;
}

/**
 * ByCharLevelBreakpoints 를 레벨별 값으로 편다.
 *
 * 2레벨부터 첫 브레이크포인트 전까지는 initialPerLevel 만큼 오른다. 브레이크포인트 레벨부터는
 * 그 브레이크포인트의 mBonusPerLevelAtAndAfter 만큼 오르고, 값이 없으면 0 이다
 * (신짜오 W 미니언 피해는 16레벨 추가량 뒤로 더 오르지 않는다).
 * mAdditionalBonusAtThisLevel 은 그 레벨에서 한 번 더해진다.
 */
export function breakpointLevelValues(
  level1: number,
  initialPerLevel: number,
  breakpoints: readonly LevelBreakpoint[],
): number[] {
  const values = [level1];
  for (let level = 2; level <= CHAMPION_MAX_LEVEL; level += 1) {
    let perLevel = initialPerLevel;
    let activeLevel = -1;
    for (const entry of breakpoints) {
      if (typeof entry.mLevel !== "number" || level < entry.mLevel || entry.mLevel < activeLevel) continue;
      activeLevel = entry.mLevel;
      perLevel = entry.mBonusPerLevelAtAndAfter ?? 0;
    }
    let value = values[level - 2] + perLevel;
    for (const entry of breakpoints) {
      if (typeof entry.mAdditionalBonusAtThisLevel !== "number") continue;
      if (entry.mLevel == null || entry.mLevel === level) value += entry.mAdditionalBonusAtThisLevel;
    }
    values.push(value);
  }
  return stopAtZeroCrossing(values);
}

/**
 * 1레벨 start, 18레벨 end 인 선형 보간을 레벨별 값으로 편다.
 * scalePastDefaultMaxLevel 이 false 면 19레벨부터 18레벨 값에 머문다 (자료의 mScalePastDefaultMaxLevel).
 */
export function interpolationLevelValues(
  start: number,
  end: number,
  scalePastDefaultMaxLevel = true,
): number[] {
  const slope = (end - start) / (DEFAULT_MAX_LEVEL - 1);
  const values = Array.from({ length: CHAMPION_MAX_LEVEL }, (_, index) =>
    start + slope * (scalePastDefaultMaxLevel ? index : Math.min(index, DEFAULT_MAX_LEVEL - 1)));
  return stopAtZeroCrossing(values);
}

/**
 * ByCharLevelFormula 의 values 를 레벨별 값으로 바꾼다.
 *
 * values[i] 가 i레벨 값이다. [0] 은 0레벨이라 쓰지 않는다
 * (럭스 P `[20, 30, 40, …]` 의 1레벨은 30, 위키 30 ~ 200).
 * 최대 레벨까지 값이 없으면 마지막 값으로 채운다.
 */
export function listedLevelValues(values: readonly number[]): number[] {
  const byLevel = values.slice(1, CHAMPION_MAX_LEVEL + 1);
  if (byLevel.length === 0) return [];
  while (byLevel.length < CHAMPION_MAX_LEVEL) byLevel.push(byLevel[byLevel.length - 1]);
  return byLevel;
}
