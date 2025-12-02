import { ParseResult } from "./types";

/**
 * 변수 표현식을 파싱
 * 예: "e1", "e1 * 100", "BaseDamage + 3" 등
 */
export function parseExpression(input: string): ParseResult {
  const cleanInput = input.trim();

  // VAR * 100, VAR * -100, VAR + 3, VAR - 2.5 같은 포뮬라 파싱
  // 예: "movespeedmod*-100" → variable: "movespeedmod", operator: "*", operand: -100
  const formulaRegex = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*([*+\/-])\s*(-?\d+(?:\.\d+)?)$/;
  const formulaMatch = cleanInput.match(formulaRegex);

  if (formulaMatch) {
    const operator = formulaMatch[2] as "*" | "+" | "-" | "/";
    return {
      type: "formula",
      variable: formulaMatch[1],
      operator,
      operand: parseFloat(formulaMatch[3]),
    };
  }

  return {
    type: "variable",
    variable: cleanInput,
  };
}

