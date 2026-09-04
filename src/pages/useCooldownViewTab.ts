import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export type CooldownViewTab = "skills" | "stats";

function readTab(value: string | null): CooldownViewTab {
  return value === "stats" ? "stats" : "skills";
}

export function useCooldownViewTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = readTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<CooldownViewTab>(urlTab);

  useEffect(() => {
    setActiveTab(urlTab);
  }, [urlTab]);

  const selectTab = useCallback((tab: CooldownViewTab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === "skills") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  return { activeTab, selectTab };
}
