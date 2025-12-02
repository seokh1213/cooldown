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
  // 기존에는 Math.round(v * 100) 으로 정수 퍼센트로 만들어 소수점이 모두 날아갔음.
  // 이제는 소수 둘째 자리까지 살릴 수 있도록 "그냥 ×100"만 하고,
  // 실제 반올림/표기는 formatNumber 쪽(최대 소수 2자리 + 불필요한 0 제거)에 맡긴다.
  if (isVector(value)) return value.map((v) => v * 100);
  return value * 100;
}

/**
 * 스탯 코드 → 이름 변환
 */
export function getStatName(mStat?: number, mStatFormula?: number): string {
  const hasStat = mStat !== undefined && mStat !== null;
  const hasFormula = mStatFormula !== undefined && mStatFormula !== null;

  // 규칙:
  // mstat: (2=AD, 12=체력, 1=방어력, 6=마법 저항력, 18=생명력 흡수, 생략=AP)
  // mStatFormula: (2는 추가, 생략=전체)
  //
  // "mstat:2" → AD
  // "mstat:2, mStatFormula: 2" → 추가 AD
  // "mstat:12, mStatFormula: 2"  → 추가 체력
  // "" (둘 다 생략) → AP

  // 둘 다 생략된 경우 → AP 계수
  if (!hasStat && !hasFormula) {
    return "AP";
  }

  const statCode = mStat ?? mStatFormula;

  // AD 계수
  if (statCode === 2) {
    if (mStat === 2 && mStatFormula === 2) {
      return "추가 AD"; // bonus AD
    }
    return "AD";
  }

  // 체력 계수
  if (statCode === 12) {
    if (mStat === 12 && mStatFormula === 2) {
      return "추가 체력"; // bonus HP
    }
    return "체력";
  }

  // 방어력 계수
  if (statCode === 1) {
    if (mStat === 1 && mStatFormula === 2) {
      return "추가 방어력";
    }
    return "방어력";
  }

  // 마법 저항력 계수
  if (statCode === 6) {
    if (mStat === 6 && mStatFormula === 2) {
      return "추가 마법 저항력";
    }
    return "마법 저항력";
  }

  // 생명력 흡수 계수
  if (statCode === 18) {
    if (mStat === 18 && mStatFormula === 2) {
      return "추가 생명력 흡수";
    }
    return "생명력 흡수";
  }

  // 그 외 알 수 없는 스탯은 표시하지 않는다 (아이콘으로만 처리하거나 무시)
  return "";
}

