/** 질문을 쓴 언어. 한글이 있으면 한국어, 한자만 있으면 중국어, 로마자만 있으면 영어. 가를 수 없으면 undefined. */
export function questionLanguage(question: string): "ko_KR" | "zh_CN" | "en_US" | undefined {
  if (/[가-힣]/.test(question)) return "ko_KR";
  if (/[\u4e00-\u9fff]/.test(question)) return "zh_CN";
  if (/[A-Za-z]{2,}/.test(question)) return "en_US";
  return undefined;
}
