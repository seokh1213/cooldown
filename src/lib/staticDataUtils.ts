/**
 * 정적 데이터 유틸리티 함수
 * 버전 비교 및 정적 데이터 경로 관리
 */

/**
 * 버전 문자열을 숫자 배열로 변환하여 비교 가능하게 만듦
 * 예: "15.1.1" -> [15, 1, 1]
 */
function parseVersion(version: string): number[] {
  return version.split('.').map(Number);
}

/**
 * 두 버전을 비교
 * @returns 양수면 v1 > v2, 음수면 v1 < v2, 0이면 같음
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = parseVersion(v1);
  const parts2 = parseVersion(v2);
  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

/**
 * 버전 배열을 정렬 (최신 버전이 먼저)
 */
export function sortVersions(versions: string[]): string[] {
  return [...versions].sort((a, b) => compareVersions(b, a));
}

/**
 * 정적 데이터 디렉토리에서 사용 가능한 버전 목록 가져오기
 * @returns 사용 가능한 버전 목록 (최신 순서)
 */
export async function getAvailableVersions(): Promise<string[]> {
  try {
    // public/data/ 디렉토리에서 버전 목록 가져오기
    const basePath = import.meta.env.BASE_URL || '/';
    const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
    const dataDir = `${normalizedBase}data`;
    const response = await fetch(dataDir);
    
    if (!response.ok) {
      return [];
    }

    // HTML 응답을 파싱하여 디렉토리 목록 추출
    // 실제로는 서버에서 디렉토리 목록을 제공하지 않을 수 있으므로
    // 대안으로 version.json 파일을 직접 확인하는 방식 사용
    // 간단한 방법: 정규식으로 버전 디렉토리 찾기
    // 하지만 더 나은 방법은 서버에서 인덱스 파일을 제공하거나
    // 빌드 시점에 버전 목록을 생성하는 것
    
    // 임시로 빈 배열 반환 (실제 구현은 서버 설정에 따라 달라질 수 있음)
    return [];
  } catch (error) {
    console.warn('[StaticData] Failed to get available versions:', error);
    return [];
  }
}

/**
 * 최신 버전 찾기
 * 정적 데이터가 없을 경우 null 반환
 */
export async function getLatestVersion(): Promise<string | null> {
  try {
    // 먼저 최신 버전을 찾기 위해 version.json 파일들을 확인
    // 실제 구현에서는 서버에서 버전 목록을 제공하거나
    // 빌드 시점에 최신 버전 정보를 포함하는 것이 좋음
    
    // 대안: Data Dragon API에서 최신 버전 가져오기
    // 하지만 정적 데이터가 있으면 그것을 우선 사용
    const versions = await getAvailableVersions();
    
    if (versions.length === 0) {
      return null;
    }

    const sorted = sortVersions(versions);
    return sorted[0] || null;
  } catch (error) {
    console.warn('[StaticData] Failed to get latest version:', error);
    return null;
  }
}

/**
 * 특정 버전의 정적 데이터가 존재하는지 확인
 */
export async function versionExists(version: string): Promise<boolean> {
  try {
    const versionUrl = getStaticDataPath(version, 'version.json');
    const response = await fetch(versionUrl);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 정적 데이터 경로 생성
 * Vite의 base path를 고려하여 경로 생성
 */
export function getStaticDataPath(version: string, ...paths: string[]): string {
  // Vite의 base path 가져오기 (프로덕션에서는 /cooldown/, 개발에서는 /)
  const basePath = import.meta.env.BASE_URL || '/';
  // base path가 /로 끝나지 않으면 / 추가
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${normalizedBase}data/${version}/${paths.join('/')}`;
}

/**
 * 버전 정보 가져오기
 */
export async function getVersionInfo(version: string): Promise<{ version: string } | null> {
  try {
    const versionUrl = getStaticDataPath(version, 'version.json');
    const response = await fetch(versionUrl);
    
    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn(`[StaticData] Failed to get version info for ${version}:`, error);
    return null;
  }
}

