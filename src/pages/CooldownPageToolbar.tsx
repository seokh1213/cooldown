import { Calculator, RotateCcw } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CooldownViewTab } from "./useCooldownViewTab";

export function CooldownPageToolbar(props: {
  activeTab: CooldownViewTab;
  onSelectTab: (tab: CooldownViewTab) => void;
  onReset: () => void;
  onSimulate?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-3 md:mt-4">
      <div className="flex items-center justify-between gap-2 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
        <Tabs
          value={props.activeTab}
          onValueChange={(value) => props.onSelectTab(value as CooldownViewTab)}
          className="flex-1"
        >
          <TabsList className="inline-flex h-auto items-center justify-start gap-2 bg-transparent p-0 border-0">
            <TabsTrigger
              value="skills"
              className="px-4 py-2 text-sm font-medium transition-colors border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none shadow-none"
            >
              {t.encyclopedia.tabs.skills}
            </TabsTrigger>
            <TabsTrigger
              value="stats"
              className="px-4 py-2 text-sm font-medium transition-colors border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none shadow-none"
            >
              {t.encyclopedia.tabs.stats}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex shrink-0 items-center gap-1">
          {props.onSimulate && (
            <Button variant="ghost" size="sm" onClick={props.onSimulate} className="flex items-center gap-1.5 text-primary hover:bg-primary/10">
              <Calculator aria-hidden="true" className="h-3.5 w-3.5" />
              <span className="text-[10px]">{t.pages.simulation.useInSimulation}</span>
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
