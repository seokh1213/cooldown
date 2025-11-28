import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { getVersion, getChampionList } from "@/services/api";
import Layout from "@/components/layout/Layout";
import Nav from "@/components/features/Nav";
import CooldownPage from "@/pages/CooldownPage";
import EncyclopediaPage from "@/pages/EncyclopediaPage";
import LaningTipsPage from "@/pages/LaningTipsPage";
import KillAnglePage from "@/pages/KillAnglePage";
import { Champion } from "@/types";

const THEME_STORAGE_KEY = "theme";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }
  
  // Check system preference
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  
  return "light";
}

/* Todo: Tip list

  Duration
    Red, Blue: 2m
    Barone, Elder dragon: 3m

  Regen Time
    Inhibitor: 5m
  
   Spell time, Ward time
*/

function App() {
  const [lang, setLang] = useState<string>("ko_KR");
  const [version, setVersion] = useState<string>("10.8.1");
  const [championList, setChampionList] = useState<Champion[] | null>(null);
  const [selectedChampions, setSelectedChampions] = useState<Champion[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  const initData = useCallback(async () => {
    try {
      const latestVersion = await getVersion();
      setVersion(latestVersion);
      const champions = await getChampionList(latestVersion, lang);
      setChampionList(champions);
    } catch (error) {
      console.error("Failed to initialize data:", error);
    }
  }, [lang]);

  useEffect(() => {
    initData();
  }, [initData]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const handleLangChange = useCallback((newLang: string) => {
    setLang(newLang);
    setSelectedChampions([]);
  }, []);

  const handleSetChampions = useCallback((list: Champion[]) => {
    setSelectedChampions(list);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <BrowserRouter basename={import.meta.env.PROD ? "/cooldown" : undefined}>
      <Layout
        nav={
          <Nav
            version={version}
            lang={lang}
            selectHandler={handleLangChange}
            theme={theme}
            onThemeToggle={toggleTheme}
          />
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <EncyclopediaPage
                lang={lang}
                championList={championList}
                version={version}
              />
            }
          />
          <Route
            path="/cooldown"
            element={
              <CooldownPage
                lang={lang}
                championList={championList}
                selectedChampions={selectedChampions}
                setChampions={handleSetChampions}
              />
            }
          />
          <Route path="/laning-tips" element={<LaningTipsPage />} />
          <Route path="/kill-angle" element={<KillAnglePage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
