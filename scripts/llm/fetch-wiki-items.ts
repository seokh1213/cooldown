/**
 * LoL Wiki(Fandom) 아이템 상점 분류 수집
 *
 * 상점의 역할군 탭(브루저·탱커·메이지·원거리 딜러·암살자·서포터)은 라이엇 데이터에 없지만
 * 위키의 `Module:ItemData/data` 가 `menu` 필드로 관리한다. 우리가 스탯으로 추정하던 것의 정답이다.
 *
 *   menu      : fighter, tank, mage, marksman, assassin, support, movement,
 *               "onhit effects", "lifesteal vamp", "armor pen", "magic pen",
 *               "health and reg", "mana and reg", "ability power", "attack damage", "attack speed"
 *   type      : Legendary, Epic, Basic, Starter, Boots, Consumable, Trinket, Prismatic(아레나) …
 *   itemlimit : 동시 보유 제한 그룹 (예: Hydra)
 *   nickname  : 별칭 (예: 무한의 대검 = "ie")
 *
 * 아이템 이름은 영문이지만 `id` 가 있어 우리 한국어 데이터와 숫자 id 로 대응된다.
 *
 * 출처: League of Legends Wiki (Fandom) Module:ItemData/data — CC BY-SA
 * 출력: public/data/<patch>/llm/item-wiki-meta.json
 * 사용: npm run llm:fetch-wiki-items
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT } from "./lib/data";
import {
  luaNumber,
  luaString,
  luaStringArray,
  luaTrueKeys,
  splitTopLevelBlocks,
} from "./lib/luaTable";

const MODULE_URL =
  "https://leagueoflegends.fandom.com/api.php?action=parse&page=Module:ItemData/data&prop=wikitext&format=json&formatversion=2";

export interface WikiItemMeta {
  /** 우리 데이터의 아이템 id (숫자 문자열) */
  id: string;
  /** 위키의 영문 이름 */
  englishName: string;
  /** 상점 역할군 탭 */
  menu: string[];
  /** Legendary | Epic | Basic | Starter | Boots | Consumable | Trinket … */
  types: string[];
  /** 동시 보유 제한 그룹 */
  itemLimit?: string;
  nicknames: string[];
}

export interface WikiItemMetaFile {
  schemaVersion: 1;
  patch: string;
  source: string;
  license: string;
  fetchedAt: string;
  items: WikiItemMeta[];
}

async function main() {
  const data = loadStaticData("ko_KR");
  console.log(`패치 ${data.patch} / 협곡 아이템 대상`);
  console.log("LoL Wiki(Fandom) Module:ItemData/data 수집…");

  const res = await fetch(MODULE_URL, {
    headers: { "User-Agent": "cooldown-llm-advisor/1.0 (research)" },
  });
  if (!res.ok) throw new Error(`위키 응답 오류 ${res.status}`);
  const parsed = (await res.json()) as { parse?: { wikitext?: string } };
  const wikitext = parsed.parse?.wikitext;
  if (!wikitext) throw new Error("wikitext 부재");
  console.log(`  원문 ${wikitext.length}자`);

  const blocks = splitTopLevelBlocks(wikitext);
  console.log(`  블록 ${blocks.length}개`);

  const byId = new Map<string, WikiItemMeta>();
  for (const { name, body } of blocks) {
    const id = luaNumber(body, "id");
    if (id === undefined) continue;
    byId.set(String(id), {
      id: String(id),
      englishName: name,
      menu: luaTrueKeys(body, "menu"),
      types: luaStringArray(body, "type"),
      itemLimit: luaString(body, "itemlimit"),
      nicknames: luaStringArray(body, "nickname"),
    });
  }
  console.log(`  id 보유 아이템 ${byId.size}개`);

  const items: WikiItemMeta[] = [];
  const unmatched: string[] = [];
  for (const item of data.items.items) {
    const meta = byId.get(item.id);
    if (meta) items.push(meta);
    else if (item.availableOnMap11 && item.inStore !== false) unmatched.push(`${item.name}(${item.id})`);
  }

  const outDir = path.join(PUBLIC_DATA_ROOT, data.patch, "llm");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "item-wiki-meta.json");
  const file: WikiItemMetaFile = {
    schemaVersion: 1,
    patch: data.patch,
    source: "League of Legends Wiki (Fandom), Module:ItemData/data",
    license: "CC BY-SA 3.0",
    fetchedAt: new Date().toISOString(),
    items: items.sort((a, b) => Number(a.id) - Number(b.id)),
  };
  fs.writeFileSync(outFile, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`생성: ${path.relative(process.cwd(), outFile)} (${items.length}개)`);

  const menus = new Map<string, number>();
  const types = new Map<string, number>();
  for (const it of items) {
    for (const m of it.menu) menus.set(m, (menus.get(m) ?? 0) + 1);
    for (const t of it.types) types.set(t, (types.get(t) ?? 0) + 1);
  }
  const fmt = (m: Map<string, number>) =>
    [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");
  console.log(`\n상점 역할군: ${fmt(menus)}`);
  console.log(`등급: ${fmt(types)}`);
  if (unmatched.length) {
    console.log(`\n위키에서 못 찾은 협곡 아이템 ${unmatched.length}개: ${unmatched.slice(0, 20).join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
