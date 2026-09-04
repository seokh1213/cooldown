import type { StaticDataSources } from "../data/contracts/staticData";

const PATCH_YEAR_OFFSET = 10;

export interface StaticDataRelease {
  patchVersion: string;
  sources: StaticDataSources;
}

/**
 * Data Dragon의 내부 버전을 Riot의 공식 패치 표기로 변환한다.
 * 16.17.1처럼 연도에서 10을 뺀 버전은 공식 패치 26.17에 대응한다.
 */
export function toOfficialPatchVersion(ddragonVersion: string): string {
  const match = /^(\d+)\.(\d+)\.\d+$/.exec(ddragonVersion);
  if (!match) {
    throw new Error(`Invalid Data Dragon release: ${ddragonVersion}`);
  }
  return `${Number(match[1]) + PATCH_YEAR_OFFSET}.${Number(match[2])}`;
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
