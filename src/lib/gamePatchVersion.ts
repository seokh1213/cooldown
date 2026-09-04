const PATCH_YEAR_OFFSET = 10;

/**
 * Data Dragon의 내부 버전을 Riot의 공식 패치 표기로 변환한다.
 *
 * Data Dragon 15.x/16.x는 각각 공식 패치 25.x/26.x와 대응한다.
 * 공식 패치 버전은 정적 데이터 경로에, 원본 버전은 DDragon CDN 요청에 사용한다.
 */
export function toOfficialPatchVersion(ddragonVersion: string): string {
  const match = /^(\d+)\.(\d+)\.\d+$/.exec(ddragonVersion);
  if (!match) {
    throw new Error(`Invalid Data Dragon release: ${ddragonVersion}`);
  }
  return `${Number(match[1]) + PATCH_YEAR_OFFSET}.${Number(match[2])}`;
}
