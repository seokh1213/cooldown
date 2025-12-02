import React from "react";
import { ChampionSpell } from "@/types";
import { parseSpellTooltip, formatLeveltipStats } from "@/lib/spellTooltipParser";
import { SKILL_ICON_URL, PASSIVE_ICON_URL } from "@/services/api";
import { SpellData } from "@/services/spellDataService";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle } from "lucide-react";
import { SKILL_LETTERS } from "./constants";
import { getCooldownText, getCostText } from "./utils";
import { useDeviceType } from "@/hooks/useDeviceType";
import { useTranslation } from "@/i18n";

interface SkillTooltipProps {
  skill: ChampionSpell;
  skillIdx: number;
  version: string;
  spellData?: SpellData | null;
  isPassive?: boolean;
  passiveName?: string;
  passiveDescription?: string;
  passiveImageFull?: string;
  size?: "default" | "small";
}

export function SkillTooltip({
  skill,
  skillIdx,
  version,
  spellData,
  isPassive,
  passiveName,
  passiveDescription,
  passiveImageFull,
  size = "default",
}: SkillTooltipProps) {
  const { t } = useTranslation();
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  
  // passive 스킬이 아닐 때만 cooldown/cost 텍스트 계산
  const cooldownText = (isPassive && passiveImageFull) ? null : getCooldownText(skill, spellData);
  const costText = (isPassive && passiveImageFull) ? null : getCostText(skill, spellData);

  const isSmall = size === "small";
  const iconSize = isSmall ? "min-w-6 min-h-6 w-6 h-6" : "min-w-8 min-h-8 w-8 h-8";
  const textSize = isSmall ? "text-[8px]" : "text-[9px]";

  // 공통 트리거 컴포넌트
  const triggerButton = (
    <div 
      ref={triggerRef}
      className={`flex flex-col items-center gap-0.5 p-1 -m-1 touch-manipulation ${isMobile ? "cursor-pointer" : "cursor-help"}`}
      onClick={(e) => {
        if (isMobile) {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }
      }}
      onTouchStart={(e) => {
        if (isMobile) {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }
      }}
    >
      {isPassive && passiveImageFull ? (
        <>
          <img
            src={PASSIVE_ICON_URL(version, passiveImageFull)}
            alt="Passive"
            className={cn(iconSize, "rounded")}
          />
          <span className={cn(textSize, "font-semibold")}>P</span>
        </>
      ) : (
        <>
          <img
            src={SKILL_ICON_URL(version, skill.id)}
            alt={SKILL_LETTERS[skillIdx]}
            className={cn(iconSize, "rounded")}
          />
          <span className={cn(textSize, "font-semibold")}>
            {SKILL_LETTERS[skillIdx]}
          </span>
        </>
      )}
    </div>
  );

  // 공통 콘텐츠 컴포넌트
  const renderContent = () => {
    if (isPassive && passiveImageFull) {
      return (
        <>
          {passiveName && (
            <div className={`font-semibold text-sm ${isMobile ? "pr-10" : ""}`}>{passiveName}</div>
          )}
          {passiveDescription && (
            <div className="text-xs leading-relaxed">
              <div
                dangerouslySetInnerHTML={{
                  __html: parseSpellTooltip(passiveDescription, undefined ),
                }}
              />
            </div>
          )}
        </>
      );
    }

    return (
      <>
        {/* 헤더: 아이콘 + 스킬명 + 쿨타임/마나 */}
        <div className={`flex items-start gap-3 border-b pb-3 ${isMobile ? "pr-10" : ""}`}>
          {/* 왼쪽: 아이콘 */}
          <img
            src={SKILL_ICON_URL(version, skill.id)}
            alt={SKILL_LETTERS[skillIdx]}
            className="w-12 h-12 min-w-12 min-h-12 rounded flex-shrink-0"
          />
          {/* 중앙: 스킬명 */}
          <div className="flex-1 min-w-0">
            {skill.name && (
              <div className="font-semibold text-sm">
                [{SKILL_LETTERS[skillIdx]}] {skill.name}
              </div>
            )}
          </div>
          {/* 오른쪽: 쿨타임/마나 */}
          <div className="text-right flex-shrink-0">
            {cooldownText && (
              <div className="text-xs text-muted-foreground">
                {cooldownText.includes(" (") ? (
                  <>
                    {cooldownText.split(" (")[0]}
                    <br />
                    ({cooldownText.split(" (")[1]}
                  </>
                ) : (
                  cooldownText
                )}
              </div>
            )}
            {costText && (
              <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                {costText}
              </div>
            )}
          </div>
        </div>

        {/* 메인 설명 */}
        {skill.description && (
          <div className="text-xs leading-relaxed">
            <div
              dangerouslySetInnerHTML={{
                __html: parseSpellTooltip(
                  skill.description,
                  skill,
                  spellData?.communityDragonData
                ),
              }}
            />
          </div>
        )}
        {skill.tooltip && (
          <div className="text-xs text-muted-foreground leading-relaxed">
            <div
              dangerouslySetInnerHTML={{
                __html: parseSpellTooltip(
                  skill.tooltip,
                  skill,
                  spellData?.communityDragonData
                ),
              }}
            />
          </div>
        )}

        {/* 레벨별 통계 - 본문보다 덜 강조 (약간 흐린 색상) */}
        {spellData && formatLeveltipStats(skill, spellData.communityDragonData) && (
          <div className="text-[11px] leading-relaxed text-muted-foreground border-t pt-3 mt-3">
            <div
              dangerouslySetInnerHTML={{
                __html: formatLeveltipStats(skill, spellData.communityDragonData),
              }}
            />
          </div>
        )}

        {/* 경고 문구 */}
        <div className="text-xs text-muted-foreground leading-relaxed border-t pt-3 mt-3 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
          <span>정확한 수치와 설명은 인게임 툴팁을 확인해 주세요.</span>
        </div>
      </>
    );
  };

  // 모바일: Dialog 사용
  if (isMobile) {
    return (
      <>
        {triggerButton}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="w-[calc(100vw-32px)] max-w-lg h-[70vh] max-h-[70vh] p-0 rounded-xl overflow-hidden flex flex-col"
          >
            <VisuallyHidden>
              <DialogTitle>
                {isPassive && passiveImageFull 
                  ? `${passiveName || t.skillTooltip.passive} ${t.skillTooltip.skillInfo}`
                  : `[${SKILL_LETTERS[skillIdx]}] ${skill.name || t.skillTooltip.skill} ${t.skillTooltip.skillInfo}`}
              </DialogTitle>
              <DialogDescription>
                {isPassive && passiveImageFull 
                  ? `${passiveName || t.skillTooltip.passive} ${t.skillTooltip.skillDescription}`
                  : `[${SKILL_LETTERS[skillIdx]}] ${skill.name || t.skillTooltip.skill} ${t.skillTooltip.skillDescription}`}
              </DialogDescription>
            </VisuallyHidden>
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 flex flex-col gap-3">
                {renderContent()}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // 데스크톱: Tooltip 사용
  if (isPassive && passiveImageFull) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {triggerButton}
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          sideOffset={8}
          className="max-w-xs p-3 space-y-2"
        >
          {renderContent()}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {triggerButton}
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        sideOffset={8}
        className="max-w-sm p-4 space-y-3"
      >
        {renderContent()}
      </TooltipContent>
    </Tooltip>
  );
}

