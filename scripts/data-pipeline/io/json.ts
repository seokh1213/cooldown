import fs from "node:fs";
import path from "node:path";

/**
 * JSON 을 받아온다.
 *
 * CDragon 은 짧은 시간에 많이 부르면 연결을 끊는다(ECONNRESET / terminated).
 * 한 번 실패로 전체 생성이 죽지 않도록 지수 백오프로 물러섰다 다시 시도한다.
 * 4xx 는 재시도해도 같은 결과라 바로 던진다.
 */
export async function fetchJson<T>(url: string, retries = 4): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      console.log(`Fetching: ${url}${attempt > 0 ? ` (retry ${attempt})` : ""}`);
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${url}`);
        // 404 같은 클라이언트 오류는 재시도 대상이 아니다
        if (response.status >= 400 && response.status < 500) throw error;
        throw Object.assign(error, { retryable: true });
      }
      return (await response.json()) as T;
    } catch (error) {
      const isClientError =
        error instanceof Error &&
        /^HTTP 4\d\d:/.test(error.message) &&
        !(error as { retryable?: boolean }).retryable;
      if (isClientError || attempt === retries - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

export async function writeJson(data: unknown, filePath: string): Promise<void> {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  console.log(`Saved: ${filePath}`);
}
