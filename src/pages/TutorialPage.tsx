import React, { useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TutorialContent } from "@/components/features/TutorialContent";

const TUTORIAL_COMPLETED_KEY = "tutorial_completed";

function TutorialPage() {
  const navigate = useNavigate();
  const touchHandledRef = useRef(false);

  const handleComplete = useCallback(() => {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, "true");
    navigate("/");
  }, [navigate]);

  // 터치 이벤트 직접 처리 (모바일 터치 지연 문제 해결)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    touchHandledRef.current = true;
    handleComplete();
    // 짧은 딜레이 후 플래그 리셋
    setTimeout(() => {
      touchHandledRef.current = false;
    }, 300);
  }, [handleComplete]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // 터치 이벤트로 이미 처리된 경우 클릭 이벤트 무시
    if (touchHandledRef.current) {
      touchHandledRef.current = false;
      return;
    }
    handleComplete();
  }, [handleComplete]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full space-y-8">
        {/* 헤더 */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">
            사용 방법 안내
          </h1>
          <p className="text-sm text-muted-foreground">
            모바일에서 스킬 정보를 확인하는 방법을 알려드립니다
          </p>
        </div>

        {/* 튜토리얼 내용 */}
        <TutorialContent />

        {/* 시작하기 버튼 */}
        <div className="pt-4 pb-4">
          <Button
            onClick={handleClick}
            onTouchStart={handleTouchStart}
            className="w-full h-12 text-base font-semibold relative z-10"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
            size="lg"
          >
            시작하기
          </Button>
        </div>
      </div>
    </div>
  );
}

// 튜토리얼 완료 여부 확인 함수
export function isTutorialCompleted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === "true";
}

export default TutorialPage;

