import { Value } from "../calculations/contracts";
import { ParseResult } from "../contracts";
import { binHashKey } from "./binHash";

/**
 * DataValues에서 이름으로 값 가져오기
 * 배열 칸 번호가 곧 랭크이고 0번 칸은 0랭크(아직 배우지 않은 상태)다.
 * 보통은 1 ~ maxRank 만 쓴다. 0랭크 값이 실제로 보이는 참조만 firstRank 0 으로 읽는다
 * (rankZeroReferences.ts).
 * 모든 값이 같으면 스칼라, 아니면 벡터
 */
export function getDataValueByName(
  dataValues: Record<string, number[]>,
  key: string,
  maxRank: number,
  firstRank: 0 | 1 = 1
): Value | null {
  if (!key || typeof key !== "string") return null;

  const wanted = key.toLowerCase();
  // 일부 값은 BIN 필드명 그대로라 "m" 접두사가 붙어 있다.
  // 예) 툴팁 토큰 ammorechargetime ↔ DataValue mAmmoRechargeTime
  const wantedWithPrefix = `m${wanted}`;
  // 이름이 지워지고 해시만 남은 항목도 있다.
  const hashed = binHashKey(key);

  const entry = Object.entries(dataValues).find(([name]) => {
    if (name == null) return false;
    if (name === hashed) return true;
    const lower = name.toLowerCase();
    return lower === wanted || lower === wantedWithPrefix;
  });
  if (!entry) return null;

  const [, raw] = entry;
  const levelData = raw.slice(firstRank, maxRank + 1);

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
