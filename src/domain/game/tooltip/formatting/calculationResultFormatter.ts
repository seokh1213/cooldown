import type { AbilityLevelValues } from "@/domain/game/contracts/championData";
import { ABILITY_SCALING_MAX_LEVEL, CHAMPION_MAX_LEVEL } from "@/domain/game/levels/championLevel";
import { getTranslations } from "@/shared/i18n";
import { logger } from "@/shared/lib/logger";
import type { CalcResult, StatPart, Value } from "../calculations/contracts";
import { add, isVector, scaleBy100 } from "../calculations/values";
import type { TooltipLocale } from "../contracts";
import { LEVEL_ICON, statIconToken } from "./statIcons";
import { valueToTooltipString } from "./valueFormatter";

/** 툴팁에 레벨 범위를 하나 적을 때마다 그 범위의 레벨별 값을 받는다 */
export type LevelValuesReporter = (entry: AbilityLevelValues) => void;

function scalePercent(value: Value, precision?: number): Value {
  if (precision == null) return scaleBy100(value);
  return isVector(value)
    ? value.map((entry) => entry * 100)
    : value * 100;
}

/**
 * 소수 digits 자리에서 반올림해 적는다.
 *
 * 게임 자료는 float32 라 0.235 가 0.23499999940395355 로 들어온다. 유효숫자 7자리로 잡음을
 * 걷어낸 뒤, 2진 표현이 아니라 10진 값으로 반올림한다. toFixed 는 8.245 를 8.2449999… 로 보고
 * 8.24 로 내린다 (쉔 P 18레벨 7.995 → 소수 둘째 자리 8).
 */
function roundDecimal(value: number, digits: number): number {
  const denoised = Number(value.toPrecision(7));
  const text = String(Math.abs(denoised));
  const rounded = text.includes("e")
    ? Number(Math.abs(denoised).toFixed(digits))
    : Number(`${Math.round(Number(`${text}e${digits}`))}e-${digits}`);
  return denoised < 0 && rounded !== 0 ? -rounded : rounded;
}

/** digits 자리에서 반올림하고 끝자리 0 은 지운다 */
function formatFixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return String(value);
  return roundDecimal(value, digits).toFixed(digits).replace(/\.0+$|(\.\d*?)0+$/, "$1");
}

/**
 * 랭크 값·스탯 계수·배율에 쓰는 자릿수. 게임은 이 자리에 현재 랭크의 값 하나만 적어 비교할 근거가 없다.
 * 여러 랭크 값을 나란히 적을 때 값이 뭉개지지 않게 mPrecision 보다 한 자리 더 적는다.
 */
function detailDigits(precision: number | undefined): number | undefined {
  return precision == null || precision < 0 ? undefined : precision + 1;
}

/** mPrecision -1 이면 반올림하지 않는다. float32 잡음만 걷어내 소수 셋째 자리까지 적는다 */
const EXACT_PRECISION = -1;
const EXACT_DIGITS = 3;

function formatValueWithPrecision(value: Value, precision: number): string {
  const formatEntry = (entry: number): string => formatFixed(entry, precision);
  if (!isVector(value)) return formatEntry(value);
  const formatted = value.map(formatEntry);
  return formatted.every((entry) => entry === formatted[0])
    ? formatted[0]
    : formatted.join("/");
}

function scaleStatParts(result: CalcResult): StatPart[] {
  return result.statParts.map((part) => ({
    ...part,
    ratio: scalePercent(part.ratio, result.precision),
  }));
}

/**
 * 같은 스탯 항을 하나로 합친다.
 * "(55% 추가 공격력) + (68.75% 추가 공격력)" 처럼 두 번 나오면
 * 읽는 사람이 어느 쪽을 봐야 할지 알 수 없다.
 */
function mergeStatParts(parts: StatPart[]): StatPart[] {
  const merged: StatPart[] = [];
  for (const part of parts) {
    const target = merged.find(
      (entry) =>
        entry.name === part.name &&
        Boolean(entry.isCoefficient) === Boolean(part.isCoefficient) &&
        isVector(entry.ratio) === isVector(part.ratio) &&
        (!isVector(entry.ratio) ||
          entry.ratio.length === (part.ratio as number[]).length),
    );
    if (!target) {
      merged.push({ ...part });
      continue;
    }
    try {
      target.ratio = add(target.ratio, part.ratio);
    } catch {
      merged.push({ ...part });
    }
  }
  return merged;
}

function isZeroValue(value: Value): boolean {
  return isVector(value)
    ? value.length > 0 && value.every((entry) => entry === 0)
    : value === 0;
}

/** 자릿수가 정해지지 않은 배율·스탯 계수 레벨 범위는 소수 둘째 자리까지 적는다 */
const LEVEL_RANGE_DEFAULT_DIGITS = 2;

type LevelValueFormat = Pick<AbilityLevelValues, "digits" | "trimZeros">;

/** 레벨별 값 하나를 적는다. 툴팁 범위 끝값과 챔피언 레벨별 수치 표가 같이 쓴다 */
export function formatLevelValue(value: number, format: LevelValueFormat): string {
  if (!Number.isFinite(value)) return String(value);
  return format.trimZeros
    ? formatFixed(value, format.digits)
    : roundDecimal(value, format.digits).toFixed(format.digits);
}

/** 레벨 범위 문구 "(a ~ b)". 끝값은 1레벨과 18레벨 값이다 */
export function formatLevelRangeLabel(entry: AbilityLevelValues): string {
  const suffix = entry.percent ? "%" : "";
  const minimum = formatLevelValue(entry.values[0], entry);
  const maximum = formatLevelValue(entry.values[ABILITY_SCALING_MAX_LEVEL - 1], entry);
  return `(${minimum}${suffix} ~ ${maximum}${suffix})`;
}

/**
 * 레벨별 값을 "(a ~ b)" 로 적고 끝에 레벨 글리프를 붙인다. series 는 이미 퍼센트로 바꾼 값이다.
 * 적은 범위의 레벨별 값은 report 로 넘긴다. float32 잡음은 유효숫자 7자리로 걷어 싣는다.
 */
function formatLevelSeries(
  series: readonly number[],
  suffix: string,
  format: LevelValueFormat,
  report?: LevelValuesReporter,
): string {
  const entry: AbilityLevelValues = {
    values: series.map((value) => Number(value.toPrecision(7))),
    digits: format.digits,
    ...(format.trimZeros ? { trimZeros: true as const } : {}),
    ...(suffix === "%" ? { percent: true as const } : {}),
  };
  report?.(entry);
  // 표의 줄 이름도 formatLevelRangeLabel 로 적어 툴팁 문구와 같다
  return `${formatLevelRangeLabel(entry).slice(0, -1)}${LEVEL_ICON})`;
}

/**
 * 기본 수치의 레벨 범위를 인게임 툴팁처럼 적는다. series 는 이미 퍼센트로 바꾼 값이다.
 * 자릿수는 mPrecision 그대로(없으면 정수, -1 이면 반올림하지 않음)이고 끝자리 0 도 남긴다
 * (인게임: 카시오페아 P (5% ~ 36%), 나르 P 방어력 (4 ~ 55), 공격 속도 (5.5% ~ 99.0%), 샤코 P (23 ~ 75)).
 */
function formatGameLevelRange(
  series: readonly number[],
  suffix: string,
  precision: number | undefined,
  report?: LevelValuesReporter,
): string {
  const format: LevelValueFormat = precision === EXACT_PRECISION
    ? { digits: EXACT_DIGITS, trimZeros: true }
    : { digits: precision ?? 0 };
  return formatLevelSeries(series, suffix, format, report);
}

/**
 * 배율·스탯 계수의 레벨 범위를 "(a ~ b)" 로 적는다. series 는 이미 퍼센트로 바꾼 값이다.
 * 정수로 자르면 "× (1.3 ~ 1.6)" 이나 "(3.5% ~ 10.5%) 공격력" 의 뜻이 망가져 소수 둘째 자리까지 둔다.
 */
function formatLevelRange(
  series: readonly number[],
  suffix: string,
  precision: number | undefined,
  report?: LevelValuesReporter,
): string {
  return formatLevelSeries(series, suffix, { digits: precision ?? LEVEL_RANGE_DEFAULT_DIGITS, trimZeros: true }, report);
}

/** 레벨 범위 값은 1~20레벨 값 배열이다. 랭크 값 배열은 이 길이가 되지 않는다 */
function isLevelSeries(value: Value): value is number[] {
  return isVector(value) && value.length === CHAMPION_MAX_LEVEL;
}

function formatRange(result: CalcResult, base: Value, report?: LevelValuesReporter): string | null {
  const isRange = result.isCharLevelRange || result.isBreakpointRange;
  if (!isRange || !isLevelSeries(base)) return null;
  return formatGameLevelRange(base, result.isPercent ? "%" : "", result.precision, report);
}

function formatBase(result: CalcResult, base: Value, report?: LevelValuesReporter): string | null {
  if (isZeroValue(base)) return null;

  const range = formatRange(result, base, report);
  if (range) return range;

  const digits = detailDigits(result.precision);
  const raw = digits == null
    ? valueToTooltipString(base)
    : formatValueWithPrecision(base, digits);
  return result.isPercent ? `${raw}%` : raw;
}

/**
 * 스탯 1당 계수가 0.1% 미만이면 "100당" 으로 바꿔 적는다.
 *
 * 아트록스 E 의 흡혈 계수는 추가 체력 1당 0.011% 다. 그대로 적으면
 * 소수점에서 뭉개져 "0.01%" 가 되고 읽는 사람에게 아무 정보도 주지 못한다.
 * "추가 체력 100당 1.1%" 로 적으면 자릿수도 살고 뜻도 통한다.
 */
const TINY_RATIO_LIMIT = 0.1;

function isTinyRatio(ratio: Value): boolean {
  const entries = isVector(ratio) ? ratio : [ratio];
  return (
    entries.length > 0 &&
    entries.every((entry) => entry !== 0 && Math.abs(entry) < TINY_RATIO_LIMIT)
  );
}

function scaleRatio(ratio: Value, factor: number): Value {
  return isVector(ratio)
    ? ratio.map((entry) => entry * factor)
    : ratio * factor;
}

function formatStatPart(
  part: StatPart,
  lang: TooltipLocale,
  precision: number | undefined,
  report?: LevelValuesReporter,
): string {
  const tiny = Boolean(part.name) && isTinyRatio(part.ratio);
  const ratioValue = tiny ? scaleRatio(part.ratio, 100) : part.ratio;
  const icon = statIconToken(part.icon);
  const template = getTranslations(lang).common.perHundredStat;

  // 레벨 범위 계수는 "5/45%" 처럼 랭크 값으로 읽히지 않게 "(5% ~ 45%)" 로 적는다
  if (part.isLevelRange && isLevelSeries(ratioValue)) {
    if (!tiny) return `(${icon}${formatLevelRange(ratioValue, "%", precision, report)} ${part.name})`;
    return `(${icon}${template.replace("{stat}", part.name).replace("{value}", formatLevelRange(ratioValue, "", precision, report))})`;
  }

  const ratio = precision == null
    ? valueToTooltipString(ratioValue)
    : formatValueWithPrecision(ratioValue, precision);
  if (!tiny) return `(${icon}${ratio}% ${part.name})`;
  return `(${icon}${template.replace("{stat}", part.name).replace("{value}", ratio)})`;
}

/**
 * 스탯 의존 배율을 "× (1 + 30% 추가 공격 속도)" 형태로 만든다.
 *
 * 치명타 확률·추가 공격 속도처럼 런타임 스탯이 필요한 배율은 숫자로 접으면
 * "스탯 0" 가정 값이 되어 실제보다 작아진다. 접지 않고 곱해지는 항으로 남긴다.
 */
function formatStatMultiplier(
  multiplierResult: CalcResult["statMultiplier"],
  lang: TooltipLocale,
  report?: LevelValuesReporter,
): string | null {
  if (!multiplierResult) return null;
  const { base, statParts, isPercent, isLevelRange } = multiplierResult;
  const terms: string[] = [];

  if (isLevelRange && isLevelSeries(base)) {
    // 레벨 범위 배율은 랭크 값("1.3/1.6")으로 읽히지 않게 범위로 적는다
    const scaled = isPercent ? (scaleBy100(base) as number[]) : base;
    terms.push(formatLevelRange(scaled, isPercent ? "%" : "", detailDigits(multiplierResult.precision), report));
  } else if (!isZeroValue(base)) {
    // 퍼센트로 적는 계산식을 배율로 쓰면 base 도 퍼센트여야 한다.
    // 세트 W 의 투지 전환율이 "0.25" 가 아니라 "25%" 로 나와야 하는 경우.
    terms.push(
      isPercent
        ? `${valueToTooltipString(scaleBy100(base))}%`
        : valueToTooltipString(base),
    );
  }

  for (const part of statParts) {
    const scaled = scaleBy100(part.ratio);
    // 0% 항은 정보가 없고 문장만 늘린다
    if (isZeroValue(scaled)) continue;
    // 레벨 범위 계수는 "19/40%" 처럼 랭크 값으로 읽히지 않게 "(19% ~ 40%)" 로 적는다
    const value = part.isLevelRange && isLevelSeries(scaled)
      ? formatLevelRange(scaled, "%", detailDigits(multiplierResult.precision), report)
      : `${valueToTooltipString(scaled)}%`;
    terms.push(part.name ? `${statIconToken(part.icon)}${value} ${part.name}` : value);
  }

  for (const part of multiplierResult.groupedParts ?? []) {
    const formatted = formatCalculationResult(part, lang, report);
    if (formatted) terms.push(formatted);
  }

  if (terms.length === 0) return null;
  // 항이 하나라도 "40% 공격력" 처럼 스탯 이름이 붙으면 괄호로 묶는다.
  // "… × 40% 공격력" 은 40% 가 어디까지 걸리는지 읽히지 않는다.
  // 레벨 범위 "(1.3 ~ 1.6)" 은 이미 괄호로 묶여 있다
  const single =
    terms.length === 1 && (!/\s/.test(terms[0]) || /^\([^()]*\)$/.test(terms[0]));
  return single ? terms[0] : `(${terms.join(" + ")})`;
}

/**
 * 계산 결과를 툴팁 문구로 적는다.
 * reportLevelValues 는 적은 레벨 범위마다 그 레벨별 값을 문구에 나온 순서대로 받는다.
 */
export function formatCalculationResult(
  result: CalcResult,
  lang: TooltipLocale = "ko_KR",
  reportLevelValues?: LevelValuesReporter,
): string | null {
  const base = result.isPercent
    ? scalePercent(result.base, result.precision)
    : result.base;

  const statParts = mergeStatParts(scaleStatParts(result)).filter((part) => {
    // 어떤 스탯에 붙는 비율인지 모르면 숫자만 남아 의미가 없다
    if (part.name) return true;
    logger.debug("스탯 이름을 모르는 비율 항 제외", part.ratio);
    return false;
  });

  // 랭크 값과 길이가 달라 합치지 못한 레벨 범위는 옆에 별도 항으로 붙인다
  const formatExtraRange = (range: Value): string => {
    if (!isLevelSeries(range)) return valueToTooltipString(range);
    const scaled = result.isPercent ? (scalePercent(range, result.precision) as number[]) : range;
    return formatGameLevelRange(scaled, result.isPercent ? "%" : "", result.precision, reportLevelValues);
  };

  // 적는 순서대로 부른다. 레벨별 값도 이 순서로 넘어간다
  const parts = [
    formatBase(result, base, reportLevelValues),
    ...(result.extraRanges ?? []).map(formatExtraRange),
    ...statParts.map((part) => formatStatPart(part, lang, detailDigits(result.precision), reportLevelValues)),
    ...(result.groupedParts ?? []).map((part) => formatCalculationResult(
      result.isPercent ? { ...part, isPercent: true } : part,
      lang,
      reportLevelValues,
    )),
  ].filter((part): part is string => part !== null);

  // 배율이 여럿이면 차례로 곱한다 (아크샨 E 치명타: … × (1 + 30% 추가 공격 속도) × 100% 치명타 피해량)
  const multipliers = [result.statMultiplier, ...(result.extraMultipliers ?? [])]
    .map((entry) => formatStatMultiplier(entry, lang, reportLevelValues))
    .filter((entry): entry is string => entry !== null);
  const multiplier = multipliers.length > 0 ? multipliers.join(" × ") : null;
  if (parts.length === 0) return result.showZero ? (result.isPercent ? "0%" : "0") : multiplier;

  const output = parts.join(" + ");
  const joined = parts.length === 1 ? output : `(${output})`;
  // 예: "(25/35/45 + (15% 공격력)) × (1 + 30% 추가 공격 속도)"
  return multiplier ? `${joined} × ${multiplier}` : joined;
}
