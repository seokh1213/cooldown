import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TutorialContent } from "@/components/features/TutorialContent";

const TUTORIAL_COMPLETED_KEY = "tutorial_completed";

function TutorialPage() {
  const navigate = useNavigate();

  const handleComplete = () => {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, "true");
    navigate("/");
  };

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
        <div className="pt-4">
          <Button
            onClick={handleComplete}
            className="w-full h-12 text-base font-semibold"
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

