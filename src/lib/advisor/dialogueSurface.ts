/** 표현 실험의 출력 검증. 확인된 짧은 호응 외에는 본문에 추가하지 않는다. */
const ACKNOWLEDGEMENTS = new Set([
  "좋아요.", "알겠어요.", "같이 볼게요.", "이어서 볼게요.", "그 부분부터 볼게요.",
  "말씀하신 조건으로 볼게요.", "정정한 조건으로 볼게요.", "그 질문도 같이 볼게요.",
  "네, 이어서 볼게요.", "그럼 하나씩 볼게요.", "바로 확인해볼게요.", "그 기준으로 볼게요.",
]);

export function acceptedSurface(raw: string): string | undefined {
  const text = raw.trim().replace(/^["'“]|["'”]$/g, "");
  return ACKNOWLEDGEMENTS.has(text) ? text : undefined;
}

export const SURFACE_SYSTEM = [
  "한국어 게임 도우미의 짧은 호응 한 문장만 쓰세요. 답의 사실 설명은 이미 준비되어 있습니다.",
  "챔피언, 스킬, 숫자, 판단, 조언은 쓰지 마세요. 질문에 답하거나 본문을 다시 쓰지 마세요.",
  "예: 좋아요. / 이어서 볼게요. / 그 부분부터 볼게요. / 정정한 조건으로 볼게요.",
  "메타 설명, 따옴표, 제목 없이 호응 한 문장만 출력하세요.",
].join("\n");
