import { useCallback, useEffect, useState } from "react";
import type { Language } from "@/i18n";
import {
  APP_STORAGE_KEYS,
  initializeAppStorage,
  readLocale,
  readStorage,
  readTheme,
  writeStorage,
} from "@/data/storage/appStorage";

export type AppTheme = "light" | "dark";

function initialTheme(): AppTheme {
  const stored = readTheme();
  if (stored) return stored;
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useAppPreferences() {
  initializeAppStorage();
  const [language, setLanguage] = useState<Language>(() => readLocale() ?? "ko_KR");
  const [theme, setTheme] = useState<AppTheme>(initialTheme);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(
    () => readStorage(APP_STORAGE_KEYS.pwaAutoUpdate) !== "false"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    writeStorage(APP_STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    writeStorage(APP_STORAGE_KEYS.language, language);
  }, [language]);

  useEffect(() => {
    writeStorage(
      APP_STORAGE_KEYS.pwaAutoUpdate,
      autoUpdateEnabled ? "true" : "false"
    );
  }, [autoUpdateEnabled]);

  const selectLanguage = useCallback((value: string) => {
    if (value === "ko_KR" || value === "en_US" || value === "zh_CN") {
      setLanguage(value);
    }
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }, []);

  return {
    language,
    theme,
    autoUpdateEnabled,
    setAutoUpdateEnabled,
    selectLanguage,
    toggleTheme,
  };
}
