import type { StaticDataMetadata } from "./staticData";
import { decodeStaticDataMetadata, isRecord } from "./staticDataDecoder";

export interface ChampionProfile extends StaticDataMetadata {
  champion: {
    id: string;
    name: string;
    title: string;
    lore: string;
    skins: { num: number; name: string }[];
  };
}

export function decodeChampionProfile(value: unknown): ChampionProfile {
  if (!isRecord(value)) throw new Error("Invalid champion profile");
  decodeStaticDataMetadata(value);
  const champion = value.champion;
  if (!isRecord(champion) || typeof champion.id !== "string" ||
      !/^[A-Za-z0-9]+$/.test(champion.id) || typeof champion.name !== "string" ||
      typeof champion.title !== "string" || typeof champion.lore !== "string" ||
      !Array.isArray(champion.skins)) throw new Error("Invalid champion profile identity");
  const numbers = new Set<number>();
  for (const skin of champion.skins) {
    if (!isRecord(skin) || typeof skin.num !== "number" || !Number.isInteger(skin.num) ||
        skin.num < 0 || typeof skin.name !== "string" || numbers.has(skin.num)) {
      throw new Error("Invalid champion skin");
    }
    numbers.add(skin.num);
  }
  return value as unknown as ChampionProfile;
}
