import type { CalcResult, StatPart, TooltipLocale, Value } from "./types";
import { formatNumber } from "./formatters";
import { getTranslations } from "@/i18n";
import { logger } from "@/lib/logger";
import { add, isVector, scaleBy100, valueToTooltipString } from "./valueUtils";

function scalePercent(value: Value, precision?: number): Value {
  if (precision == null) return scaleBy100(value);
  return isVector(value)
    ? value.map((entry) => entry * 100)
    : value * 100;
}

function formatValueWithPrecision(value: Value, precision: number): string {
  const formatEntry = (entry: number): string => {
    if (!Number.isFinite(entry)) return String(entry);
    return entry.toFixed(precision).replace(/\.?0+$/, "");
  };
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

function formatRange(result: CalcResult, base: Value): string | null {
  const isRange = result.isCharLevelRange || result.isBreakpointRange;
  if (!isRange || !isVector(base) || base.length !== 2) return null;
  const [minimum, maximum] = base.map(formatNumber);
  return result.isPercent
    ? `(${minimum}% ~ ${maximum}%)`
    : `(${minimum} ~ ${maximum})`;
}

function formatBase(result: CalcResult, base: Value): string | null {
  if (isZeroValue(base)) return null;

  const range = formatRange(result, base);
  if (range) return range;

  const raw = result.precision == null
    ? valueToTooltipString(base)
    : formatValueWithPrecision(base, result.precision);
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
  precision?: number,
): string {
  const tiny = Boolean(part.name) && isTinyRatio(part.ratio);
  const ratioValue = tiny ? scaleRatio(part.ratio, 100) : part.ratio;
  const ratio = precision == null
    ? valueToTooltipString(ratioValue)
    : formatValueWithPrecision(ratioValue, precision);

  if (!tiny) return `(${ratio}% ${part.name})`;

  const template = getTranslations(lang).common.perHundredStat;
  return `(${template.replace("{stat}", part.name).replace("{value}", ratio)})`;
}

/**
 * 스탯 의존 배율을 "× (1 + 30% 추가 공격 속도)" 형태로 만든다.
 *
 * 치명타 확률·추가 공격 속도처럼 런타임 스탯이 필요한 배율은 숫자로 접으면
 * "스탯 0" 가정 값이 되어 실제보다 작아진다. 접지 않고 곱해지는 항으로 남긴다.
 */
function formatStatMultiplier(result: CalcResult): string | null {
  if (!result.statMultiplier) return null;
  const { base, statParts, isPercent } = result.statMultiplier;
  const terms: string[] = [];

  if (!isZeroValue(base)) {
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
    const ratio = valueToTooltipString(scaled);
    terms.push(part.name ? `${ratio}% ${part.name}` : `${ratio}%`);
  }

  if (terms.length === 0) return null;
  // 항이 하나라도 "40% 공격력" 처럼 스탯 이름이 붙으면 괄호로 묶는다.
  // "… × 40% 공격력" 은 40% 가 어디까지 걸리는지 읽히지 않는다.
  const single = terms.length === 1 && !/\s/.test(terms[0]);
  return single ? terms[0] : `(${terms.join(" + ")})`;
}

export function formatCalculationResult(
  result: CalcResult,
  lang: TooltipLocale = "ko_KR",
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
  const rangeParts = (result.extraRanges ?? []).map((range) => {
    if (!isVector(range) || range.length !== 2) return valueToTooltipString(range);
    const scaled = result.isPercent ? scalePercent(range, result.precision) : range;
    const [minimum, maximum] = (scaled as number[]).map(formatNumber);
    return result.isPercent
      ? `(${minimum}% ~ ${maximum}%)`
      : `(${minimum} ~ ${maximum})`;
  });

  const parts = [
    formatBase(result, base),
    ...rangeParts,
    ...statParts.map((part) => formatStatPart(part, lang, result.precision)),
  ].filter((part): part is string => part !== null);

  const multiplier = formatStatMultiplier(result);
  if (parts.length === 0) return multiplier;

  const output = parts.join(" + ");
  const joined = parts.length === 1 ? output : `(${output})`;
  // 예: "(25/35/45 + (15% 공격력)) × (1 + 30% 추가 공격 속도)"
  return multiplier ? `${joined} × ${multiplier}` : joined;
}
