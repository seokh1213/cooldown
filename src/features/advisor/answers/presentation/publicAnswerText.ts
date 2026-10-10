/** 새 답변과 저장된 답변 모두 화면·복사에서 외부 출처 문구를 제외한다. */
export function publicAnswerText(text: string): string {
  return text.split("\n").filter(line => !/^\s*(?:\[(?:참고 자료|Reference|参考资料|출처)(?=\s|\d|\])|공식 롤 위키 기준|From the official League of Legends Wiki|来源：英雄联盟官方 Wiki|_v[\d.]+ · 위키 판정 규칙)/i.test(line))
    .join("\n")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/https?:\/\/[^\s<>]+/g, "")
    .replace(/\n{3,}/g, "\n\n").trim();
}
