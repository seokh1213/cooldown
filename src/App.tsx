import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";
import SplashScreen from "@/components/layout/SplashScreen";
import { I18nProvider } from "@/i18n";
import { applyPWAUpdate, subscribeToPWAUpdate } from "@/pwa";
import { AppRouter } from "@/app/AppRouter";
import { BootstrapError } from "@/app/BootstrapError";
import { UpdateBanner } from "@/app/UpdateBanner";
import { useAppBootstrap } from "@/app/useAppBootstrap";
import { useAppPreferences } from "@/app/useAppPreferences";
import { warmIcons } from "@/lib/warmIcons";

export default function App() {
  const preferences = useAppPreferences();
  const bootstrap = useAppBootstrap(preferences.language);
  const [pwaUpdateAvailable, setPwaUpdateAvailable] = useState(false);

  /*
   * 백과가 쓰는 시트 넷을 미리 받아 둔다.
   *
   * 스플래시가 지나고 첫 화면이 그려진 다음, 손이 빈 틈에 받는다. 지금 보여야 할
   * 것과 다투지 않고 나중에 백과를 열면 이미 와 있다. 데이터 절약이 켜져 있거나
   * 회선이 느리면 받지 않는다.
   */
  const ddragonVersion = bootstrap.state.status === "ready" ? bootstrap.state.data.sources.ddragon : "";
  useEffect(() => {
    if (ddragonVersion) warmIcons(ddragonVersion);
  }, [ddragonVersion]);

  useEffect(() => subscribeToPWAUpdate(() => {
    if (preferences.autoUpdateEnabled) void applyPWAUpdate();
    else setPwaUpdateAvailable(true);
  }), [preferences.autoUpdateEnabled]);

  return (
    <I18nProvider lang={preferences.language}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <UpdateBanner
          visible={pwaUpdateAvailable}
          autoUpdateEnabled={preferences.autoUpdateEnabled}
          onAutoUpdateChange={preferences.setAutoUpdateEnabled}
          onDismiss={() => setPwaUpdateAvailable(false)}
        />
        {bootstrap.state.status === "loading" && <SplashScreen />}
        {bootstrap.state.status === "error" && (
          <BootstrapError
            message={bootstrap.state.error.message}
            onRetry={bootstrap.retry}
          />
        )}
        {bootstrap.state.status === "ready" && (
          <AppRouter
            runtime={bootstrap.state.data}
            language={preferences.language}
            theme={preferences.theme}
            onLanguageChange={preferences.selectLanguage}
            onThemeToggle={preferences.toggleTheme}
          />
        )}
      </BrowserRouter>
    </I18nProvider>
  );
}
