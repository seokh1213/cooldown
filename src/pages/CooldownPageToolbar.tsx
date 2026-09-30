import { Swords, RotateCcw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/components/ui/viewTabs";
import type { CooldownViewTab } from "./useCooldownViewTab";

const TOOL_BUTTON_CLASS = "flex items-center gap-1.5 size-11 px-0 sm:h-9 sm:w-auto sm:px-3";
const TOOL_LABEL_CLASS = "sr-only text-[10px] sm:not-sr-only";

export function CooldownPageToolbar(props: {
  activeTab: CooldownViewTab;
  onSelectTab: (tab: CooldownViewTab) => void;
  onReset: () => void;
  onCompare?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 md:mt-4">
      <div className="flex items-center justify-between gap-2 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        <ViewTabs
          className="flex-1 justify-start"
          label={t.encyclopedia.champion}
          value={props.activeTab}
          onChange={props.onSelectTab}
          items={[
            { value: "skills", label: t.encyclopedia.tabs.skills, shortLabel: t.encyclopedia.tabsShort.skills },
            { value: "stats", label: t.encyclopedia.tabs.stats, shortLabel: t.encyclopedia.tabsShort.stats },
          ]}
        />
        {/* 좁은 화면은 아이콘만 둔다. 글씨까지 두면 탭 이름이 한 글자씩 꺾인다. 이름은 화면 낭독기에 남긴다. */}
        <div className="flex shrink-0 items-center gap-1">
          {props.onCompare && (
            <Button variant="ghost" size="sm" onClick={props.onCompare} className={cn(TOOL_BUTTON_CLASS, "text-primary hover:bg-primary/10 hover:text-primary")}>
              <Swords aria-hidden="true" className="h-3.5 w-3.5" />
              <span className={TOOL_LABEL_CLASS}>{t.comparison.open}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onReset}
            className={cn(TOOL_BUTTON_CLASS, "text-muted-foreground hover:text-primary hover:bg-muted/30 border-0")}
          >
            <RotateCcw aria-hidden="true" className="h-3 w-3" />
            <span className={TOOL_LABEL_CLASS}>{t.encyclopedia.reset}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
