import {
  DATA_LOCALES,
  type DataLocale,
  type StaticDataIdentity,
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
  expected: StaticDataIdentity,
  locale: DataLocale
): void {
  const matches =
    metadata.patchVersion === expected.patchVersion &&
    metadata.locale === locale &&
    metadata.sources.ddragon === expected.sources.ddragon &&
    metadata.sources.cdragon === expected.sources.cdragon;
  if (!matches) {
    throw new Error(
      "Static data identity mismatch: " +
        `expected ${formatIdentity(expected)}/${locale}, ` +
        `received ${formatIdentity(metadata)}/${metadata.locale}`,
    );
  }
}

function formatIdentity(identity: StaticDataIdentity): string {
  return [
    identity.patchVersion,
    identity.sources.ddragon,
    identity.sources.cdragon,
  ].join("/");
}

export function staticDataIdentityKey(identity: StaticDataIdentity): string {
  return [
    identity.patchVersion,
    identity.sources.ddragon,
    identity.sources.cdragon,
  ].join(":");
}
