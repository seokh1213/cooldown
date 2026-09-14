/**
 * 지금 화면에 무엇이 떠 있는지
 *
 * 도우미는 화면 오른쪽에 붙어 있는 도구다. 사용자가 말파이트 쿨타임 표를 보면서
 * "W 쿨타임" 이라고 물으면 그 W 는 말파이트의 W 다. 이름을 다시 치게 하면 도구가 아니라
 * 별개의 챗봇이 된다.
 *
 * 화면마다 선택 상태가 다른 곳에 있다.
 *   쿨타임 표   선택 챔피언이 localStorage 에 남는다
 *   VS 비교    URL 의 a(내 챔피언)·t(상대)
 *   백과사전   URL 의 tab
 * 여기서 한 구조로 모은다. 순수 함수라 테스트에서 저장소를 갈아 끼울 수 있다.
 */
import { APP_STORAGE_KEYS, decodeSelectedChampions, readStorage } from "@/data/storage/appStorage";

export type PageRoute = "cooldown" | "vs" | "encyclopedia" | "simulation" | "other";

export interface PageContext {
  route: PageRoute;
  /** 화면에 떠 있는 챔피언 id. VS 는 [내 챔피언, 상대] 순서다. */
  championIds: string[];
  /** 백과사전 탭 (champions·runes·items·summoner·formulas) */
  tab?: string;
}

function routeOf(pathname: string): PageRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "cooldown";
  if (path.endsWith("/vs")) return "vs";
  if (path.endsWith("/encyclopedia")) return "encyclopedia";
  if (path.endsWith("/simulation")) return "simulation";
  return "other";
}

/** 쿨타임 표가 저장해 둔 선택 챔피언. 깨진 값이면 빈 목록. */
function cooldownChampions(read: (key: string) => string | null): string[] {
  const raw = read(APP_STORAGE_KEYS.selectedChampions);
  if (!raw) return [];
  try {
    const decoded = decodeSelectedChampions(JSON.parse(raw));
    return decoded ? decoded.map((entry) => entry.id) : [];
  } catch {
    return [];
  }
}

export function readPageContext(
  pathname: string,
  search: string,
  read: (key: string) => string | null = (key) => readStorage(key),
): PageContext {
  const route = routeOf(pathname);
  const params = new URLSearchParams(search);

  if (route === "cooldown") return { route, championIds: cooldownChampions(read) };
  if (route === "vs") {
    const ids = [params.get("a"), params.get("t")].filter((id): id is string => Boolean(id));
    return { route, championIds: ids };
  }
  if (route === "encyclopedia") {
    return { route, championIds: [], tab: params.get("tab") ?? "champions" };
  }
  return { route, championIds: [] };
}
