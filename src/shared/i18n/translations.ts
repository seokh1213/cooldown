import { zhCNTranslations } from "./locales/zh_CN";
import { enUSTranslations } from "./locales/en_US";
import { koKRTranslations } from "./locales/ko_KR";
import type { Language, Translations } from "./translationTypes";

export type { Language, Translations } from "./translationTypes";

export const translations: Record<Language, Translations> = {
  ko_KR: koKRTranslations,
  en_US: enUSTranslations,
  zh_CN: zhCNTranslations,
};
