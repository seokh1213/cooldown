export interface DataManifest {
  schemaVersion: 2;
  patchVersion: string;
  sources: {
    ddragon: string;
    cdragon: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function decodeDataManifest(value: unknown): DataManifest {
  if (!isRecord(value) || value.schemaVersion !== 2) {
    throw new Error("Unsupported static data manifest");
  }
  if (typeof value.patchVersion !== "string" || !isRecord(value.sources)) {
    throw new Error("Invalid static data manifest");
  }
  const ddragon = value.sources.ddragon;
  const cdragon = value.sources.cdragon;
  if (typeof ddragon !== "string" || typeof cdragon !== "string") {
    throw new Error("Invalid static data source versions");
  }
  return {
    schemaVersion: 2,
    patchVersion: value.patchVersion,
    sources: { ddragon, cdragon },
  };
}
