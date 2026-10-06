import { decodeChampionDetail, decodeChampionIndex } from "./championDataDecoder";
import { decodeChampionProfile } from "./championProfile";
import { decodeNormalizedItems, decodeNormalizedRunes, decodeNormalizedSummoners } from "./normalizedDataDecoder";
import { DATA_LOCALES, type DataLocale, type StaticDataIdentity, type StaticDataMetadata } from "./staticData";
import { assertStaticDataIdentity } from "./staticDataDecoder";

/** Validate catalog files against the candidate manifest before activating its worker. */
export function assertReleaseData(path: string, value: unknown, identity: StaticDataIdentity): void {
  const parts = path.split("/");
  let metadata: StaticDataMetadata;
  let locale: DataLocale;
  const normalized = /^(items|runes|summoner)-normalized-(ko_KR|en_US|zh_CN)\.json$/.exec(parts[2] ?? "");
  if (parts[0] !== "data") return;
  if (normalized && parts.length === 3) {
    locale = normalized[2] as DataLocale;
    metadata = normalized[1] === "items" ? decodeNormalizedItems(value)
      : normalized[1] === "runes" ? decodeNormalizedRunes(value)
        : decodeNormalizedSummoners(value);
  } else if (parts.length === 5 && (parts[2] === "champions" || parts[2] === "champion-profiles") &&
    DATA_LOCALES.includes(parts[3] as DataLocale) && parts[4].endsWith(".json")) {
    locale = parts[3] as DataLocale;
    const id = parts[4].slice(0, -5);
    if (parts[2] === "champions" && id === "index") metadata = decodeChampionIndex(value);
    else {
      const detail = parts[2] === "champions" ? decodeChampionDetail(value) : decodeChampionProfile(value);
      if (detail.champion.id !== id) throw new Error("Champion release data id mismatch");
      metadata = detail;
    }
  } else {
    // Other tracked assets have their own consumers and no shared catalog schema.
    return;
  }
  if (parts[1] !== identity.patchVersion) throw new Error("Release data path mismatch");
  assertStaticDataIdentity(metadata, identity, locale);
}
