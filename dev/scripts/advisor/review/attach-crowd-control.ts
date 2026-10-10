/** 스킬 본문/수치를 재생성하지 않고 세 언어의 현행 카드에 CC 메타데이터만 붙인다. */
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "../lib/data";
import { attachCrowdControl } from "../lib/crowdControl";
import type { ChampionCardFile } from "../knowledge/build-knowledge";

const patch = resolvePatchVersion();
const korean = JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", "champion-cards-ko_KR.json"), "utf8")) as ChampionCardFile;
for (const lang of ["ko_KR", "en_US", "zh_CN"]) {
  const file = path.join(PUBLIC_DATA_ROOT, patch, "llm", `champion-cards-${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as ChampionCardFile;
  attachCrowdControl(data.cards, patch, korean.cards);
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(`${lang}: ${data.cards.length} champions, ${data.cards.flatMap(card => card.spells).length} abilities`);
}
