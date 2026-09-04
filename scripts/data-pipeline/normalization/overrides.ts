import fs from "node:fs";
import path from "node:path";
import type {
  NormalizedChampion,
  NormalizedItem,
  NormalizedRune,
  NormalizedStatShard,
} from "../../../src/types/combatNormalized";

export interface NormalizationOverrides {
  champions?: Record<string, Record<string, Partial<NormalizedChampion>>>;
  items?: Record<string, Record<string, Partial<NormalizedItem>>>;
  runes?: Record<string, Record<string, Partial<NormalizedRune>>>;
  statShards?: Record<string, Record<string, Partial<NormalizedStatShard>>>;
}

const overridesPath = path.join(
  process.cwd(),
  "scripts",
  "normalization-overrides.json",
);

let cachedOverrides: NormalizationOverrides | null | undefined;

export function getNormalizationOverrides(): NormalizationOverrides | null {
  if (cachedOverrides !== undefined) return cachedOverrides;

  if (!fs.existsSync(overridesPath)) {
    cachedOverrides = null;
    return cachedOverrides;
  }

  try {
    cachedOverrides = JSON.parse(
      fs.readFileSync(overridesPath, "utf8"),
    ) as NormalizationOverrides;
  } catch (error) {
    console.warn("[Overrides] Failed to read normalization-overrides.json:", error);
    cachedOverrides = null;
  }

  return cachedOverrides;
}
