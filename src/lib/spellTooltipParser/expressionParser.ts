import { ParseResult } from "./types";

/**
 * `spell.<스킬이름>:<변수>` 접두사 분리
 *
 * DDragon 툴팁은 값의 출처 스킬을 명시하는 경우가 있다.
 * 예) `spell.gnarq:minitotaldamage`, `spell.jaycetotheskies:slow*-100`
 * 자기 자신을 가리키기도 하고(그나르 미니/메가 폼) 다른 스킬을 가리키기도 한다.
 */
function splitSpellRef(input: string): { spellRef?: string; rest: string } {
  // 접두사 표기가 데이터마다 갈린다. `spell.` 과 `Spell.` 이 섞여 있어
  // 대소문자를 무시하고 받는다. (예: Spell.VeigarPassive:dQKillStacks)
  const match = /^spell\.([A-Za-z0-9_]+)\s*:\s*(.+)$/i.exec(input);
  if (!match) return { rest: input };
  return { spellRef: match[1].toLowerCase(), rest: match[2] };
}

/**
 * 변수 표현식을 파싱
 * 예: "e1", "e1 * 100", "BaseDamage + 3", "spell.gnarq:slowamount*100" 등
 */
export function parseExpression(input: string): ParseResult {
  const { spellRef, rest } = splitSpellRef(input.trim());
  const cleanInput = rest.trim();

  // VAR * 100, VAR * -100, VAR + 3, VAR - 2.5 같은 포뮬라 파싱
  // 예: "movespeedmod*-100" → variable: "movespeedmod", operator: "*", operand: -100
  const formulaRegex = new RegExp(
    "^([a-zA-Z_][a-zA-Z0-9_]*)\\s*([*+/-])\\s*(-?\\d+(?:\\.\\d+)?)$"
  );
  const formulaMatch = cleanInput.match(formulaRegex);

  if (formulaMatch) {
    const operator = formulaMatch[2] as "*" | "+" | "-" | "/";
    return {
      type: "formula",
      variable: formulaMatch[1],
      operator,
      operand: parseFloat(formulaMatch[3]),
      spellRef,
    };
  }

  return {
    type: "variable",
    variable: cleanInput,
    spellRef,
  };
}
