/**
 * 챔피언 이름 색인 — 세 언어 이름을 한 곳에
 *
 * 도우미는 화면 언어의 카드만 받는다. 그런데 한국어 화면에서 "How do I play Yasuo into
 * Malphite?" 처럼 영어 이름으로 묻는 사람이 있다. 카드에는 "야스오" 만 있어 이름을 못
 * 찾았고, 질문이 자료 없이 검색으로 빠졌다. 카드 세 벌을 다 받으면 2.8MB 라, 이름만
 * 뽑아 둔다.
 *
 * 사용: npx tsx scripts/llm/build-champion-names.ts
 * 출력: public/data/<patch>/llm/champion-names.json  { id: [ko, en, zh] }
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

const patch = resolvePatchVersion();
const dir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const names: Record<string, string[]> = {};
for (const lang of ["ko_KR", "en_US", "zh_CN"]) {
  const cards = (JSON.parse(fs.readFileSync(path.join(dir, `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards;
  for (const card of cards) (names[card.id] ??= []).push(card.name);
}
const out = path.join(dir, "champion-names.json");
fs.writeFileSync(out, JSON.stringify({ patch, names }), "utf8");
console.log(`생성: ${path.relative(process.cwd(), out)} (${Object.keys(names).length} 챔피언, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
