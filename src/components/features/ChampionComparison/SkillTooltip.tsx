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
  const { t, lang } = useTranslation();
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  const [open, setOpen] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const closeTimeoutRef = React.useRef<number | null>(null);
  const [desktopSide, setDesktopSide] = React.useState<"top" | "bottom">("bottom");
  const [desktopMaxHeight, setDesktopMaxHeight] = React.useState<number | undefined>(
    undefined
  );
  
  const cooldownText = (isPassive && passiveImageFull)
    ? null
    : getCooldownText(skill, spellData, lang);
  const costText = (isPassive && passiveImageFull)
    ? null
    : getCostText(skill, spellData, lang);

  const isSmall = size === "small";
  const iconSize = isSmall ? "min-w-6 min-h-6 w-6 h-6" : "min-w-8 min-h-8 w-8 h-8";
  const textSize = isSmall ? "text-[8px]" : "text-[9px]";

  const openTooltip = React.useCallback(() => {
    if (isMobile) return;
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setTooltipOpen(true);
  }, [isMobile]);

  const scheduleCloseTooltip = React.useCallback(() => {
    if (isMobile) return;
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setTooltipOpen(false);
      closeTimeoutRef.current = null;
    }, 40);
  }, [isMobile]);

  React.useEffect(() => {
    if (isMobile || !tooltipOpen) {
      setDesktopMaxHeight(undefined);
      return;
    }
    const el = triggerRef.current;
    if (!el) return;

    const updateMaxHeight = () => {
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const margin = 16;
      const buffer = 8;

      const spaceTop = rect.top - margin;
      const spaceBottom = viewportHeight - rect.bottom - margin;

      if (spaceTop <= 0 && spaceBottom <= 0) {
        setDesktopMaxHeight(undefined);
        return;
      }

      if (spaceBottom >= spaceTop) {
        setDesktopSide("bottom");
        const available = Math.max(spaceBottom - buffer, 0);
        setDesktopMaxHeight(available || undefined);
      } else {
        setDesktopSide("top");
        const available = Math.max(spaceTop - buffer, 0);
        setDesktopMaxHeight(available || undefined);
      }
    };

    updateMaxHeight();
    window.addEventListener("resize", updateMaxHeight);
    window.addEventListener("scroll", updateMaxHeight, true);
    return () => {
      window.removeEventListener("resize", updateMaxHeight);
      window.removeEventListener("scroll", updateMaxHeight, true);
    };
  }, [isMobile, tooltipOpen]);

  React.useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

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
      onPointerEnter={() => {
        if (!isMobile) {
          openTooltip();
        }
      }}
      onPointerLeave={() => {
        if (!isMobile) {
          scheduleCloseTooltip();
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
                  __html: parseSpellTooltip(passiveDescription, undefined, undefined, lang),
                }}
              />
            </div>
          )}
          {/* 경고 문구 */}
          <div className="text-xs text-muted-foreground leading-relaxed border-t pt-3 mt-3 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
            <span>{t.skillTooltip.warningPassive}</span>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="flex items-start gap-3 border-b pb-3 pr-6">
          <img
            src={SKILL_ICON_URL(version, skill.id)}
            alt={SKILL_LETTERS[skillIdx]}
            className="w-12 h-12 min-w-12 min-h-12 rounded flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            {skill.name && (
              <div className="font-semibold text-sm">
                [{SKILL_LETTERS[skillIdx]}] {skill.name}
              </div>
            )}
          </div>
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

        {skill.description && (
          <div className="text-xs leading-relaxed">
            <div
              dangerouslySetInnerHTML={{
                __html: parseSpellTooltip(
                  skill.description,
                  skill,
                  spellData?.communityDragonData,
                  lang
                ).replace(/<br\s*\/?>/gi, " "),
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
                  spellData?.communityDragonData,
                  lang
                ),
              }}
            />
          </div>
        )}

        {spellData && formatLeveltipStats(skill, spellData.communityDragonData, lang) && (
          <div className="text-[11px] leading-relaxed text-muted-foreground border-t pt-3 mt-3">
            <div
              dangerouslySetInnerHTML={{
                __html: formatLeveltipStats(skill, spellData.communityDragonData, lang),
              }}
            />
          </div>
        )}

        <div className="text-xs text-muted-foreground leading-relaxed border-t pt-3 mt-3 flex items-start gap-1.5">
          <AlertTriangle className="w-3 h-3 mt-0.5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
          <span>{t.skillTooltip.warningSkill}</span>
        </div>
      </>
    );
  };
  
  const skillDialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className={cn(
          isMobile
            ? "w-[calc(100vw-32px)] max-w-lg h-[70vh] max-h-[70vh]"
            : "w-full max-w-3xl h-[80vh] max-h-[80vh]",
          "p-0 rounded-xl overflow-hidden flex flex-col"
        )}
      >
        <VisuallyHidden>
          <DialogTitle>
            {isPassive && passiveImageFull
              ? `${passiveName || t.skillTooltip.passive} ${
                  t.skillTooltip.skillInfo
                }`
              : `[${SKILL_LETTERS[skillIdx]}] ${
                  skill.name || t.skillTooltip.skill
                } ${t.skillTooltip.skillInfo}`}
          </DialogTitle>
          <DialogDescription>
            {isPassive && passiveImageFull
              ? `${passiveName || t.skillTooltip.passive} ${
                  t.skillTooltip.skillDescription
                }`
              : `[${SKILL_LETTERS[skillIdx]}] ${
                  skill.name || t.skillTooltip.skill
                } ${t.skillTooltip.skillDescription}`}
          </DialogDescription>
        </VisuallyHidden>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 flex flex-col gap-3">
            {renderContent()}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );

  if (isMobile) {
    return (
      <>
        {triggerButton}
        {skillDialog}
      </>
    );
  }

  const tooltipInner = (
    <div className="space-y-3">
      {renderContent()}
      <div className="pt-1 flex justify-end">
        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setTooltipOpen(false);
            setOpen(true);
          }}
        >
          {t.skillTooltip.viewDetail}
        </button>
      </div>
    </div>
  );

  if (isPassive && passiveImageFull) {
    return (
      <>
        {/* open 상태를 우리가 직접 제어해서 Radix의 grace area 영향을 최소화 */}
        <Tooltip open={tooltipOpen}>
          <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
          <TooltipContent
            side={desktopSide}
            align="center"
            // 아이콘과 툴팁 사이의 세로 간격을 거의 없앰 (0으로 설정)
            sideOffset={0}
            className="max-w-xs p-3 space-y-2"
            style={
              !isMobile && desktopMaxHeight
                ? { maxHeight: desktopMaxHeight }
                : undefined
            }
            onPointerEnter={openTooltip}
            onPointerLeave={scheduleCloseTooltip}
          >
            {tooltipInner}
          </TooltipContent>
        </Tooltip>
        {skillDialog}
      </>
    );
  }

  return (
    <>
      {/* open 상태를 우리가 직접 제어해서 Radix의 grace area 영향을 최소화 */}
      <Tooltip open={tooltipOpen}>
        <TooltipTrigger asChild>{triggerButton}</TooltipTrigger>
        <TooltipContent
          side={desktopSide}
          align="center"
          // 아이콘과 툴팁 사이의 세로 간격을 거의 없앰 (0으로 설정)
          sideOffset={0}
          className="max-w-sm p-4 space-y-3"
          style={
            !isMobile && desktopMaxHeight
              ? { maxHeight: desktopMaxHeight }
              : undefined
          }
          onPointerEnter={openTooltip}
          onPointerLeave={scheduleCloseTooltip}
        >
          {tooltipInner}
        </TooltipContent>
      </Tooltip>
      {skillDialog}
    </>
  );
}

