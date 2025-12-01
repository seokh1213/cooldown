import { Value, ParseResult } from "./types";

/**
 * DataValues에서 이름으로 값 가져오기
 * 0번 인덱스는 버퍼, 1 ~ maxRank 까지만 사용
 * 모든 값이 같으면 스칼라, 아니면 벡터
 */
export function getDataValueByName(
  dataValues: Record<string, number[]>,
  key: string,
  maxRank: number
): Value | null {
  if (!key || typeof key !== "string") return null;
  const entry = Object.entries(dataValues).find(
    ([name]) => name != null && name.toLowerCase() === key.toLowerCase()
  );
  if (!entry) return null;

  const [, raw] = entry;
  const levelData = raw.slice(1, maxRank + 1); // 여기서 slice(1, maxRank+1)

  if (levelData.length === 0) return null;

  const first = levelData[0];
  const isScalar = levelData.every((v) => v === first);
  return isScalar ? first : levelData;
}

/**
 * {{ VAR * 100 }}, {{ VAR + 3 }} 같은 템플릿용 (DataValues 전용으로 쓰는 느낌)
 */
export function applyFormulaToValue(value: Value, parseResult: ParseResult): Value {
  if (parseResult.type !== "formula" || !parseResult.operator || parseResult.operand == null) {
    return value;
  }

  const { operator, operand } = parseResult;

  if (operator === "*") {
    if (Array.isArray(value)) return value.map((v) => v * operand);
    return value * operand;
  }

  if (operator === "+") {
    if (Array.isArray(value)) return value.map((v) => v + operand);
    return value + operand;
  }

  if (operator === "-") {
    if (Array.isArray(value)) return value.map((v) => v - operand);
    return value - operand;
  }

  if (operator === "/") {
    if (Array.isArray(value)) return value.map((v) => v / operand);
    return value / operand;
  }

  return value;
}

