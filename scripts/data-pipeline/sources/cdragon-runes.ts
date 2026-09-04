import type { RuneStatShard, RuneStatShardData } from "../normalization/rune";

interface RawSlot {
  type?: string;
  name?: string;
  label?: string;
  localizedName?: string;
  slotLabel?: string;
  perks?: unknown[];
}
interface RawStyle { id?: number; name?: string; type?: string; slots?: RawSlot[] }
interface RawPerk {
  id?: number;
  name?: string;
  iconPath?: string;
  shortDesc?: string;
  longDesc?: string;
}
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function cdragonLocale(locale: string): string {
  if (locale === "ko_KR") return "ko_kr";
  if (locale === "zh_CN") return "zh_cn";
  return "default";
}

function resourceUrl(version: string, locale: string, file: string): string {
  return `https://raw.communitydragon.org/${version}/plugins/rcp-be-lol-game-data/global/${cdragonLocale(locale)}/v1/${file}`;
}

function decodeStyles(value: unknown): RawStyle[] {
  if (Array.isArray(value)) return value as RawStyle[];
  if (value && typeof value === "object") {
    const styles = (value as { styles?: unknown }).styles;
    if (Array.isArray(styles)) return styles as RawStyle[];
  }
  throw new Error("Invalid CDragon perkstyles response");
}

function decodePerks(value: unknown): Map<number, RawPerk> {
  if (!Array.isArray(value)) throw new Error("Invalid CDragon perks response");
  const result = new Map<number, RawPerk>();
  for (const perk of value as RawPerk[]) {
    if (typeof perk?.id === "number") result.set(perk.id, perk);
  }
  return result;
}

function toShard(perk: RawPerk): RuneStatShard | null {
  if (typeof perk.id !== "number") return null;
  return {
    id: perk.id,
    name: perk.name ?? "",
    iconPath: perk.iconPath ?? "",
    shortDesc: perk.shortDesc ?? "",
    longDesc: perk.longDesc ?? "",
  };
}

export async function fetchCDragonRuneStatShards(
  locale: string,
  cdragonVersion: string,
  fetcher: Fetcher = fetch,
): Promise<RuneStatShardData> {
  const [stylesResponse, perksResponse] = await Promise.all([
    fetcher(resourceUrl(cdragonVersion, locale, "perkstyles.json")),
    fetcher(resourceUrl(cdragonVersion, locale, "perks.json")),
  ]);
  if (!stylesResponse.ok || !perksResponse.ok) {
    throw new Error(
      `[CD][Runes] Exact ${cdragonVersion}/${cdragonLocale(locale)} unavailable: ` +
        `${stylesResponse.status}/${perksResponse.status}`,
    );
  }
  const styles = decodeStyles(await stylesResponse.json());
  const perksById = decodePerks(await perksResponse.json());
  const groups = styles
    .filter((style) =>
      style.type === "kStatMod" ||
      (style.slots ?? []).some((slot) => slot.type === "kStatMod"),
    )
    .flatMap((style) => {
      if (typeof style.id !== "number") return [];
      const rows = (style.slots ?? [])
        .filter((slot) => slot.type === "kStatMod")
        .flatMap((slot) => {
          const perks = (slot.perks ?? [])
            .filter((id): id is number => typeof id === "number")
            .map((id) => perksById.get(id))
            .filter((perk): perk is RawPerk => Boolean(perk))
            .map(toShard)
            .filter((perk): perk is RuneStatShard => Boolean(perk));
          return perks.length === 0 ? [] : [{
            label: slot.name ?? slot.label ?? slot.localizedName ?? slot.slotLabel ?? "",
            perks,
          }];
        });
      return rows.length === 0
        ? []
        : [{ styleId: style.id, styleName: style.name ?? "", rows }];
    });
  if (groups.length === 0) {
    throw new Error(`[CD][Runes] No stat shard groups for ${locale}`);
  }
  return { locale, groups };
}
