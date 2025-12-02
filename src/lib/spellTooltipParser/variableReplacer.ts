import { ChampionSpell } from "@/types";
import { CommunityDragonSpellData } from "./types";
import { parseExpression } from "./expressionParser";
import { replaceData } from "./dataValueHandler";
import { replaceCalculateData } from "./spellCalculationHandler";
import { removeDuplicatePercentPatterns } from "./textCleaner";

/**
 * 변수 치환 ({{ variable }} 형식)
 * 레벨별 값은 "/" 형식으로 표시
 * HTML 태그 내부의 변수도 치환하되, 태그 구조는 보존
 * @param text 원본 텍스트
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon에서 가져온 스킬 데이터 (선택적)
 * @returns 치환된 텍스트
 */
export function replaceVariables(
  text: string,
  spell?: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData
): string {
  console.log(text, spell, communityDragonData)
  if (!spell) return text;

  let result = text;

  // 0. 연산자(+ / ~) 주변 공백 보정
  // 예: "{{ calc_damage_1_max }}+최대 체력의 {{ calc_damage_1_percent_max }}"
  //  → "{{ calc_damage_1_max }} + 최대 체력의 {{ calc_damage_1_percent_max }}"
  //    "50~100" → "50 ~ 100"
  result = result
    // 변수 닫힘 뒤의 "+" 보정: "}}+X" → "}} + X"
    .replace(/(}})\s*\+\s*(\S)/g, "$1 + $2")
    // 앞쪽 텍스트와 변수 사이 "+" 보정: "X+{{" → "X + {{"
    .replace(/(\S)\s*\+\s*({{)/g, "$1 + $2")
    // 물결(~)도 양쪽 공백을 강제: "A~B" → "A ~ B"
    .replace(/(\S)\s*~\s*(\S)/g, "$1 ~ $2");

  // 이미 치환된 변수를 추적하여 중복 방지
  const replacedVars = new Set<string>();

  // 먼저 중첩된 패턴을 제거하거나 처리
  result = result.replace(/\{\{([^}]*\{\{[^}]*}}[^}]*)}}/g, () => {
    // 중첩된 변수 패턴은 제거 (게임 모드별 tooltip 등은 처리 불가)
    return "";
  });

  // Spell_*_Tooltip 패턴 제거 (Community Dragon에서도 치환이 안되는 값)
  result = result.replace(/\{\{Spell_[^}]*Tooltip[^}]*}}/gi, "");

  // spellmodifierdescriptionappend 단독 패턴 제거
  result = result.replace(/\{\{spellmodifierdescriptionappend}}/gi, "");

  // {{ variable }} 패턴 찾기 (HTML 태그 내부도 포함)
  // 하지만 HTML 태그 자체는 건드리지 않음
  const variableRegex = /\{\{([^}]+)}}/g;

  result = result.replace(variableRegex, (_match, variableName) => {
    const trimmedVar = variableName.trim();

    // 이미 치환된 변수는 건너뛰기 (중복 방지)
    if (replacedVars.has(trimmedVar)) {
      return "";
    }

    // 특수 변수 처리 (spellmodifierdescriptionappend 등)
    if (
      trimmedVar === "spellmodifierdescriptionappend" ||
      trimmedVar.includes("gamemodeinteger") ||
      (trimmedVar.includes("Spell_") && trimmedVar.includes("Tooltip"))
    ) {
      // 이런 변수들은 제거
      replacedVars.add(trimmedVar);
      return "";
    }

    // 변수 치환 로직
    const replacement = replaceVariable(
      trimmedVar,
      spell,
      communityDragonData,
      replacedVars
    );

    if (replacement !== null) {
      replacedVars.add(trimmedVar);
      return replacement;
    }

    // 값을 찾을 수 없으면 빈 문자열로 제거
    return "";
  });

  // 치환 후 남은 불완전한 변수 패턴 제거 ({{ 또는 }}만 남은 경우)
  result = result.replace(/\{\{\s*\}/g, ""); // {{ }} 패턴 제거
  result = result.replace(/\}\}/g, ""); // 남은 }} 제거
  result = result.replace(/\{\{/g, ""); // 남은 {{ 제거

  // 치환 후 남은 "%" 기호가 혼자 있는 경우 제거
  result = result.replace(/\s+%\s+/g, " "); // 공백으로 둘러싸인 % 제거
  result = result.replace(/(?<!\d)\s*%\s*(?!\d)/g, ""); // 숫자와 함께 있지 않은 % 제거
  result = result.replace(/^\s*%\s*/g, ""); // 시작 부분의 % 제거
  result = result.replace(/\s*%\s*$/g, ""); // 끝 부분의 % 제거

  // 중복된 숫자 패턴 제거 (예: "25/30/35% 0.25/0.3/0.35" -> "25/30/35%")
  result = removeDuplicatePercentPatterns(result);

  // 연속된 공백 정리 (개행 문자는 유지 → <br /> 줄바꿈 보존)
  result = result.replace(/[^\S\r\n]+/g, " ");

  return result;
}

/**
 * 단일 변수 치환
 * @param trimmedVar 변수명
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon 데이터
 * @param _replacedVars 이미 치환된 변수 추적용 (현재 미사용)
 * @returns 치환된 문자열 또는 null
 */
export function replaceVariable(
  trimmedVar: string,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  _replacedVars?: Set<string>
): string | null {
  const parseResult = parseExpression(trimmedVar);

  // 1. DataValues 먼저 시도
  const byData = replaceData(parseResult, spell, communityDragonData);
  if (byData !== null) return byData;

  // 2. 안 되면 mSpellCalculations
  return replaceCalculateData(parseResult, spell, communityDragonData);
}
