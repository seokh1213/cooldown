export const DATA_LOCALES = ["ko_KR", "en_US", "zh_CN"] as const;

export type DataLocale = (typeof DATA_LOCALES)[number];

export interface StaticDataSources {
  ddragon: string;
  cdragon: string;
}

export interface StaticDataMetadata {
  schemaVersion: 2;
  patchVersion: string;
  locale: DataLocale;
  sources: StaticDataSources;
}
