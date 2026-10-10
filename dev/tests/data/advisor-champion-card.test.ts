import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { getTranslations } from "../../../src/shared/i18n";
import type { ChampionCard, StatName } from "../../../src/domain/knowledge/facts";
import { loadStaticData, PUBLIC_DATA_ROOT, resolvePatchVersion } from "../../scripts/advisor/lib/data";

const patch = resolvePatchVersion();
for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) {
  const cards = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards;
  const source = loadStaticData(lang, patch);
  test(`${lang}: 모든 카드의 성장치가 원본과 같고 역할군은 공식 분류다`, () => {
    assert.equal(cards.length, source.champions.length);
    const byId = new Map(source.champions.map(champion => [champion.id, champion]));
    const roleNames = getTranslations(lang).championProfile.roleNames;
    for (const card of cards) {
      for (const stat of Object.keys(card.stats) as StatName[]) {
        assert.equal(card.stats[stat].perLevel, byId.get(card.id)!.baseStats[stat].perLevel, `${card.id}.${stat}`);
      }
      assert.ok(card.roleTags.length > 0, card.id);
      assert.ok(card.roleTags.every(role => roleNames[role.toLowerCase()]), card.id);
    }
  });
}
