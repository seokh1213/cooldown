import { Value } from "./types";
import { formatNumber } from "./formatters";

/**
 * 값이 벡터인지 확인
 */
export function isVector(v: Value): v is number[] {
  return Array.isArray(v);
}

/**
 * 값을 벡터로 변환
 */
export function toVector(v: Value, length: number): number[] {
  if (Array.isArray(v)) return v;
  return Array.from({ length }, () => v);
}

/**
 * 이진 연산 수행
 */
export function binaryOp(
  a: Value,
  b: Value,
  op: (x: number, y: number) => number
): Value {
  if (!isVector(a) && !isVector(b)) {
    return op(a, b);
  }
  const aVec = isVector(a) ? a : toVector(a, isVector(b) ? b.length : 1);
  const bVec = isVector(b) ? b : toVector(b, aVec.length);

  if (aVec.length !== bVec.length) {
    throw new Error(`Vector length mismatch: ${aVec.length} vs ${bVec.length}`);
  }

  return aVec.map((x, i) => op(x, bVec[i]));
}

/**
 * 덧셈 연산
 */
export function add(a: Value, b: Value): Value {
  return binaryOp(a, b, (x, y) => x + y);
}

/**
 * 곱셈 연산
 */
export function mul(a: Value, b: Value): Value {
  return binaryOp(a, b, (x, y) => x * y);
}

/**
 * 값을 툴팁 문자열로 변환
 */
export function valueToTooltipString(value: Value): string {
  if (isVector(value)) {
    const allSame = value.every((v) => v === value[0]);
    return allSame
      ? formatNumber(value[0])
      : value.map((v) => formatNumber(v)).join("/");
  }
  return formatNumber(value);
}

/**
 * Value ×100 후 반올림 (퍼센트 변환용)
 */
export function scaleBy100(value: Value): Value {
  if (isVector(value)) return value.map((v) => Math.round(v * 100));
  return Math.round(value * 100);
}

/**
 * 스탯 코드 → 이름 변환
 */
export function getStatName(mStat?: number, mStatFormula?: number): string {
  const s = mStat ?? mStatFormula;
  if (s === 2) return "AD";
  if (s === 3) return "AP";
  return "stat";
}

