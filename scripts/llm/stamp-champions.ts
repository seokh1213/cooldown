/**
 * 챔피언 지문을 찍는다
 *
 * 지문이 어긋났다는 것은 "노트를 다시 보라" 는 뜻이지 "틀렸다" 는 뜻이 아니다.
 * 사람이 그 챔피언의 노트를 읽고 고친 **뒤에** 이것을 돌려 지문을 새로 찍는다.
 *
 * 사용: npm run llm:stamp            (새로 생긴 챔피언만)
 *      npm run llm:stamp -- Anivia   (그 챔피언만 다시 찍는다)
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { ChampionCard } from "./lib/facts";
import { fingerprint, loadFingerprints, saveFingerprints } from "./lib/championFingerprint";

const patch = resolvePatchVersion();
const cardFile = path.join(PUBLIC_DATA_ROOT, patch, "llm", "champion-cards-ko_KR.json");
const cards = (JSON.parse(fs.readFileSync(cardFile, "utf8")) as { cards: ChampionCard[] }).cards;

const only = new Set(process.argv.slice(2));
const rows = loadFingerprints();
const added: string[] = [];
const restamped: string[] = [];

for (const card of cards) {
  const has = rows[card.id];
  if (has && only.size === 0) continue;
  if (has && !only.has(card.id)) continue;
  rows[card.id] = fingerprint(card, patch);
  (has ? restamped : added).push(card.id);
}

saveFingerprints(rows);
console.log(
  `지문 ${Object.keys(rows).length}종` +
    (added.length ? ` · 새로 찍음 ${added.length}종 (${added.slice(0, 8).join(", ")})` : "") +
    (restamped.length ? ` · 다시 찍음 ${restamped.join(", ")}` : ""),
);
