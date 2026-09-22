import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import SplashScreen from "@/components/layout/SplashScreen";
import Nav from "@/components/features/Nav";
import type { Language } from "@/i18n";
import type { AppRuntimeData } from "./useAppBootstrap";
import type { AppTheme } from "./useAppPreferences";

const ChampionCooldownPage = lazy(() => import("@/pages/ChampionCooldownPage"));
const EncyclopediaPage = lazy(() => import("@/pages/EncyclopediaPage"));
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
  return (
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
        {/*
          * 갈 곳 없는 주소는 처음으로 돌린다.
          *
          * 시뮬레이션 화면을 걷어내면서 알았다. 잡히지 않는 경로는 틀을 그린 뒤 본문만
          * 비워 두었다 — 머리와 옆줄은 멀쩡한데 가운데가 텅 빈 화면이라, 사용자는
          * 고장인지 빈 화면인지 알 길이 없었다. 북마크나 옛 링크로 들어오는 자리다.
          */}
        <Route path="*" element={<Navigate to="/" replace />} />
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
