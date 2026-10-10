import { breakpointLevelValues, interpolationLevelValues, listedLevelValues } from "@/domain/game/levels/championLevel";
import type {
  ByCharLevelBreakpointsCalculationPart,
  ByCharLevelFormulaCalculationPart,
  ByCharLevelInterpolationCalculationPart,
  CalcResult,
  CalculationPart,
  GameCalculation,
  Value,
} from "./contracts";
import type { EvaluatorContext } from "./partContext";
import { type PartResult } from "./productPartEvaluator";
import { isVector } from "./values";

/**
 * 레벨별 값(1~20레벨)을 레벨 범위 값으로 쓴다. 모든 레벨 값이 같으면 하나로 접는다.
 * 툴팁은 1·18레벨 끝값만 적지만, 합·곱·배율을 레벨마다 따로 적용해야 레벨별 수치 표가 맞다.
 */
function levelRange(values: readonly number[]): Value {
  return values.every((value) => value === values[0]) ? values[0] : [...values];
}

function breakpointValues(part: ByCharLevelBreakpointsCalculationPart): number[] {
  // mInitialBonusPerLevel 은 2레벨부터 첫 브레이크포인트 전까지의 레벨당 증가량이다
  // (가렌 P 재생 1.5% ~, 아칼리 P 35 ~ 가 이 값으로 오른다).
  return breakpointLevelValues(
    Number(part.mLevel1Value) || 0,
    Number(part.mInitialBonusPerLevel) || 0,
    part.mBreakpoints ?? [],
  );
}

function interpolationValues(part: ByCharLevelInterpolationCalculationPart): number[] {
  const start = part.mStartValue ?? 0;
  return interpolationLevelValues(start, part.mEndValue ?? start, part.mScaleByStatProgressionMultiplier === true);
}

export function evaluateRange(calc: GameCalculation): CalcResult | null {
  const parts = calc.mFormulaParts ?? [];
  if (parts.length !== 1) return null;
  const part = parts[0];
  const isPercent = Boolean(calc.mDisplayAsPercent);

  if (part.__type === "ByCharLevelInterpolationCalculationPart") {
    return {
      base: levelRange(interpolationValues(part as ByCharLevelInterpolationCalculationPart)),
      statParts: [],
      isPercent,
      isCharLevelRange: true,
    };
  }

  // 레벨별 값을 통째로 나열한 파트
  if (part.__type === "ByCharLevelFormulaCalculationPart") {
    const values = listedLevelValues((part as ByCharLevelFormulaCalculationPart).values ?? []);
    if (values.length === 0) return null;
    return {
      base: levelRange(values),
      statParts: [],
      isPercent,
      isBreakpointRange: true,
    };
  }

  if (part.__type !== "ByCharLevelBreakpointsCalculationPart") return null;

  const breakpoint = part as ByCharLevelBreakpointsCalculationPart;
  // 표시 6 은 "레벨 범위로 적기", 퍼센트 + 레벨당 증가는 범위 계산식이다.
  // 둘 다 레벨별 값을 편 채로 범위를 만든다.
  const isDisplayRange = calc.mSimpleTooltipCalculationDisplay === 6;
  if (!isDisplayRange && (!isPercent || !breakpoint.mInitialBonusPerLevel)) return null;
  const values = breakpointValues(breakpoint);
  return {
    base: values,
    statParts: [],
    isPercent,
    ...(isDisplayRange ? { isBreakpointRange: true } : { isCharLevelRange: true }),
  };
}

/**
 * 계산 파트 하나를 { 숫자 base, 스탯 비율 } 로 평가한다.
 *
 * mFormulaParts 최상위뿐 아니라 Sum/Product/Clamp/StatBySubPart 의 서브 파트,
 * mMultiplier 자리에도 같은 파트 타입이 오므로 재귀로 처리한다.
 * 해석하지 못한 타입은 null 을 돌려주고 호출부에서 그 항만 건너뛴다.
 */
/**
 * DataValue 이름 두 개로 레벨 값을 정하는 파트.
 *
 * 두 가지가 있다. 이름이 비슷해도 뜻이 달라, 앞은 시작·뒤는 끝으로만 읽으면 이렐리아 P 가 (10 ~ 3) 이 된다.
 *   시작·끝 값: 1레벨 값·18레벨 값 ("LightningDamageLevel1", "MegaHealthEndingValue")
 *   1레벨 값·레벨당 증가량: 이렐리아 P "OnHitBaseDamage", "OnHitPerLevel" → 10 ~ 61
 * CDragon 은 필드명을 해시로 남겼다가 해시 목록이 늘면 이름으로 풀어 다시 내보낸다
 * ({0589a59c} → StartDataValue). 그래서 해시와 풀린 이름을 함께 받고, 둘 다 아니면 문자열 필드가
 * 정확히 둘일 때 뒤 DataValue 이름이 PerLevel 로 끝나는지로 가른다. DataValue 이름은 해시가 풀려도 그대로다.
 */
const LEVEL_PAIR_FIELDS = {
  start: ["{0589a59c}", "StartDataValue"],
  end: ["{0b65bc23}", "EndDataValue"],
  level1: ["{91d404a5}"],
  perLevel: ["{b2cd0eb0}"],
} as const;

export function readLevelPair(
  part: CalculationPart,
  ctx: EvaluatorContext,
): PartResult | null {
  const record = part as unknown as Record<string, unknown>;
  const nameOf = (fields: readonly string[]): string | undefined => {
    const field = fields.find((key) => typeof record[key] === "string");
    return field ? (record[field] as string) : undefined;
  };
  const scalar = (name: string, optional: boolean): number | null => {
    const value = ctx.evaluateDataValue(name, { optional });
    return value == null || isVector(value) ? null : value;
  };
  const pairOf = (first: string, second: string, optional: boolean): number[] | null => {
    const a = scalar(first, optional);
    const b = scalar(second, optional);
    if (a == null || b == null) return null;
    return /PerLevel$/i.test(second) ? breakpointLevelValues(a, b, []) : interpolationLevelValues(a, b);
  };

  const start = nameOf(LEVEL_PAIR_FIELDS.start);
  const end = nameOf(LEVEL_PAIR_FIELDS.end);
  const level1 = nameOf(LEVEL_PAIR_FIELDS.level1);
  const perLevel = nameOf(LEVEL_PAIR_FIELDS.perLevel);
  let values: number[] | null = null;
  if (start && end) values = interpolationLevelValues(scalar(start, false) ?? NaN, scalar(end, false) ?? NaN);
  else if (level1 && perLevel) values = pairOf(level1, perLevel, false);
  else {
    // 모르는 필드명: 구조로 본다. 시험 삼아 찾는 것이라 없어도 진단에 남기지 않는다
    // (버프 중첩 파트의 mBuffName "{8682fc00}" 도 문자열 둘이라 여기 걸린다)
    const entries = Object.entries(record).filter(([key]) => key !== "__type");
    if (entries.length === 2 && entries.every(([, value]) => typeof value === "string")) {
      values = pairOf(entries[0][1] as string, entries[1][1] as string, true);
    }
  }
  if (!values || values.some((value) => !Number.isFinite(value))) return null;
  const range = levelRange(values);
  return isVector(range)
    ? { base: range, statParts: [], isLevelRange: true }
    : { base: range, statParts: [] };
}

/**
 * 레벨 브레이크포인트인데 값 대신 DataValue 이름이 들어 있는 파트.
 *
 * CDragon 이 타입·필드명을 해시로 남겨 이름으로는 못 알아본다. 구조로 본다.
 *   { "{...}": "Level1MS", "{...}": "MSBonusPerLevelAtAndAfter",
 *     "{...}": [ { level: 6, "{...}": "...AdditionalBonusAtThisLevel",
 *                  "{...}": "...BonusPerLevelAtAndAfter" }, ... ] }
 * 항목의 역할은 DataValue 이름 끝말로 가른다. Riot 이 일관되게 붙이는 이름이고,
 * 못 알아보면 기존처럼 항을 비우므로 틀린 숫자가 나갈 위험은 없다.
 */
// {4ce08984} 파트의 필드 해시 (CDragon 이 이름을 풀지 못한 BIN 필드)
const NAMED_BREAKPOINT_FIELDS = {
  level1: "{91d404a5}",
  initialBonusPerLevel: "{bbd778a2}",
  breakpoints: "{9823b29a}",
  additionalBonusAtThisLevel: "{ae9b464d}",
  bonusPerLevelAtAndAfter: "{b0d8b2ac}",
} as const;

export function readNamedBreakpoints(
  part: CalculationPart,
  ctx: EvaluatorContext,
): PartResult | null {
  const record = part as unknown as Record<string, unknown>;
  const entries = Object.entries(record).filter(([key]) => key !== "__type");

  const listEntry = entries.find(([, value]) => Array.isArray(value));
  const names = entries
    .filter(([, value]) => typeof value === "string")
    .map(([, value]) => value as string);
  if (!listEntry || names.length === 0) return null;

  // 게임은 없는 DataValue 이름을 0 으로 읽는다 (아칼리 P 의 MSBonusPerLevelAtAndAfter,
  // 벨베스 P 의 AdditionalBonusAtThisLevel 은 정의되지 않은 이름이다).
  const optionalScalar = (name: unknown): number | undefined => {
    if (typeof name !== "string") return undefined;
    const value = ctx.evaluateDataValue(name, { optional: true });
    return value == null || isVector(value) ? undefined : value;
  };

  const level1Name =
    (typeof record[NAMED_BREAKPOINT_FIELDS.level1] === "string"
      ? (record[NAMED_BREAKPOINT_FIELDS.level1] as string)
      : undefined) ??
    names.find((name) => /level ?1$/i.test(name)) ??
    names[0];
  const level1 = ctx.evaluateDataValue(level1Name);
  if (level1 == null || isVector(level1)) return null;
  // 2레벨부터 첫 브레이크포인트 전까지의 레벨당 증가량 (벨베스 P ASPerStackInitialBonusPerLevel).
  // 빼먹으면 벨베스 P 가 0.1 ~ 2 가 아니라 0.1 ~ 1.8 로 나온다 (위키 대조).
  const initialBonusPerLevel = optionalScalar(
    record[NAMED_BREAKPOINT_FIELDS.initialBonusPerLevel],
  );

  const breakpoints: Array<{
    mLevel?: number;
    mAdditionalBonusAtThisLevel?: number;
    mBonusPerLevelAtAndAfter?: number;
  }> = [];

  for (const raw of listEntry[1] as unknown[]) {
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as Record<string, unknown>;
    const level = typeof entry.level === "number" ? entry.level : undefined;
    if (level == null) return null;

    const point: (typeof breakpoints)[number] = { mLevel: level };
    const additional = entry[NAMED_BREAKPOINT_FIELDS.additionalBonusAtThisLevel];
    const perLevel = entry[NAMED_BREAKPOINT_FIELDS.bonusPerLevelAtAndAfter];
    if (additional !== undefined || perLevel !== undefined) {
      const additionalValue = optionalScalar(additional);
      if (additionalValue !== undefined) point.mAdditionalBonusAtThisLevel = additionalValue;
      // 브레이크포인트의 레벨당 증가량 자리는 비어 있어도 "여기서 증가가 바뀐다" 는 뜻이라 0 으로 둔다
      point.mBonusPerLevelAtAndAfter = optionalScalar(perLevel) ?? 0;
    } else {
      // 필드 해시가 다르면 예전처럼 DataValue 이름 끝말로 역할을 가른다
      for (const [key, value] of Object.entries(entry)) {
        if (key === "__type" || typeof value !== "string") continue;
        const resolved = optionalScalar(value);
        if (resolved === undefined) continue;
        if (/AdditionalBonus/i.test(value)) point.mAdditionalBonusAtThisLevel = resolved;
        else if (/PerLevel/i.test(value)) point.mBonusPerLevelAtAndAfter = resolved;
      }
    }
    breakpoints.push(point);
  }
  if (breakpoints.length === 0) return null;

  const range = levelRange(breakpointLevelValues(level1, initialBonusPerLevel ?? 0, breakpoints));
  return isVector(range)
    ? { base: range, statParts: [], isLevelRange: true }
    : { base: range, statParts: [] };
}

export function evaluateByCharLevelBreakpoints(part: CalculationPart): PartResult | null {
  // 레벨에 따라 값이 바뀌면 레벨 범위로 노출한다. 레벨당 증가 없이 특정 레벨에서만
  // 더해지는 값도 범위다 (니달리 W 덫 개수 4 → 6·11·16레벨에 +2 → 10)
  const range = levelRange(breakpointValues(part as ByCharLevelBreakpointsCalculationPart));
  return isVector(range)
    ? { base: range, statParts: [], isLevelRange: true }
    : { base: range, statParts: [] };
}

export function evaluateByCharLevelFormula(part: CalculationPart): PartResult | null {
  const values = listedLevelValues((part as ByCharLevelFormulaCalculationPart).values ?? []);
  if (values.length === 0) return null;
  const range = levelRange(values);
  return isVector(range)
    ? { base: range, statParts: [], isLevelRange: true }
    : { base: range, statParts: [] };
}

export function evaluateByCharLevelInterpolation(part: CalculationPart): PartResult | null {
  const range = levelRange(interpolationValues(part as ByCharLevelInterpolationCalculationPart));
  return isVector(range)
    ? { base: range, statParts: [], isLevelRange: true }
    : { base: range, statParts: [] };
}
