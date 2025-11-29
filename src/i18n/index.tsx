import React, { createContext, useContext, useMemo } from "react";
import { translations, Translations } from "./translations";
import type { Language } from "./translations";

interface I18nContextType {
  lang: Language;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
  lang: Language;
  children: React.ReactNode;
}

export function I18nProvider({ lang, children }: I18nProviderProps) {
  const t = useMemo(() => translations[lang], [lang]);

  const value = useMemo(
    () => ({
      lang,
      t,
    }),
    [lang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
}

// 유틸리티 함수: lang을 직접 받아서 번역 반환 (Context 없이 사용할 때)
export function getTranslations(lang: Language): Translations {
  return translations[lang];
}

// Language 타입 export
export type { Language };

