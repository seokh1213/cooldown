import type { CalcResult, StatPart, Value } from "./types";
import { formatNumber } from "./formatters";
import { isVector, scaleBy100, valueToTooltipString } from "./valueUtils";

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

function formatRange(result: CalcResult, base: Value): string | null {
  const isRange = result.isCharLevelRange || result.isBreakpointRange;
  if (!isRange || !isVector(base) || base.length !== 2) return null;
  const [minimum, maximum] = base.map(formatNumber);
  return result.isPercent
    ? `(${minimum}% ~ ${maximum}%)`
    : `(${minimum} ~ ${maximum})`;
}

function formatBase(result: CalcResult, base: Value): string | null {
  const isZero = isVector(base)
    ? base.length > 0 && base.every((entry) => entry === 0)
    : base === 0;
  if (isZero) return null;

  const range = formatRange(result, base);
  if (range) return range;

  const raw = result.precision == null
    ? valueToTooltipString(base)
    : formatValueWithPrecision(base, result.precision);
  return result.isPercent ? `${raw}%` : raw;
}

function formatStatPart(part: StatPart, precision?: number): string {
  const ratio = precision == null
    ? valueToTooltipString(part.ratio)
    : formatValueWithPrecision(part.ratio, precision);
  return part.name ? `(${ratio}% ${part.name})` : `(${ratio}%)`;
}

export function formatCalculationResult(result: CalcResult): string | null {
  const base = result.isPercent
    ? scalePercent(result.base, result.precision)
    : result.base;
  const parts = [
    formatBase(result, base),
    ...scaleStatParts(result).map((part) =>
      formatStatPart(part, result.precision),
    ),
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) return null;
  const output = parts.join(" + ");
  return parts.length === 1 ? output : `(${output})`;
}
