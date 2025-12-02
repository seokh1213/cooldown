/**
 * 숫자를 깔끔하게 포맷팅 (소수점 자릿수 제한, 불필요한 0 제거)
 */
export function formatNumber(value: string | number): string {
  if (value === null || value === undefined || value === "") return "";

  const num = typeof value === "number" ? value : parseFloat(String(value));

  // 숫자가 아닌 경우 원본 반환
  if (isNaN(num)) return String(value);

  // 정수인 경우 소수점 없이 반환
  if (num % 1 === 0) return num.toString();

  // 소수점이 있는 경우 최대 3자리까지, 불필요한 0 제거
  return parseFloat(num.toFixed(3)).toString();
}

/**
 * 레벨별 값을 "/" 형식으로 포맷팅
 * @param values 레벨별 값 배열
 * @param maxLevel 최대 레벨 (spell.maxrank)
 * @param skipFirst Community Dragon 데이터인 경우 true (0번째 인덱스가 버퍼)
 * @returns 포맷팅된 문자열 (예: "1/2/3" 또는 "1" - 모두 같으면)
 */
export function formatLevelValues(
  values: (string | number)[],
  maxLevel?: number,
  skipFirst: boolean = false
): string {
  if (!values || values.length === 0) return "";

  // Community Dragon 데이터인 경우 0번째 인덱스(버퍼) 제외
  const startIndex = skipFirst && values.length > 1 ? 1 : 0;
  const processedValues = values.slice(startIndex);

  const validValues = processedValues.filter(
    (v) => v !== null && v !== undefined && v !== "" && v !== "0"
  );
  if (validValues.length === 0) return "";

  // 최대 레벨까지만 사용
  const displayValues = maxLevel
    ? validValues.slice(0, maxLevel)
    : validValues;

  if (displayValues.length === 0) return "";

  // 포맷팅된 값들
  const formattedValues = displayValues.map((v) => formatNumber(v));

  // 모든 값이 같으면 하나만 표시
  const firstValue = formattedValues[0];
  const allSame = formattedValues.every((v) => v === firstValue);
  if (allSame) {
    return firstValue;
  }

  return formattedValues.join("/");
}

/**
 * HTML 태그 정리 및 안전한 렌더링을 위한 처리
 */
export function sanitizeHtml(text: string): string {
  let result = text;

  // <br> 태그를 일관된 형태로 정규화 (줄바꿈 자체는 유지)
  // 예: <br>, <br/>, <br /> → <br />
  result = result.replace(/<br\s*\/?>/gi, "<br />");

  // 연속된 공백 정리 (개행 문자는 유지)
  // \s 에는 \n 도 포함되므로, 개행을 제외한 공백만 정리
  result = result.replace(/[^\S\r\n]+/g, " ");

  return result;
}

