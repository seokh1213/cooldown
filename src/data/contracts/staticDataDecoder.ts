import {
  DATA_LOCALES,
  type DataLocale,
  type StaticDataMetadata,
} from "./staticData";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function decodeStaticDataMetadata(
  value: Record<string, unknown>
): StaticDataMetadata {
  if (value.schemaVersion !== 2 || typeof value.patchVersion !== "string") {
    throw new Error("Unsupported static data schema");
  }
  if (!DATA_LOCALES.includes(value.locale as DataLocale)) {
    throw new Error("Unsupported static data locale");
  }
  if (
    !isRecord(value.sources) ||
    typeof value.sources.ddragon !== "string" ||
    typeof value.sources.cdragon !== "string"
  ) {
    throw new Error("Invalid static data source versions");
  }
  return {
    schemaVersion: 2,
    patchVersion: value.patchVersion,
    locale: value.locale as DataLocale,
    sources: {
      ddragon: value.sources.ddragon,
      cdragon: value.sources.cdragon,
    },
  };
}

export function assertStaticDataIdentity(
  metadata: StaticDataMetadata,
  patchVersion: string,
  locale: DataLocale
): void {
  if (metadata.patchVersion !== patchVersion || metadata.locale !== locale) {
    throw new Error(
      `Static data identity mismatch: expected ${patchVersion}/${locale}, received ${metadata.patchVersion}/${metadata.locale}`
    );
  }
}
