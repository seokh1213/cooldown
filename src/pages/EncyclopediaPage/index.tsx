import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { EncyclopediaPageProps } from "./types";
import { TabNavigation } from "./TabNavigation";
import { RunesTab } from "./RunesTab";
import { ItemsTab } from "./ItemsTab";
import { VersionProvider } from "@/context/VersionContext";
import { useTranslation } from "@/i18n";


type EncyclopediaTab = "runes" | "items";

function isValidTab(tab: string | null): tab is EncyclopediaTab {
  return tab === "runes" || tab === "items";
}

function EncyclopediaPageContent({
  lang,
  championList,
  version,
  cdragonVersion: initialCDragonVersion,
  initialSelectedChampions,
  initialTabs,
  initialSelectedTabId,
}: EncyclopediaPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // URL에서 현재 탭 파라미터 읽기
  const urlTabParam = useMemo(() => {
    const tabParam = searchParams.get("tab");
    return isValidTab(tabParam) ? tabParam : null;
  }, [searchParams]);
  
  // URL 쿼리 파라미터에서 초기 탭 읽기
  const getInitialTab = (): EncyclopediaTab => {
    return urlTabParam || "runes";
  };
  
  const [activeTab, setActiveTab] = useState<EncyclopediaTab>(getInitialTab);
  const lastUrlTabRef = useRef<string | null>(urlTabParam);
  const lastActiveTabRef = useRef<EncyclopediaTab>(getInitialTab());
  
  // URL 파라미터 변경 시 activeTab 동기화 (브라우저 히스토리 네비게이션 대응)
  useEffect(() => {
    const urlTab = urlTabParam || "runes";
    const lastUrlTab = lastUrlTabRef.current || "runes";
    
    // URL이 실제로 변경되었을 때만 상태 업데이트 (우리가 설정한 변경이 아닌 경우)
    if (urlTab !== lastUrlTab && urlTab !== activeTab) {
      setActiveTab(urlTab);
      lastActiveTabRef.current = urlTab;
    }
    
    lastUrlTabRef.current = urlTabParam;
  }, [urlTabParam, activeTab]);
  
  // activeTab 변경 시 URL 업데이트
  useEffect(() => {
    const currentUrlTab = urlTabParam || "runes";
    const lastActiveTab = lastActiveTabRef.current;
    
    // activeTab이 실제로 변경되었고, URL과 다를 때만 업데이트
    if (activeTab !== lastActiveTab && currentUrlTab !== activeTab) {
      const newSearchParams = new URLSearchParams(searchParams);
      if (activeTab === "runes") {
        // 기본값이면 URL에서 제거
        newSearchParams.delete("tab");
      } else {
        newSearchParams.set("tab", activeTab);
      }
      setSearchParams(newSearchParams, { replace: true });
      lastUrlTabRef.current = activeTab === "runes" ? null : activeTab;
    }
    
    lastActiveTabRef.current = activeTab;
  }, [activeTab, urlTabParam, searchParams, setSearchParams]);
  
  const { t } = useTranslation();

  const resetAll = useCallback(() => {
    // 백과사전 페이지에서는 챔피언 관련 상태가 없으므로 아무것도 하지 않음
  }, []);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pb-4 md:pb-5">
      {/* Tab navigation for encyclopedia sections */}
      <div className="mt-3 md:mt-4">
        <TabNavigation
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab as EncyclopediaTab);
          }}
          onReset={() => {}}
        />
      </div>

      {/* Runes / Items encyclopedia tabs */}
      {activeTab === "runes" && (
        <RunesTab version={version} lang={lang} />
      )}
      {activeTab === "items" && (
        <ItemsTab version={version} lang={lang} />
      )}
    </div>
  );
}

export default function EncyclopediaPage(props: EncyclopediaPageProps) {
  return (
    <VersionProvider 
      initialDDragonVersion={props.version}
      initialCDragonVersion={props.cdragonVersion}
    >
      <EncyclopediaPageContent {...props} />
    </VersionProvider>
  );
}

