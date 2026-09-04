import type { StaticDataSources } from "../data/contracts/staticData";
import { toOfficialPatchVersion } from "./gamePatchVersion";

export interface StaticDataRelease {
  patchVersion: string;
  sources: StaticDataSources;
}

export function toCommunityDragonVersion(ddragonVersion: string): string {
  const match = /^(\d+)\.(\d+)\.\d+$/.exec(ddragonVersion);
  if (!match) {
    throw new Error(`Invalid Data Dragon release: ${ddragonVersion}`);
  }
  return `${match[1]}.${match[2]}`;
}

export function resolveStaticDataRelease(
  ddragonVersion: string,
): StaticDataRelease {
  return {
    patchVersion: toOfficialPatchVersion(ddragonVersion),
    sources: {
      ddragon: ddragonVersion,
      cdragon: toCommunityDragonVersion(ddragonVersion),
    },
  };
}
