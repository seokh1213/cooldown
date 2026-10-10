import { Value } from "./contracts";

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
 * Value ×100 후 반올림 (퍼센트 변환용)
 */
export function scaleBy100(value: Value): Value {
  // 기존에는 Math.round(v * 100) 으로 정수 퍼센트로 만들어 소수점이 모두 날아갔음.
  // 이제는 소수 둘째 자리까지 살릴 수 있도록 "그냥 ×100"만 하고,
  // 실제 반올림/표기는 formatNumber 쪽(최대 소수 2자리 + 불필요한 0 제거)에 맡긴다.
  if (isVector(value)) return value.map((v) => v * 100);
  return value * 100;
}
