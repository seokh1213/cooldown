import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "@/i18n";

interface TabNavigationProps {
  activeTab: "stats" | "skills";
  onTabChange: (value: "stats" | "skills") => void;
  onReset: () => void;
}

export function TabNavigation({ activeTab, onTabChange, onReset }: TabNavigationProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <Tabs
        value={activeTab}
        onValueChange={(value) => onTabChange(value as "stats" | "skills")}
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
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="flex items-center gap-1.5 shrink-0 text-muted-foreground hover:text-primary hover:bg-muted/30 border-0"
        >
          <RotateCcw className="h-3 w-3" />
          <span className="text-[10px]">{t.encyclopedia.reset}</span>
        </Button>
      </div>
    </div>
  );
}

