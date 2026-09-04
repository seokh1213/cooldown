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

export default function App() {
  const preferences = useAppPreferences();
  const bootstrap = useAppBootstrap(preferences.language);
  const [pwaUpdateAvailable, setPwaUpdateAvailable] = useState(false);

  useEffect(() => subscribeToPWAUpdate(() => {
    if (preferences.autoUpdateEnabled) void applyPWAUpdate(true);
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
