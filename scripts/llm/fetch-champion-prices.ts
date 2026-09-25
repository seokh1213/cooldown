/**
 * 챔피언 가격(블루 정수·RP)을 공식 위키의 챔피언 데이터 모듈에서 받아 둔다.
 *
 * Data Dragon 에는 가격이 없다. 위키 `Module:ChampionData/data` 가 챔피언마다 `be`·`rp` 를 들고 있고
 * `apiname` 이 Data Dragon id 와 같다. 도우미가 "아리 가격 얼마야?" 에 이 값으로 답한다(`gameMeta.ts`).
 *
 * 사용: npx tsx scripts/llm/fetch-champion-prices.ts
 *   → knowledge/champion-prices.json
 */
import * as fs from "node:fs";
import * as path from "node:path";

const API = "https://wiki.leagueoflegends.com/en-us/api.php";
const USER_AGENT = "cooldown-knowledge/1.0 (champion prices)";
const OUT = path.resolve(import.meta.dirname, "../../knowledge/champion-prices.json");

async function main() {
  const url = new URL(API);
  for (const [k, v] of Object.entries({ action: "query", prop: "revisions", rvprop: "content|timestamp", rvslots: "main", format: "json", formatversion: "2", titles: "Module:ChampionData/data" })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`wiki ${res.status}`);
  const page = ((await res.json()) as { query: { pages: Array<{ revisions: Array<{ timestamp: string; slots: { main: { content: string } } }> }> } }).query.pages[0];
  const lua = page.revisions[0].slots.main.content;
  const prices: Record<string, { be: number; rp: number }> = {};
  // 챔피언 하나 = `["이름"] = { … }` 한 덩어리. apiname·be·rp 를 그 안에서 찾는다.
  for (const block of lua.split(/\n {2}\["[^"]+"\]\s*=\s*\{/).slice(1)) {
    const api = /\["apiname"\]\s*=\s*"([^"]+)"/.exec(block)?.[1];
    const be = /\["be"\]\s*=\s*(\d+)/.exec(block)?.[1];
    const rp = /\["rp"\]\s*=\s*(\d+)/.exec(block)?.[1];
    if (api && be && rp) prices[api] = { be: Number(be), rp: Number(rp) };
  }
  const out = {
    note: "공식 위키 Module:ChampionData/data 의 be·rp. 새 챔피언은 나온 지 얼마 동안 비싸고 나중에 내려간다.",
    source: "https://wiki.leagueoflegends.com/en-us/Module:ChampionData/data",
    revision: page.revisions[0].timestamp,
    fetchedAt: new Date().toISOString(),
    prices,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`${Object.keys(prices).length}명 → ${path.relative(process.cwd(), OUT)}`);
}

void main();
