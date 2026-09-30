/**
 * 스킬 수치의 챔피언 레벨 축
 *
 * 챔피언은 탑 라인 역할 퀘스트로 20레벨까지 오르지만 스킬·패시브 수치는 18레벨 뒤로 오르지 않는다
 * (인게임 확인. 위키 틀의 `for 20` 값은 틀렸다). 툴팁의 레벨 범위와 스킬 시뮬레이션이 같은
 * 레벨별 값을 쓴다.
 *
 * 레벨별 값 배열은 [0] 이 1레벨이고 길이는 ABILITY_SCALING_MAX_LEVEL 이다.
 */
export const ABILITY_SCALING_MAX_LEVEL = 18;

export interface LevelBreakpoint {
  mLevel?: number;
  mAdditionalBonusAtThisLevel?: number;
  mBonusPerLevelAtAndAfter?: number;
}

/**
 * ByCharLevelBreakpoints 를 레벨별 값으로 편다.
 *
 * 1레벨 값은 level1 이다. 2레벨부터 첫 브레이크포인트 전까지는 initialPerLevel 만큼 오른다.
 * 브레이크포인트 레벨부터는 그 브레이크포인트의 mBonusPerLevelAtAndAfter 만큼 오르고, 값이 없으면 0 이다
 * (신짜오 W 미니언 피해는 16레벨 추가량 뒤로 더 오르지 않는다).
 * mAdditionalBonusAtThisLevel 은 그 레벨에서 한 번 더해진다.
 * mLevel 이 없으면 1레벨이다. CDragon 은 기본값인 필드를 생략한다
 * (요네 W 미니언 최소 피해: 2레벨부터 +10, 9레벨부터 +20, 14레벨부터 +40 → 30 ~ 400).
 */
export function breakpointLevelValues(
  level1: number,
  initialPerLevel: number,
  breakpoints: readonly LevelBreakpoint[],
): number[] {
  const levelOf = (entry: LevelBreakpoint): number => entry.mLevel ?? 1;
  const values = [level1];
  for (let level = 2; level <= ABILITY_SCALING_MAX_LEVEL; level += 1) {
    let perLevel = initialPerLevel;
    let activeLevel = -1;
    let additional = 0;
    for (const entry of breakpoints) {
      const entryLevel = levelOf(entry);
      if (entryLevel === level && typeof entry.mAdditionalBonusAtThisLevel === "number") {
        additional += entry.mAdditionalBonusAtThisLevel;
      }
      if (level < entryLevel || entryLevel < activeLevel) continue;
      activeLevel = entryLevel;
      perLevel = entry.mBonusPerLevelAtAndAfter ?? 0;
    }
    values.push(values[level - 2] + perLevel + additional);
  }
  return values;
}

/**
 * 챔피언 스탯 성장 곡선의 진행량. 1레벨 0, 18레벨 17 이고 레벨이 오를수록 한 번에 받는 몫이 커진다.
 * 성장 공식 `Growth × (L − 1) × (0.7025 + 0.0175 × (L − 1))` 의 뒷부분이다.
 */
function statProgression(level: number): number {
  return (level - 1) * (0.7025 + 0.0175 * (level - 1));
}

/**
 * 1레벨 start, 18레벨 end 인 레벨 보간을 레벨별 값으로 편다.
 *
 * scaleByStatProgression 이면(자료의 mScaleByStatProgressionMultiplier) 레벨마다 같은 몫이 아니라
 * 스탯 성장 곡선을 따라 오른다. 끝값은 같고 중간 레벨 값이 달라진다
 * (야스오 P 보호막 10레벨 341.26, 선형이면 376.47).
 */
export function interpolationLevelValues(
  start: number,
  end: number,
  scaleByStatProgression = false,
): number[] {
  const span = statProgression(ABILITY_SCALING_MAX_LEVEL);
  return Array.from({ length: ABILITY_SCALING_MAX_LEVEL }, (_, index) => {
    const progress = scaleByStatProgression ? statProgression(index + 1) : index;
    return start + ((end - start) * progress) / span;
  });
}

/**
 * ByCharLevelFormula 의 values 를 레벨별 값으로 바꾼다.
 *
 * values[i] 가 i레벨 값이다. [0] 은 0레벨이라 쓰지 않는다
 * (럭스 P `[20, 30, 40, …]` 의 1레벨은 30, 위키 30 ~ 200).
 * 18레벨까지 값이 없으면 마지막 값으로 채운다.
 */
export function listedLevelValues(values: readonly number[]): number[] {
  const byLevel = values.slice(1, ABILITY_SCALING_MAX_LEVEL + 1);
  if (byLevel.length === 0) return [];
  while (byLevel.length < ABILITY_SCALING_MAX_LEVEL) byLevel.push(byLevel[byLevel.length - 1]);
  return byLevel;
}
