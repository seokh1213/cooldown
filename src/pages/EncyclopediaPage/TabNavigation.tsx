import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "@/i18n";

type EncyclopediaTab = "runes" | "items";

interface TabNavigationProps {
  activeTab: EncyclopediaTab;
  onTabChange: (value: EncyclopediaTab) => void;
  onReset?: () => void;
}

export function TabNavigation({ activeTab, onTabChange, onReset }: TabNavigationProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as EncyclopediaTab)} className="flex-1">
        <TabsList className="inline-flex h-auto items-center justify-start gap-2 bg-transparent p-0 border-0">
          {/* Static encyclopedia tabs */}
          <div className="inline-flex items-center gap-2">
            <TabsTrigger
              value="runes"
              className="px-4 py-2 text-sm font-medium transition-colors border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none shadow-none"
            >
              {t.encyclopedia.tabs.runes}
            </TabsTrigger>
            <TabsTrigger
              value="items"
              className="px-4 py-2 text-sm font-medium transition-colors border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent rounded-none shadow-none"
            >
              {t.encyclopedia.tabs.items}
            </TabsTrigger>
          </div>
        </TabsList>
      </Tabs>
    </div>
  );
}

