export function getRuntimeBasePath(): string {
  return import.meta.env?.BASE_URL || "/";
}

/**
 * 정적 데이터 경로 생성
 * Vite의 base path를 고려하여 경로 생성
 */
export function getStaticDataPath(version: string, ...paths: string[]): string {
  // Vite의 base path 가져오기 (프로덕션에서는 /cooldown/, 개발에서는 /)
  const basePath = getRuntimeBasePath();
  // base path가 /로 끝나지 않으면 / 추가
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${normalizedBase}data/${version}/${paths.join('/')}`;
}
