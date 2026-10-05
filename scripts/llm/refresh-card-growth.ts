/** 원본 성장치만 기존 카드에 붙인다. 스킬 본문·검수된 노트는 그대로 보존한다. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ChampionCard, StatName } from "../../src/lib/knowledge/facts";
import type { ChampionRecord } from "../../src/lib/knowledge/sourceRecords";
import { loadStaticData, PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

export function attachStatGrowth(cards: ChampionCard[], champions: ChampionRecord[]): number {
  const byId = new Map(champions.map(champion => [champion.id, champion]));
  let changed = 0;
  for (const card of cards) {
    const champion = byId.get(card.id);
    if (!champion) throw new Error(`${card.id}: 성장치 원본 없음`);
    for (const stat of Object.keys(card.stats) as StatName[]) {
      const growth = champion.baseStats[stat]?.perLevel;
      if (growth === undefined || !Number.isFinite(growth)) throw new Error(`${card.id}.${stat}: 잘못된 성장치`);
      if (card.stats[stat].perLevel === growth) continue;
      card.stats[stat].perLevel = growth;
      changed += 1;
    }
  }
  return changed;
}

function main() {
  const patch = resolvePatchVersion();
  for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) {
    const file = path.join(PUBLIC_DATA_ROOT, patch, "llm", `champion-cards-${lang}.json`);
    if (!fs.existsSync(file)) continue;
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { patch: string; generatedAt: string; cards: ChampionCard[] };
    if (data.patch !== patch) throw new Error(`${lang}: 카드 패치 불일치`);
    const changed = attachStatGrowth(data.cards, loadStaticData(lang, patch).champions);
    if (changed > 0) {
      data.generatedAt = new Date().toISOString();
      fs.writeFileSync(file, JSON.stringify(data));
    }
    console.log(`${lang}: 성장치 ${changed}건 갱신`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
