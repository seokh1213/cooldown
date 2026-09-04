import { getRuntimeBasePath } from "@/lib/staticDataUtils";

export interface StaticDataClient {
  getJson(path: string): Promise<unknown>;
}

export function createStaticDataClient(
  fetchJson: typeof fetch = fetch,
  basePath: string = getRuntimeBasePath()
): StaticDataClient {
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return {
    async getJson(path: string): Promise<unknown> {
      const response = await fetchJson(`${normalizedBase}${path.replace(/^\//, "")}`);
      if (!response.ok) {
        throw new Error(`Static data request failed (${response.status}): ${path}`);
      }
      return response.json();
    },
  };
}
