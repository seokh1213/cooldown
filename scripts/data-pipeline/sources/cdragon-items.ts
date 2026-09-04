export interface CommunityDragonItem {
  id: number;
  name: string;
  description: string;
  active?: boolean;
  inStore?: boolean;
  from?: number[];
  to?: number[];
  categories?: string[];
  maxStacks?: number;
  requiredChampion?: string;
  requiredAlly?: string;
  requiredBuffCurrencyName?: string;
  requiredBuffCurrencyCost?: number;
  specialRecipe?: number;
  isEnchantment?: boolean;
  price?: number;
  priceTotal?: number;
  displayInItemSets?: boolean;
  iconPath?: string;
}

function sourceLocale(locale: string): string {
  if (locale === "ko_KR") return "ko_kr";
  if (locale === "zh_CN") return "zh_cn";
  return "default";
}

export async function fetchCDragonItems(
  locale: string,
  cdragonVersion: string,
): Promise<CommunityDragonItem[]> {
  const source = sourceLocale(locale);
  const url =
    `https://raw.communitydragon.org/${cdragonVersion}/plugins/` +
    `rcp-be-lol-game-data/global/${source}/v1/items.json`;
  console.log(`Fetching exact CDragon items (${source}): ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `[CD][Items] ${source} missing from ${cdragonVersion}: HTTP ${response.status}`,
    );
  }
  const json = (await response.json()) as unknown;
  if (!Array.isArray(json)) throw new Error(`[CD][Items] Invalid ${source} response`);
  return json as CommunityDragonItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function mergeCDragonItems(
  ddragonData: unknown,
  cdragonItems: CommunityDragonItem[],
): Record<string, unknown> {
  if (!isRecord(ddragonData) || !isRecord(ddragonData.data)) {
    throw new Error("Invalid DDragon item response");
  }
  const cdragonById = new Map(
    cdragonItems.map((item) => [String(item.id), item]),
  );
  const data = Object.fromEntries(
    Object.entries(ddragonData.data).map(([id, rawItem]) => {
      if (!isRecord(rawItem)) return [id, rawItem];
      const cdragon = cdragonById.get(id);
      if (!cdragon) return [id, rawItem];
      return [id, {
        ...rawItem,
        cdragon: { ...cdragon },
        ...(typeof cdragon.inStore === "boolean"
          ? { inStore: cdragon.inStore }
          : {}),
      }];
    }),
  );
  return { ...ddragonData, data };
}
