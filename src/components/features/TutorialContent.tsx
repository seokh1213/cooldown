import React from "react";
import { Hand, MousePointerClick } from "lucide-react";

export function TutorialContent() {
  return (
    <div className="space-y-6">
      {/* 스킬 아이콘 클릭 안내 */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <MousePointerClick className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground mb-1">
              스킬 아이콘을 탭하세요
            </h2>
            <p className="text-sm text-muted-foreground">
              챔피언 비교 화면에서 스킬 아이콘을 탭하면 상세한 스킬 정보가 담긴 툴팁이 표시됩니다.
            </p>
          </div>
        </div>

        {/* 시각적 예시 */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center justify-center gap-2 bg-muted/50 rounded-lg p-4">
            <div className="relative">
              <div className="w-12 h-12 rounded bg-primary/20 flex items-center justify-center border-2 border-primary/50">
                <span className="text-xs font-bold text-primary">Q</span>
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                <Hand className="w-2.5 h-2.5 text-primary-foreground" />
              </div>
            </div>
            <div className="text-muted-foreground text-sm">→</div>
            <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
              <div className="text-xs font-semibold mb-1">스킬 정보</div>
              <div className="text-xs text-muted-foreground">
                쿨타임, 마나 소모량 등
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

