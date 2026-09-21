/**
 * 내려받은 모델 캐시를 재고 지운다
 *
 * 모델은 3GB 다. 한 번 받으면 브라우저 저장 공간에 남아 두 번째 방문부터는 안 받는데,
 * 그 말은 **안 쓰기로 해도 3GB 가 계속 남는다**는 뜻이다. 지울 길이 없으면
 * 브라우저 설정에서 사이트 데이터를 통째로 지우는 수밖에 없고, 그러면 다른 설정도
 * 같이 날아간다.
 *
 * Transformers.js 는 Cache Storage 에 넣는다. 이름은 라이브러리가 정한 값이라
 * 판올림 때 바뀔 수 있으므로 **이름을 박아 두지 않고** 접두사로 찾는다.
 */

/** Transformers.js 가 쓰는 캐시 이름의 앞부분. `transformers-cache` 와 해시 캐시가 걸린다. */
const CACHE_PREFIX = "transformers";

export interface ModelCacheInfo {
  /** 캐시에 들어 있는 파일 수. 0 이면 내려받은 것이 없다. */
  entries: number;
  /** 실제로 차지하는 용량. 잴 수 없는 브라우저도 있어 없을 수 있다. */
  bytes?: number;
  /**
   * 어느 저장소의 파일이 들어 있는가. `onnx-community/Qwen3.5-0.8B-Text-ONNX` 꼴이다.
   *
   * 용량만 보여 주면 "1,734MB 가 있다" 는 알아도 **무엇이** 있는지는 모른다. 고른
   * 모델과 실제로 받아 둔 모델이 다를 수 있으므로(받다 만 경우) 캐시에서 직접 읽는다.
   */
  repos: string[];
}

/**
 * 요청 주소에서 저장소 이름을 꺼낸다.
 *
 * 두 가지 꼴로 들어온다. 가중치는 `huggingface.co/<소유자>/<이름>/resolve/…` 이고,
 * 토크나이저 같은 작은 파일은 `…/api/resolve-cache/models/<소유자>/<이름>/<sha>/…` 다.
 */
function repoFromUrl(url: string): string | undefined {
  const cached = /resolve-cache\/models\/([^/]+\/[^/]+)\//.exec(url);
  if (cached) return cached[1];
  const direct = /huggingface\.co\/([^/]+\/[^/]+)\/resolve\//.exec(url);
  return direct?.[1];
}

function cacheStorage(): CacheStorage | undefined {
  try {
    return typeof caches === "undefined" ? undefined : caches;
  } catch {
    // 보안 컨텍스트가 아니면 접근 자체가 던진다
    return undefined;
  }
}

async function modelCacheNames(): Promise<string[]> {
  const store = cacheStorage();
  if (!store) return [];
  try {
    return (await store.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
  } catch {
    return [];
  }
}

/**
 * 캐시에 무엇이 얼마나 있는지 잰다.
 *
 * 용량은 응답 본문을 실제로 읽어 더한다. `Content-Length` 는 캐시된 응답에 없을 때가
 * 있어서 믿을 수 없다. 파일이 수십 개라 한 번에 다 읽으면 메모리가 튀므로 순서대로 센다.
 */
export async function readModelCache(): Promise<ModelCacheInfo> {
  const store = cacheStorage();
  const names = await modelCacheNames();
  if (!store || names.length === 0) return { entries: 0, repos: [] };

  let entries = 0;
  let bytes = 0;
  let measured = true;
  const repos = new Set<string>();

  for (const name of names) {
    try {
      const cache = await store.open(name);
      const requests = await cache.keys();
      entries += requests.length;
      for (const request of requests) {
        const repo = repoFromUrl(request.url);
        if (repo) repos.add(repo);
        const response = await cache.match(request);
        if (!response) continue;
        const blob = await response.clone().blob();
        bytes += blob.size;
      }
    } catch {
      measured = false;
    }
  }

  return { entries, bytes: measured ? bytes : undefined, repos: [...repos] };
}

/**
 * 내려받은 모델을 지운다.
 *
 * 지운 뒤에는 다시 받아야 하므로, 부르는 쪽에서 동의 상태와 워커도 함께 되돌려야 한다.
 * 여기서는 저장된 것만 치운다.
 */
export async function deleteModelCache(): Promise<boolean> {
  const store = cacheStorage();
  const names = await modelCacheNames();
  if (!store || names.length === 0) return false;

  let removed = false;
  for (const name of names) {
    try {
      if (await store.delete(name)) removed = true;
    } catch {
      // 하나가 실패해도 나머지는 지운다
    }
  }
  return removed;
}
