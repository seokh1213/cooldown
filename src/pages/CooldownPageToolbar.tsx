import { Swords, RotateCcw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { ViewTabs } from "@/components/ui/viewTabs";
import type { CooldownViewTab } from "./useCooldownViewTab";

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
            { value: "skills", label: t.encyclopedia.tabs.skills },
            { value: "stats", label: t.encyclopedia.tabs.stats },
          ]}
        />
        <div className="flex shrink-0 items-center gap-1">
          {props.onCompare && (
            <Button variant="ghost" size="sm" onClick={props.onCompare} className="flex items-center gap-1.5 text-primary hover:bg-primary/10 hover:text-primary">
              <Swords aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="text-[10px]">{t.comparison.open}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={props.onReset}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-primary hover:bg-muted/30 border-0"
          >
            <RotateCcw aria-hidden="true" className="h-3 w-3" />
            <span className="text-[10px]">{t.encyclopedia.reset}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
