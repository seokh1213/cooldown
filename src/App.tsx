import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getVersion, getChampionList, cleanOldVersionCache } from "@/services/api";
import Layout from "@/components/layout/Layout";
import Nav from "@/components/features/Nav";
import SplashScreen from "@/components/layout/SplashScreen";
import EncyclopediaPage from "@/pages/EncyclopediaPage";
import LaningTipsPage from "@/pages/LaningTipsPage";
import KillAnglePage from "@/pages/KillAnglePage";
import TutorialPage, { isTutorialCompleted } from "@/pages/TutorialPage";
import { useDeviceType } from "@/hooks/useDeviceType";
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
  const [version, setVersion] = useState<string | null>(null);
  const [championList, setChampionList] = useState<Champion[] | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const deviceType = useDeviceType();
  const isMobile = deviceType === "mobile";

  const initData = useCallback(async () => {
    try {
      setIsLoading(true);
      const latestVersion = await getVersion();
      setVersion(latestVersion);
      
      // 오래된 버전의 캐시 제거
      cleanOldVersionCache(latestVersion);
      
      const champions = await getChampionList(latestVersion, lang);
      setChampionList(champions);
      // 최소 로딩 시간 보장 (스플래시 화면 표시)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error("Failed to initialize data:", error);
    } finally {
      setIsLoading(false);
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
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  // 튜토리얼이 완료되지 않았고 모바일이면 튜토리얼 페이지로 리다이렉트
  const shouldShowTutorial = isMobile && !isTutorialCompleted();

  return (
    <BrowserRouter basename={import.meta.env.PROD ? "/cooldown" : undefined}>
      <AppContent
        isLoading={isLoading}
        version={version}
        shouldShowTutorial={shouldShowTutorial}
        lang={lang}
        championList={championList}
        theme={theme}
        handleLangChange={handleLangChange}
        toggleTheme={toggleTheme}
      />
    </BrowserRouter>
  );
}

function AppContent({
  isLoading,
  version,
  shouldShowTutorial,
  lang,
  championList,
  theme,
  handleLangChange,
  toggleTheme,
}: {
  isLoading: boolean;
  version: string | null;
  shouldShowTutorial: boolean;
  lang: string;
  championList: Champion[] | null;
  theme: "light" | "dark";
  handleLangChange: (newLang: string) => void;
  toggleTheme: () => void;
}) {
  const location = useLocation();
  const isTutorialPage = location.pathname === "/tutorial";

  return (
    <>
      {/* 버전이 로드되기 전까지 스플래시 화면 표시 (튜토리얼 페이지 제외) */}
      {(isLoading || !version) && !isTutorialPage && <SplashScreen />}
      <Routes>
        {/* 튜토리얼 페이지는 레이아웃 없이 표시, 로딩 상태와 관계없이 접근 가능 */}
        <Route
          path="/tutorial"
          element={<TutorialPage />}
        />
        {/* 튜토리얼이 필요하면 튜토리얼 페이지로 리다이렉트 */}
        <Route
          path="/"
          element={
            isLoading || !version ? (
              <SplashScreen />
            ) : shouldShowTutorial ? (
              <Navigate to="/tutorial" replace />
            ) : (
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
                <EncyclopediaPage
                  lang={lang}
                  championList={championList}
                  version={version}
                />
              </Layout>
            )
          }
        />
        <Route
          path="/laning-tips"
          element={
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
              <LaningTipsPage />
            </Layout>
          }
        />
        <Route
          path="/kill-angle"
          element={
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
              <KillAnglePage />
            </Layout>
          }
        />
      </Routes>
    </>
  );
}

export default App;
