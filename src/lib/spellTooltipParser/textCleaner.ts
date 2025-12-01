/**
 * 중복된 퍼센트 패턴 제거
 */
export function removeDuplicatePercentPatterns(result: string): string {
  // 텍스트에서 모든 퍼센트 값 찾기
  const percentMatches: Array<{ value: string; index: number }> = [];
  const percentRegex = /(\d+(?:\/\d+)+)%/g;
  let match;
  while ((match = percentRegex.exec(result)) !== null) {
    percentMatches.push({ value: match[1], index: match.index });
  }

  // 텍스트에서 모든 소수점 패턴 찾기 (0.숫자/0.숫자 형식)
  const decimalRegex = /(0\.[0-9]+(?:\/0?\.[0-9]+)+)/g;
  const decimalMatches: Array<{ value: string; index: number }> = [];
  while ((match = decimalRegex.exec(result)) !== null) {
    decimalMatches.push({ value: match[1], index: match.index });
  }

  // 각 소수점 패턴이 퍼센트 값과 같은지 확인하고 제거
  for (let i = decimalMatches.length - 1; i >= 0; i--) {
    const decimalMatch = decimalMatches[i];
    const decimalValues = decimalMatch.value.split("/").map((v) => parseFloat(v));

    // 앞에 있는 퍼센트 값과 비교
    for (const percentMatch of percentMatches) {
      if (percentMatch.index < decimalMatch.index) {
        const percentValues = percentMatch.value.split("/").map((v) => parseFloat(v));

        // 같은 값인지 확인 (퍼센트 값을 100으로 나눈 값과 소수점 값 비교)
        if (
          percentValues.length === decimalValues.length &&
          percentValues.length > 0
        ) {
          const isSame = percentValues.every((pv, idx) => {
            if (idx >= decimalValues.length) return false;
            const expectedDecimal = pv / 100;
            return Math.abs(expectedDecimal - decimalValues[idx]) < 0.01;
          });

          if (isSame) {
            // 소수점 패턴 제거
            const before = result.substring(0, decimalMatch.index);
            const after = result.substring(decimalMatch.index + decimalMatch.value.length);
            result = (before + after).replace(/\s+/g, " ").trim();
            break; // 하나만 제거하고 다음으로
          }
        }
      }
    }
  }

  return result;
}

