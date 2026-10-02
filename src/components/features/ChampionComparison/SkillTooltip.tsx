import React from "react";
import type { ChampionPassive, ChampionSpell } from "@/types";
import {
  passiveIconUrl,
  spellIconUrl,
} from "@/data/assets/riotAssetUrls";
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
import { SKILL_LETTERS } from "./constants";
import { SkillTooltipContent } from "./SkillTooltipContent";
import { AbilityFormIcon } from "./AbilityFormIcon";
import { getCooldownText, getCostText } from "./utils";
import { useDeviceType } from "@/hooks/useDeviceType";
import { useTranslation } from "@/i18n";

const ACTIVE_SKILL_TOOLTIP_EVENT = "cooldown:active-skill-tooltip";

interface SkillTooltipProps {
  skill?: ChampionSpell;
  skillIdx: number;
  /** 정적 데이터 경로/캐시 키로 쓰는 Riot 공식 패치 버전 */
  patchVersion: string;
  /** Data Dragon CDN 요청용 내부 버전 */
  ddragonVersion: string;
  passive?: ChampionPassive;
  children?: React.ReactNode;
  triggerClassName?: string;
  headerIcon?: React.ReactNode;
}

export function SkillTooltip({
  skill,
  skillIdx,
  patchVersion,
  ddragonVersion,
  passive,
  children,
  triggerClassName,
  headerIcon,
}: SkillTooltipProps) {
  const { t, lang } = useTranslation();
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";
  const [open, setOpen] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const closeTimeoutRef = React.useRef<number | null>(null);
  const hoverSuppressedRef = React.useRef(false);
  const tooltipId = React.useId();
  const [desktopSide, setDesktopSide] = React.useState<"top" | "bottom">("bottom");
  const [desktopMaxHeight, setDesktopMaxHeight] = React.useState<number | undefined>(
    undefined
  );
  
  const cooldownText = skill ? getCooldownText(skill, lang) : null;
  const costText = skill ? getCostText(skill, lang) : null;

  const iconSize = "min-w-8 min-h-8 w-8 h-8";

  const openTooltip = React.useCallback(() => {
    if (isMobile || open || hoverSuppressedRef.current) return;
    // 다른 스킬 툴팁들은 모두 닫고 현재 것만 열리도록 글로벌 이벤트 전파
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(ACTIVE_SKILL_TOOLTIP_EVENT, {
          detail: tooltipId,
        })
      );
    }
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setTooltipOpen(true);
  }, [isMobile, open, tooltipId]);

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

  const openDialog = () => {
    hoverSuppressedRef.current = true;
    window.dispatchEvent(new CustomEvent(ACTIVE_SKILL_TOOLTIP_EVENT, { detail: tooltipId }));
    setTooltipOpen(false);
    setOpen(true);
  };

  React.useEffect(() => {
    if (isMobile || !tooltipOpen) {
      if (isMobile) {
        hoverSuppressedRef.current = true;
        setTooltipOpen(false);
      }
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
    if (typeof window === "undefined") return;

    const handleActiveChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      const activeId = customEvent.detail;
      if (activeId !== tooltipId) {
        if (closeTimeoutRef.current !== null) {
          window.clearTimeout(closeTimeoutRef.current);
          closeTimeoutRef.current = null;
        }
        setTooltipOpen(false);
      }
    };

    window.addEventListener(
      ACTIVE_SKILL_TOOLTIP_EVENT,
      handleActiveChange as EventListener
    );

    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
      window.removeEventListener(
        ACTIVE_SKILL_TOOLTIP_EVENT,
        handleActiveChange as EventListener
      );
    };
  }, [tooltipId]);

  const triggerButton = (
    <button
      type="button"
      aria-label={passive ? passive.name : SKILL_LETTERS[skillIdx] + " " + (skill?.name ?? "")}
      ref={triggerRef}
      className={cn(`flex flex-col items-center gap-0.5 p-1 -m-1 touch-manipulation ${isMobile ? "cursor-pointer" : "cursor-help"}`, triggerClassName)}
      data-skill-trigger
      data-skill-patch={patchVersion}
      onClick={(e) => {
        e.stopPropagation();
        openDialog();
      }}
      onPointerEnter={(event) => {
        if (!isMobile && event.pointerType !== "touch") {
          openTooltip();
        }
      }}
      onPointerMove={(event) => {
        if (!isMobile && !open && event.pointerType !== "touch" && hoverSuppressedRef.current) {
          hoverSuppressedRef.current = false;
          openTooltip();
        }
      }}
      onPointerLeave={() => {
        if (!isMobile) {
          hoverSuppressedRef.current = false;
          scheduleCloseTooltip();
        }
      }}
    >
      {children ?? (passive ? (
        <>
          <img
            src={passiveIconUrl(ddragonVersion, passive.image.full)}
            alt="Passive"
            className={cn(iconSize, "rounded")}
          />
          <span className="text-[9px] font-semibold">P</span>
        </>
      ) : skill ? (
        <>
          {skill.forms ? <AbilityFormIcon forms={skill.forms} label={SKILL_LETTERS[skillIdx]} ddragonVersion={ddragonVersion} className={iconSize} /> : <img
            src={spellIconUrl(ddragonVersion, skill.id)}
            alt={SKILL_LETTERS[skillIdx]}
            className={cn(iconSize, "rounded")}
          />}
          <span className="text-[9px] font-semibold">
            {SKILL_LETTERS[skillIdx]}
          </span>
        </>
      ) : null)}
    </button>
  );

  const content = (
    <SkillTooltipContent
      skill={skill}
      skillIdx={skillIdx}
      ddragonVersion={ddragonVersion}
      passive={passive}
      cooldownText={cooldownText}
      costText={costText}
      mobile={isMobile}
      headerIcon={headerIcon}
    />
  );
  
  const skillDialog = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // 포커스 복귀·오버레이 제거로 생기는 pointerenter는 실제 호버가 아니다.
          hoverSuppressedRef.current = true;
          triggerRef.current?.focus();
        }}
        className={cn(
          isMobile
            ? "w-[calc(100vw-32px)] max-w-lg h-[70vh] max-h-[70vh]"
            : "w-full max-w-3xl h-[80vh] max-h-[80vh]",
          "p-0 rounded-xl overflow-hidden flex flex-col"
        )}
      >
        <VisuallyHidden>
          <DialogTitle>
            {passive
              ? `${passive.name || t.skillTooltip.passive} ${
                  t.skillTooltip.skillInfo
                }`
              : `[${SKILL_LETTERS[skillIdx]}] ${
                  skill?.name || t.skillTooltip.skill
                } ${t.skillTooltip.skillInfo}`}
          </DialogTitle>
          <DialogDescription>
            {passive
              ? `${passive.name || t.skillTooltip.passive} ${
                  t.skillTooltip.skillDescription
                }`
              : `[${SKILL_LETTERS[skillIdx]}] ${
                  skill?.name || t.skillTooltip.skill
                } ${t.skillTooltip.skillDescription}`}
          </DialogDescription>
        </VisuallyHidden>
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 flex flex-col gap-3">
            {content}
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
      {content}
      <div className="pt-1 flex justify-end">
        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openDialog();
          }}
        >
          {t.skillTooltip.viewDetail}
        </button>
      </div>
    </div>
  );

  if (passive) {
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
            onEscapeKeyDown={() => setTooltipOpen(false)}
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
          onEscapeKeyDown={() => setTooltipOpen(false)}
        >
          {tooltipInner}
        </TooltipContent>
      </Tooltip>
      {skillDialog}
    </>
  );
}
