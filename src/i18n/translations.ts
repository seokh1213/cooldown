import { createZhCNTranslations } from "./zhCNTranslations";
import { enUSTranslations } from "./enUSTranslations";
import { koKRTranslations } from "./koKRTranslations";
import type { Language, Translations } from "./translationTypes";

export type { Language, Translations } from "./translationTypes";

export const translations: Record<Language, Translations> = {
  ko_KR: koKRTranslations,
  en_US: enUSTranslations,
  zh_CN: createZhCNTranslations(enUSTranslations),
};
