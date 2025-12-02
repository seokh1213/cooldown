import { useState, useEffect, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { getVersion, getChampionList, cleanOldVersionCache } from "@/services/api";
import Layout from "@/components/layout/Layout";
import Nav from "@/components/features/Nav";
import SplashScreen from "@/components/layout/SplashScreen";
import EncyclopediaPage from "@/pages/EncyclopediaPage";
import LaningTipsPage from "@/pages/LaningTipsPage";
import KillAnglePage from "@/pages/KillAnglePage";
import OGPreviewPage from "@/pages/OGPreviewPage";
import { Champion } from "@/types";
import { I18nProvider, Language } from "@/i18n";
import { validateAllStorageData } from "@/lib/storageValidator";
import { logger } from "@/lib/logger";

const THEME_STORAGE_KEY = "theme";
const LANG_STORAGE_KEY = "language";

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

function getInitialLang(): Language {
  if (typeof window === "undefined") return "ko_KR";
  
  const stored = localStorage.getItem(LANG_STORAGE_KEY);
  if (stored === "ko_KR" || stored === "en_US") {
    return stored as Language;
  }
  
  return "ko_KR";
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
  const [lang, setLang] = useState<Language>(getInitialLang);
  const [version, setVersion] = useState<string | null>(null);
  const [championList, setChampionList] = useState<Champion[] | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const initData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // splash 화면이 띄워질 때 localStorage 데이터 구조 유효성 검사
      validateAllStorageData();
      
      const latestVersion = await getVersion();
      setVersion(latestVersion);
      
      // 오래된 버전의 캐시 제거
      cleanOldVersionCache(latestVersion);
      
      const champions = await getChampionList(latestVersion, lang);
      setChampionList(champions);
      // 최소 로딩 시간 보장 (스플래시 화면 표시)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      logger.error("Failed to initialize data:", error);
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

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }, [lang]);

  const handleLangChange = useCallback((newLang: string) => {
    setLang(newLang as Language);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <I18nProvider lang={lang}>
      <BrowserRouter basename={import.meta.env.PROD ? "/cooldown" : undefined}>
        <AppContent
          isLoading={isLoading}
          version={version}
          lang={lang}
          championList={championList}
          theme={theme}
          handleLangChange={handleLangChange}
          toggleTheme={toggleTheme}
        />
      </BrowserRouter>
    </I18nProvider>
  );
}

function AppContent({
  isLoading,
  version,
  lang,
  championList,
  theme,
  handleLangChange,
  toggleTheme,
}: {
  isLoading: boolean;
  version: string | null;
  lang: Language;
  championList: Champion[] | null;
  theme: "light" | "dark";
  handleLangChange: (newLang: string) => void;
  toggleTheme: () => void;
}) {
  return (
    <>
      {/* 버전이 로드되기 전까지 스플래시 화면 표시 */}
      {(isLoading || !version) && <SplashScreen />}
      <Routes>
        <Route
          path="/"
          element={
            isLoading || !version ? (
              <SplashScreen />
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
                  version={version || undefined}
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
                  version={version || undefined}
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
        {/* OG Preview 페이지는 개발 환경에서만 활성화 */}
        {import.meta.env.DEV && (
          <Route
            path="/og-preview"
            element={<OGPreviewPage />}
          />
        )}
      </Routes>
    </>
  );
}

export default App;
