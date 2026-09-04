/**
 * 문자열 내 숫자들을 지정된 소수점 자릿수로 반올림
 * 예: precision=0 → 33.333 → 33
 * precision=1 → 33.0 → 33.0 (명시적으로 지정된 경우 0도 표시)
 */
export function applyNumericPrecision(text: string, precision: number): string {
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
export function normalizeOperators(text: string): string {
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
export function removeNestedVariableBlocks(text: string): string {
  return text.replace(/\{\{([^}]*\{\{[^}]*}}[^}]*)}}/g, () => "");
}

/**
 * Spell_*_Tooltip, spellmodifierdescriptionappend 등
 * 치환 불가능한 특수 패턴 제거
 */
export function stripUnsupportedSpellPlaceholders(text: string): string {
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
 * - 지원하지 않는 변수는 출력에서 제거하되 진단 목록에 보존
 */
