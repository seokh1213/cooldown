import { ViewTabs } from "@/components/ui/viewTabs";
import { useTranslation } from "@/i18n";

export type EncyclopediaTab = "champions" | "runes" | "items" | "summoner" | "formulas";

interface TabNavigationProps {
  activeTab: EncyclopediaTab;
  onTabChange: (value: EncyclopediaTab) => void;
}

export function TabNavigation({
  activeTab,
  onTabChange,
}: TabNavigationProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
      <ViewTabs
        className="flex-1 justify-start"
        label={t.sidebar.encyclopedia}
        value={activeTab}
        onChange={onTabChange}
        items={[
          { value: "champions", label: t.championProfile.tab },
          { value: "runes", label: t.encyclopedia.tabs.runes },
          { value: "items", label: t.encyclopedia.tabs.items },
          { value: "summoner", label: t.encyclopedia.tabs.summoner },
          { value: "formulas", label: t.encyclopedia.tabs.formulas },
        ]}
      />
    </div>
  );
}
