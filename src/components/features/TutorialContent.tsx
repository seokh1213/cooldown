import React from "react";
import { Hand, MousePointerClick, Swords } from "lucide-react";
import { useTranslation } from "@/i18n";

export function TutorialContent() {
  const { t } = useTranslation();
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
              {t.tutorial.skillIcon.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.tutorial.skillIcon.description}
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
              <div className="text-xs font-semibold mb-1">{t.tutorial.skillIcon.skillInfo}</div>
              <div className="text-xs text-muted-foreground">
                {t.tutorial.skillIcon.skillDetails}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VS 모드 안내 */}
      <div className="bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
            <Swords className="w-6 h-6 text-destructive" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold text-foreground mb-1">
              {t.tutorial.vsMode.title}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t.tutorial.vsMode.description}
            </p>
          </div>
        </div>

        {/* 시각적 예시 */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground">
                <div className="w-5 h-5 rounded-full bg-background/20 flex items-center justify-center text-[10px] font-semibold">
                  A
                </div>
                <span className="text-xs font-medium">갈리오</span>
                <button className="ml-1 p-1 rounded-full hover:bg-primary/20 transition-colors">
                  <Swords className="h-3 w-3" />
                </button>
              </div>
              <div className="text-muted-foreground text-sm">→</div>
              <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                <div className="text-xs font-semibold mb-1">{t.tutorial.vsMode.vsModeLabel}</div>
                <div className="text-xs text-muted-foreground">
                  {t.tutorial.vsMode.comparisonDescription}
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground text-center">
              {t.tutorial.vsMode.vsButtonHint}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

