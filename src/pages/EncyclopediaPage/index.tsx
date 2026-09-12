import { useSearchParams } from "react-router-dom";
import { EncyclopediaPageProps } from "./types";
import { TabNavigation, EncyclopediaTab } from "./TabNavigation";
import { RunesTab } from "./RunesTab";
import { ItemsTab } from "./ItemsTab";
import { SummonerTab } from "./SummonerTab";
import { FormulasTab } from "./FormulasTab";
import { ChampionsTab } from "./ChampionsTab";

function isValidTab(tab: string | null): tab is EncyclopediaTab {
  return (
    tab === "champions" ||
    tab === "runes" ||
    tab === "items" ||
    tab === "summoner" ||
    tab === "formulas"
  );
}

function EncyclopediaPageContent({
  lang,
  patchVersion,
  ddragonVersion,
  sources,
  championList,
}: EncyclopediaPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: EncyclopediaTab = isValidTab(requestedTab)
    ? requestedTab
    : "champions";

  const selectTab = (tab: EncyclopediaTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "champions") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pb-4 md:pb-5">
      {/* Tab navigation for encyclopedia sections */}
      <div className="mt-3 md:mt-4">
        <TabNavigation
          activeTab={activeTab}
          onTabChange={selectTab}
        />
      </div>

      {activeTab === "champions" && (
        <ChampionsTab championList={championList} patchVersion={patchVersion} sources={sources} lang={lang} ddragonVersion={ddragonVersion} />
      )}
      {activeTab === "runes" && (
        <RunesTab patchVersion={patchVersion} sources={sources} lang={lang} />
      )}
      {activeTab === "items" && (
        <ItemsTab patchVersion={patchVersion} sources={sources} ddragonVersion={ddragonVersion} lang={lang} />
      )}
      {activeTab === "summoner" && (
        <SummonerTab patchVersion={patchVersion} sources={sources} ddragonVersion={ddragonVersion} lang={lang} />
      )}
      {activeTab === "formulas" && <FormulasTab />}
    </div>
  );
}

export default function EncyclopediaPage(props: EncyclopediaPageProps) {
  return <EncyclopediaPageContent {...props} />;
}
