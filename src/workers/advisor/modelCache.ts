import { env } from "@huggingface/transformers";
import { readLargeFile, writeLargeFile } from "@/lib/advisor/largeFileCache";

/**
 * transformers.js 의 캐시를 우리가 맡는다. 두 가지 일이다.
 *
 * 1. 그래프만 바꿔 끼운다(`spec.graph`). `…/onnx/model_q4.onnx` 를 찾으면 우리 사이트의 그래프(kev LoRA 를 덧붙인 것,
 *    약 22MB)를 내주고, 나머지(가중치 550MB·토큰화기)는 원래대로 받는다. 새로 올리는 것은 변경분뿐이다.
 * 2. Cache Storage 가 받지 못한 큰 파일은 OPFS 에 둔다(`largeFileCache.ts`). 550MB 한 덩어리를 넣다가 실패해
 *    방문할 때마다 다시 받는 브라우저가 있었다.
 */
export function installCache(graph: string | undefined) {
  const url = graph ? new URL(graph, self.location.origin + import.meta.env.BASE_URL).href : undefined;
  const isGraph = (key: string) => Boolean(url) && /\/onnx\/model_q4\.onnx$/.test(key);
  const keyOf = (request: string | Request) => (typeof request === "string" ? request : request.url);
  env.useCustomCache = true;
  env.customCache = {
    async match(request: string | Request) {
      const key = keyOf(request);
      if (isGraph(key)) {
        // 그래프도 캐시에 둔다(주소에 판이 붙어 있어 바뀌면 새로 받는다). 안 두면 적재마다 22MB 를 두 번 받았다.
        const cache = await caches.open(env.cacheKey);
        const hit = await cache.match(url!).catch(() => undefined);
        if (hit) return hit;
        const response = await fetch(url!);
        if (response.ok) {
          await cache.put(url!, response.clone()).catch(() => undefined);
          void pruneOldGraphs(cache, url!);
        }
        return response;
      }
      const hit = await (await caches.open(env.cacheKey)).match(request).catch(() => undefined);
      return hit ?? (await readLargeFile(key));
    },
    async put(request: string | Request, response: Response) {
      const key = keyOf(request);
      if (isGraph(key)) return;
      try {
        await (await caches.open(env.cacheKey)).put(request, response.clone());
      } catch {
        await writeLargeFile(key, new Uint8Array(await response.arrayBuffer()));
      }
    },
  } as unknown as typeof env.customCache;
}

/**
 * 다른 판의 kev 그래프를 캐시에서 지운다. 그래프 주소에 판이 붙어 있어(b3-v2 → b3e) 새 판을 받아도 옛 판(22~44MB)이 남았다.
 */
async function pruneOldGraphs(cache: Awaited<ReturnType<typeof caches.open>>, current: string) {
  try {
    for (const request of await cache.keys()) {
      if (request.url !== current && /\/models\/kev\/[^/]+\/model_q4\.onnx$/.test(request.url)) await cache.delete(request);
    }
  } catch {
    // 못 지워도 동작에는 지장이 없다
  }
}
