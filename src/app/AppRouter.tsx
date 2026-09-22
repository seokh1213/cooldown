import { lazy, Suspense } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SplashScreen from "@/components/layout/SplashScreen";
import Nav from "@/components/features/Nav";
import { ChampionSheetProvider, useChampionIds } from "@/components/ui/champion-icon";
import type { Language } from "@/i18n";
import type { AppRuntimeData } from "./useAppBootstrap";
import type { AppTheme } from "./useAppPreferences";

const ChampionCooldownPage = lazy(() => import("@/pages/ChampionCooldownPage"));
const EncyclopediaPage = lazy(() => import("@/pages/EncyclopediaPage"));
const SimulationPage = lazy(() => import("@/pages/SimulationPage"));
const VsPage = lazy(() => import("@/pages/VsPage"));
const OGPreviewPage = lazy(() => import("@/pages/OGPreviewPage"));

interface AppRouterProps {
  runtime: AppRuntimeData;
  language: Language;
  theme: AppTheme;
  onLanguageChange: (language: string) => void;
  onThemeToggle: () => void;
}

function AppShell(props: AppRouterProps) {
  const { runtime, language, theme, onLanguageChange, onThemeToggle } = props;
  return (
    <Layout
      patch={runtime.patchVersion}
      ddragonVersion={runtime.sources.ddragon}
      nav={
        <Nav
          patchVersion={runtime.patchVersion}
          ddragonVersion={runtime.sources.ddragon}
          cdragonVersion={runtime.sources.cdragon}
          lang={language}
          selectHandler={onLanguageChange}
          theme={theme}
          onThemeToggle={onThemeToggle}
        />
      }
    >
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}

export function AppRouter(props: AppRouterProps) {
  const { runtime, language } = props;
  /*
   * 챔피언 초상 시트를 맨 위에서 한 번 깐다.
   *
   * 서비스워커가 설치할 때 받아 두는 시트라 앱이 뜬 순간 이미 있다. 화면마다
   * 목록을 들고 다니지 않아도 `ChampionIcon` 이 여기서 꺼내 쓴다.
   */
  const championIds = useChampionIds(runtime.championList);
  return (
    <ChampionSheetProvider ids={championIds} ddragonVersion={runtime.sources.ddragon}>
      <Routes>
        <Route element={<AppShell {...props} />}>
          <Route
            index
            element={
              <ChampionCooldownPage
                lang={language}
                championList={runtime.championList}
                patchVersion={runtime.patchVersion}
                ddragonVersion={runtime.sources.ddragon}
                sources={runtime.sources}
              />
            }
          />
          <Route
            path="vs"
            element={<VsPage lang={language} championList={runtime.championList} patchVersion={runtime.patchVersion} sources={runtime.sources} />}
          />
          <Route
            path="encyclopedia"
            element={
              <EncyclopediaPage
                championList={runtime.championList}
                lang={language}
                patchVersion={runtime.patchVersion}
                ddragonVersion={runtime.sources.ddragon}
                sources={runtime.sources}
              />
            }
          />
          <Route
            path="simulation"
            element={
              <SimulationPage
                lang={language}
                patchVersion={runtime.patchVersion}
                ddragonVersion={runtime.sources.ddragon}
                sources={runtime.sources}
                championList={runtime.championList}
              />
            }
          />
        </Route>
        {import.meta.env.DEV && (
          <Route
            path="og-preview"
            element={
              <Suspense fallback={<SplashScreen />}>
                <OGPreviewPage />
              </Suspense>
            }
          />
        )}
      </Routes>
    </ChampionSheetProvider>
  );
}
