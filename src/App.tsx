import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { getDataVersions, getVersion, getChampionList, cleanOldVersionCache } from "@/services/api";
import Layout from "@/components/layout/Layout";
import Nav from "@/components/features/Nav";
import SplashScreen from "@/components/layout/SplashScreen";
import { Champion } from "@/types";
import { I18nProvider, Language } from "@/i18n";
import { validateAllStorageData, checkAndClearStorageIfVersionMismatch } from "@/lib/storageValidator";
import { logger } from "@/lib/logger";
import { applyPWAUpdate, BUILD_VERSION, subscribeToPWAUpdate } from "@/pwa";

// Lazy load pages for code splitting
const EncyclopediaPage = lazy(() => import("@/pages/EncyclopediaPage"));
const LaningTipsPage = lazy(() => import("@/pages/LaningTipsPage"));
const KillAnglePage = lazy(() => import("@/pages/KillAnglePage"));
const OGPreviewPage = lazy(() => import("@/pages/OGPreviewPage"));

const THEME_STORAGE_KEY = "theme";
const LANG_STORAGE_KEY = "language";
const PWA_AUTO_UPDATE_KEY = "pwaAutoUpdate";

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
  const [pwaUpdateAvailable, setPwaUpdateAvailable] = useState(false);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(PWA_AUTO_UPDATE_KEY);
    // 저장된 값이 없으면 기본값은 "자동 업데이트 켜짐"
    return stored !== "false";
  });

  const initData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // splash 화면이 띄워질 때 배포 버전 체크 및 초기화 (가장 먼저 실행)
      checkAndClearStorageIfVersionMismatch();
      
      // splash 화면이 띄워질 때 localStorage 데이터 구조 유효성 검사
      validateAllStorageData();
      
      const { ddragonVersion, cdragonVersion } = await getDataVersions();
      setVersion(ddragonVersion);
      
      // 오래된 버전의 캐시 제거 (DDragon + CDragon 기준)
      cleanOldVersionCache(ddragonVersion, cdragonVersion);
      
      const champions = await getChampionList(ddragonVersion, lang);
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

  // PWA 업데이트 감지 및 자동/수동 새로고침 분기
  useEffect(() => {
    if (typeof window === "undefined") return;

    const unsubscribe = subscribeToPWAUpdate(() => {
      if (autoUpdateEnabled) {
        // 유저 설정이 "자동 업데이트"면 바로 새 빌드로 교체 + 리로드
        void applyPWAUpdate(true);
      } else {
        // 그렇지 않으면 배너를 띄워서 유저에게 물어본다.
        setPwaUpdateAvailable(true);
      }
    });

    return unsubscribe;
  }, [autoUpdateEnabled]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PWA_AUTO_UPDATE_KEY, autoUpdateEnabled ? "true" : "false");
  }, [autoUpdateEnabled]);

  const handleLangChange = useCallback((newLang: string) => {
    setLang(newLang as Language);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <I18nProvider lang={lang}>
      {/* 새 빌드가 감지됐을 때 유저에게 알리는 배너 (자동 업데이트가 꺼져 있을 때만 보임) */}
      {pwaUpdateAvailable && !autoUpdateEnabled && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-neutral-900/95 px-4 py-3 text-sm text-white shadow-lg border border-neutral-700">
          <div className="font-semibold mb-1">새 버전이 준비되었습니다.</div>
          <div className="text-xs text-neutral-200 mb-2">
            앱을 새로고침하면 최신 버전으로 업데이트됩니다.
            <br />
            <span className="opacity-70">현재 빌드: {BUILD_VERSION}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1 text-xs text-neutral-300">
              <input
                type="checkbox"
                className="h-3 w-3 accent-emerald-400"
                checked={autoUpdateEnabled}
                onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
              />
              다음부터 자동으로 새 버전 적용
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
                onClick={() => setPwaUpdateAvailable(false)}
              >
                나중에
              </button>
              <button
                type="button"
                className="rounded bg-emerald-500 px-2 py-1 text-xs font-semibold text-black hover:bg-emerald-400"
                onClick={() => {
                  setPwaUpdateAvailable(false);
                  void applyPWAUpdate(true);
                }}
              >
                지금 새로고침
              </button>
            </div>
          </div>
        </div>
      )}
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
                <Suspense fallback={<SplashScreen />}>
                  <EncyclopediaPage
                    lang={lang}
                    championList={championList}
                    version={version}
                  />
                </Suspense>
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
              <Suspense fallback={<SplashScreen />}>
                <LaningTipsPage />
              </Suspense>
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
              <Suspense fallback={<SplashScreen />}>
                <KillAnglePage />
              </Suspense>
            </Layout>
          }
        />
        {/* OG Preview 페이지는 개발 환경에서만 활성화 */}
        {import.meta.env.DEV && (
          <Route
            path="/og-preview"
            element={
              <Suspense fallback={<SplashScreen />}>
                <OGPreviewPage />
              </Suspense>
            }
          />
        )}
      </Routes>
    </>
  );
}

export default App;
