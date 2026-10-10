import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import Layout from "@/app/layout/Layout";
import SplashScreen from "@/app/bootstrap/SplashScreen";
import Nav from "@/app/layout/Nav";
import type { Language } from "@/shared/i18n";
import type { AppRuntimeData } from "../bootstrap/useAppBootstrap";
import type { AppTheme } from "../useAppPreferences";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

const ChampionCooldownPage = lazy(() => import("@/features/cooldown/ChampionCooldownPage"));
const EncyclopediaPage = lazy(() => import("@/features/encyclopedia/EncyclopediaPage"));
const VsPage = lazy(() => import("@/features/vs/VsPage"));
const PatchNotesPage = lazy(() => import("@/features/patch-notes/PatchNotesPage"));
const OGPreviewPage = import.meta.env.DEV
  ? lazy(() => import("../../../dev/preview/OGPreviewPage"))
  : null;

interface AppRouterProps {
  runtime: AppRuntimeData;
  language: Language;
  theme: AppTheme;
  onLanguageChange: (language: string) => void;
  onThemeToggle: () => void;
}

function AppShell(props: AppRouterProps) {
  const { runtime, language, theme, onLanguageChange, onThemeToggle } = props;
  const location = useLocation();
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
      <RouteErrorBoundary key={location.pathname}>
        <Suspense fallback={<SplashScreen />}>
          <Outlet />
        </Suspense>
      </RouteErrorBoundary>
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
        <Route path="patch-notes" element={<PatchNotesPage />} />
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
      {OGPreviewPage && (
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
