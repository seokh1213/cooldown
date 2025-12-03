import { ChampionSpell } from "@/types";
import type { Language } from "@/i18n";
import {
  CommunityDragonSpellData,
  ParseResult,
  Value,
} from "./types";
import { parseExpression } from "./expressionParser";
import { replaceData } from "./dataValueHandler";
import { replaceCalculateData } from "./spellCalculationHandler";
import { applyFormulaToValue } from "./dataValueUtils";
import { valueToTooltipString } from "./valueUtils";

/**
 * 문자열 내 숫자들을 지정된 소수점 자릿수로 반올림
 * 예: precision=0 → 33.333 → 33
 * precision=1 → 33.0 → 33.0 (명시적으로 지정된 경우 0도 표시)
 */
function applyNumericPrecision(text: string, precision: number): string {
  if (!Number.isFinite(precision) || precision < 0) return text;

  return text.replace(/-?\d+(?:\.\d+)?/g, (match) => {
    const num = Number.parseFloat(match);
    if (!Number.isFinite(num)) return match;

    // 명시적으로 precision이 지정된 경우, 해당 자릿수를 항상 유지
    // 예: precision=1 → 33.0 (0이어도 표시)
    return num.toFixed(precision);
  });
}

/**
 * 연산자(+ / ~) 주변 공백 보정
 * - "{{ calc_damage }}+Max Health" → "{{ calc_damage }} + Max Health"
 * - "50~100" → "50 ~ 100"
 */
function normalizeOperators(text: string): string {
  return text
    .replace(/(}})\s*\+\s*(\S)/g, "$1 + $2")
    .replace(/(\S)\s*\+\s*({{)/g, "$1 + $2")
    .replace(/(\S)\s*~\s*(\S)/g, "$1 ~ $2");
}

/**
 * 중첩된 변수 패턴 제거
 * - {{ ... {{ ... }} ... }} 같은 구조는 통째로 제거
 *   (게임 모드별 tooltip 등, 현재 파서에서 지원하지 않는 패턴)
 */
function removeNestedVariableBlocks(text: string): string {
  return text.replace(/\{\{([^}]*\{\{[^}]*}}[^}]*)}}/g, () => "");
}

/**
 * Spell_*_Tooltip, spellmodifierdescriptionappend 등
 * 치환 불가능한 특수 패턴 제거
 */
function stripUnsupportedSpellPlaceholders(text: string): string {
  let result = text;

  // Spell_*_Tooltip 패턴 제거 (Community Dragon에서도 치환이 안되는 값)
  result = result.replace(/\{\{Spell_[^}]*Tooltip[^}]*}}/gi, "");

  // spellmodifierdescriptionappend 단독 패턴 제거
  result = result.replace(/\{\{spellmodifierdescriptionappend}}/gi, "");

  return result;
}

/**
 * {{ variable }} 토큰을 실제 숫자/텍스트로 치환
 * - precision 접미사(.0, .1 등) 처리
 * - 지원하지 않는 변수는 빈 문자열로 삭제
 */
function replaceVariableTokens(
  text: string,
  spell: ChampionSpell,
  communityDragonData: CommunityDragonSpellData | undefined,
  lang: Language
): string {
  const variableRegex = /\{\{([^}]+)}}/g;

  return text.replace(variableRegex, (_match, variableName) => {
    const trimmedVar = String(variableName).trim();

    // 특수 변수 처리 (spellmodifierdescriptionappend, Spell_*_Tooltip 등)
    if (
      trimmedVar === "spellmodifierdescriptionappend" ||
      trimmedVar.includes("gamemodeinteger") ||
      (trimmedVar.includes("Spell_") && trimmedVar.includes("Tooltip"))
    ) {
      return "";
    }

    // rcooldownreduction.0*100 처럼 ".소수점자릿수"를 가진 변수 처리
    // - baseName: rcooldownreduction
    // - precision: 0
    // - tail: "*100"
    let effectiveVar = trimmedVar;
    let precision: number | undefined;

    const precisionMatch =
      /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\.(\d+))(.*)$/.exec(trimmedVar);
    if (precisionMatch) {
      const [, baseName, precisionStr, tail] = precisionMatch;
      const parsedPrecision = Number.parseInt(precisionStr, 10);
      if (Number.isFinite(parsedPrecision)) {
        precision = parsedPrecision;
        effectiveVar = `${baseName}${tail}`; // ".0" 를 제거한 표현식으로 치환
      }
    }

    const replacement = replaceVariable(
      effectiveVar,
      spell,
      communityDragonData,
      lang
    );

    if (replacement !== null) {
      return precision !== undefined
        ? applyNumericPrecision(replacement, precision)
        : replacement;
    }

    // 값을 찾을 수 없으면 빈 문자열로 제거
    return "";
  });
}

/**
 * 변수 치환 이후 남은 플레이스홀더/공백 정리
 * - 남은 {{ }}, %, 아이콘 토큰 제거
 * - 연속 공백 정리 (개행은 유지)
 */
function cleanupPlaceholdersAndIcons(text: string): string {
  let result = text;

  // 치환 후 남은 불완전한 변수 패턴 제거 ({{ 또는 }}만 남은 경우)
  result = result.replace(/\{\{\s*\}/g, ""); // {{ }} 패턴 제거
  result = result.replace(/\}\}/g, ""); // 남은 }} 제거
  result = result.replace(/\{\{/g, ""); // 남은 {{ 제거

  // 아이콘/리소스 플레이스홀더 제거
  // 형식: %{리소스타입}:{이름}%
  // 예: %i:scaleAPen% → "" (토큰만 삭제, 나머지 문장은 유지)
  // - %% 안에 공백이 없고, ":" 콜론이 포함된 경우에만 매칭
  result = result.replace(/%[^\s:%]+:[^\s%]+%/g, "");

  // 치환 후 남은 "%" 기호가 혼자 있는 경우 제거
  result = result.replace(/\s+%\s+/g, " "); // 공백으로 둘러싸인 % 제거
  result = result.replace(/(?<!\d)\s*%\s*(?!\d)/g, ""); // 숫자와 함께 있지 않은 % 제거
  // 시작/끝 부분의 % 도, 숫자와 붙어있지 않은 경우에만 제거
  result = result.replace(/^\s*%\s*(?!\d)/g, ""); // 시작 부분의 단독 % 제거
  result = result.replace(/(?<!\d)\s*%\s*$/g, ""); // 끝 부분의 단독 % 제거

  // 연속된 공백 정리 (개행 문자는 유지 → <br /> 줄바꿈 보존)
  result = result.replace(/[^\S\r\n]+/g, " ");

  return result;
}

/**
 * 변수 치환 ({{ variable }} 형식)
 * 레벨별 값은 "/" 형식으로 표시
 * HTML 태그 내부의 변수도 치환하되, 태그 구조는 보존
 * @param text 원본 텍스트
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon에서 가져온 스킬 데이터 (선택적)
 * @param lang
 * @returns 치환된 텍스트
 */
export function replaceVariables(
  text: string,
  spell?: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: Language = "ko_KR"
): string {
  if (!spell) return text;

  let result = text;

  // 0. 연산자(+ / ~) 주변 공백 보정
  result = normalizeOperators(result);

  // 1. 중첩 변수 블록 제거
  result = removeNestedVariableBlocks(result);

  // 2. 치환 불가능한 특수 패턴 제거
  result = stripUnsupportedSpellPlaceholders(result);

  // 3. {{ variable }} 토큰 치환
  result = replaceVariableTokens(result, spell, communityDragonData, lang);

  // 4. 잔여 플레이스홀더/아이콘/공백 정리
  result = cleanupPlaceholdersAndIcons(result);

  return result;
}

/**
 * 단일 변수 치환
 * @param trimmedVar 변수명
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon 데이터
 * @returns 치환된 문자열 또는 null
 */
export function replaceVariable(
  trimmedVar: string,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: Language = "ko_KR"
): string | null {
  const parseResult = parseExpression(trimmedVar);

  // 0. effectBurn 기반 eN 변수(e1, e2, e3, ...) 우선 처리
  const byEffectBurn = replaceEffectBurn(parseResult, spell, communityDragonData);
  if (byEffectBurn !== null) return byEffectBurn;

  // 1. DataValues 먼저 시도
  const byData = replaceData(parseResult, spell, communityDragonData);
  if (byData !== null) return byData;

  // 2. 안 되면 mSpellCalculations
  return replaceCalculateData(parseResult, spell, communityDragonData, lang);
}

/**
 * effectBurn 배열(e1, e2, e3, ...)을 이용한 변수 치환
 * - e1 → effectBurn[1], e4 → effectBurn[4] 등
 * - effectBurn 은 Community Dragon 데이터가 우선이고, 없으면 Data Dragon(spell.effectBurn) 사용
 * - "25/30/35/40/45" 같이 "/" 로 구분된 값은 레벨별 값으로 처리
 */
function replaceEffectBurn(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData
): string | null {
  const varName = parseResult.variable;
  const match = /^e(\d+)$/i.exec(varName);
  if (!match) return null;

  const index = Number.parseInt(match[1], 10);
  if (!Number.isFinite(index) || index <= 0) return null;

  const effectBurnSource =
    communityDragonData?.effectBurn ?? spell.effectBurn;
  if (!effectBurnSource) return null;

  const raw = effectBurnSource[index];
  if (!raw) return null;

  // "80/100/120" → [80, 100, 120]
  // "0.5" → 0.5
  let value: Value;
  if (raw.includes("/")) {
    const nums = raw
      .split("/")
      .map((s) => Number.parseFloat(s))
      .filter((v) => !Number.isNaN(v));

    if (nums.length === 0) return null;
    value = nums.length === 1 ? nums[0] : nums;
  } else {
    const num = Number.parseFloat(raw);
    if (Number.isNaN(num)) return null;
    value = num;
  }

  const withFormula = applyFormulaToValue(value, parseResult);
  return valueToTooltipString(withFormula);
}
