/**
 * 탭 ID 생성 헬퍼 함수
 */
export const generateTabId = (): string => {
  return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

