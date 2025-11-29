import React from "react";
import { ChampionSpell } from "@/types";
import { parseSpellTooltip, formatLeveltipStats } from "@/lib/spellTooltipParser";
import { SKILL_ICON_URL, PASSIVE_ICON_URL } from "@/services/api";
import { SpellData } from "@/services/spellDataService";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import { SKILL_LETTERS } from "./constants";
import { getCooldownText, getCostText } from "./utils";
import { useDeviceType } from "@/hooks/useDeviceType";

interface SkillTooltipProps {
  skill: ChampionSpell;
  skillIdx: number;
  version: string;
  spellData?: SpellData | null;
  isPassive?: boolean;
  passiveName?: string;
  passiveDescription?: string;
  passiveImageFull?: string;
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
}: SkillTooltipProps) {
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  const [open, setOpen] = React.useState(false);

  // 외부 클릭 감지로 툴팁 닫기
  const triggerRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    if (!isMobile || !open) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      // 툴팁 트리거나 툴팁 콘텐츠 내부 클릭은 무시
      if (
        triggerRef.current?.contains(target) ||
        target.closest('[role="tooltip"]') ||
        target.closest('[data-radix-portal]')
      ) {
        return;
      }
      setOpen(false);
    };

    // 약간의 지연을 두어 현재 클릭 이벤트가 처리되도록 함
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside, true);
      document.addEventListener("touchstart", handleClickOutside, true);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("touchstart", handleClickOutside, true);
    };
  }, [isMobile, open]);

  if (isPassive && passiveImageFull) {
    return (
      <Tooltip open={isMobile ? open : undefined} onOpenChange={isMobile ? setOpen : undefined}>
        <TooltipTrigger asChild>
          <div 
            ref={triggerRef}
            className="flex flex-col items-center gap-0.5 cursor-help p-1 -m-1 touch-manipulation"
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
            <img
              src={PASSIVE_ICON_URL(version, passiveImageFull)}
              alt="Passive"
              className="w-8 h-8 rounded"
            />
            <span className="text-[9px] font-semibold">P</span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side={isMobile ? "bottom" : "top"}
          align="center"
          sideOffset={isMobile ? 12 : 8}
          className={isMobile ? "max-w-[calc(100vw-32px)] max-h-[70vh] overflow-y-auto p-3 space-y-2" : "max-w-xs p-3 space-y-2"}
          onPointerDownOutside={(e) => {
            if (isMobile) {
              e.preventDefault();
            }
          }}
        >
          {passiveName && (
            <div className="font-semibold text-sm">{passiveName}</div>
          )}
          {passiveDescription && (
            <div className="text-xs leading-relaxed">
              <div
                dangerouslySetInnerHTML={{
                  __html: parseSpellTooltip(passiveDescription, undefined, 1, true),
                }}
              />
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  const cooldownText = getCooldownText(skill, spellData);
  const costText = getCostText(skill);

  return (
    <Tooltip open={isMobile ? open : undefined} onOpenChange={isMobile ? setOpen : undefined}>
      <TooltipTrigger asChild>
        <div 
          ref={triggerRef}
          className="flex flex-col items-center gap-0.5 cursor-help p-1 -m-1 touch-manipulation"
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
          <img
            src={SKILL_ICON_URL(version, skill.id)}
            alt={SKILL_LETTERS[skillIdx]}
            className="w-8 h-8 rounded"
          />
          <span className="text-[9px] font-semibold">
            {SKILL_LETTERS[skillIdx]}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side={isMobile ? "bottom" : "top"}
        align="center"
        sideOffset={isMobile ? 12 : 8}
        className={isMobile ? "max-w-[calc(100vw-32px)] max-h-[70vh] overflow-y-auto p-4 space-y-3" : "max-w-sm p-4 space-y-3"}
        onPointerDownOutside={(e) => {
          if (isMobile) {
            e.preventDefault();
          }
        }}
      >
        {/* 헤더: 아이콘 + 스킬명 + 쿨타임/마나 */}
        <div className="flex items-start gap-3 border-b pb-3">
          {/* 왼쪽: 아이콘 */}
          <img
            src={SKILL_ICON_URL(version, skill.id)}
            alt={SKILL_LETTERS[skillIdx]}
            className="w-12 h-12 rounded flex-shrink-0"
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
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {cooldownText}
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
                  1,
                  true,
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
                  1,
                  true,
                  spellData?.communityDragonData
                ),
              }}
            />
          </div>
        )}

        {/* 레벨별 통계 */}
        {spellData && formatLeveltipStats(skill, spellData.communityDragonData) && (
          <div className="text-xs leading-relaxed border-t pt-3 mt-3">
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
      </TooltipContent>
    </Tooltip>
  );
}

