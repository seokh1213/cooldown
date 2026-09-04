import { lazy, Suspense } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SplashScreen from "@/components/layout/SplashScreen";
import Nav from "@/components/features/Nav";
import type { Language } from "@/i18n";
import type { AppRuntimeData } from "./useAppBootstrap";
import type { AppTheme } from "./useAppPreferences";

const ChampionCooldownPage = lazy(() => import("@/pages/ChampionCooldownPage"));
const EncyclopediaPage = lazy(() => import("@/pages/EncyclopediaPage"));
const SimulationPage = lazy(() => import("@/pages/SimulationPage"));
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
      nav={
        <Nav
          patchVersion={runtime.patchVersion}
          ddragonVersion={runtime.ddragonVersion}
          cdragonVersion={runtime.cdragonVersion}
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
  return (
    <Routes>
      <Route element={<AppShell {...props} />}>
        <Route
          index
          element={
            <ChampionCooldownPage
              lang={language}
              championList={runtime.championList}
              version={runtime.patchVersion}
              ddragonVersion={runtime.ddragonVersion}
            />
          }
        />
        <Route
          path="encyclopedia"
          element={
            <EncyclopediaPage
              lang={language}
              version={runtime.patchVersion}
              ddragonVersion={runtime.ddragonVersion}
            />
          }
        />
        <Route
          path="simulation"
          element={
            <SimulationPage
              lang={language}
              version={runtime.patchVersion}
              ddragonVersion={runtime.ddragonVersion}
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
  );
}
