const PATCH_YEAR_OFFSET = 10;

/**
 * Data Dragon의 내부 버전을 Riot의 공식 패치 표기로 변환한다.
 *
 * Data Dragon 15.x/16.x는 각각 공식 패치 25.x/26.x와 대응한다.
 * 원본 버전은 데이터 경로와 캐시 키에 그대로 사용해야 하므로, 화면 표시에만
 * 이 값을 사용한다.
 */
export function toOfficialPatchVersion(ddragonVersion: string): string {
  const [major, minor] = ddragonVersion.split(".");
  const ddragonMajor = Number.parseInt(major, 10);
  const patchMinor = Number.parseInt(minor, 10);

  if (!Number.isInteger(ddragonMajor) || !Number.isInteger(patchMinor)) {
    return ddragonVersion;
  }

  return `${ddragonMajor + PATCH_YEAR_OFFSET}.${patchMinor}`;
}
