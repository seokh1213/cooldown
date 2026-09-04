/**
 * 아이템 역할군 분류 점검 도구
 *
 * 분류기가 실제 데이터를 어떻게 나누는지 눈으로 확인한다.
 * 사용:
 *   npm run llm:items                      # 역할군별 목록
 *   npm run llm:items -- --name 죽음의     # 특정 아이템 판정
 *   npm run llm:items -- --champion Aatrox # 챔피언 선호 역할군과 추천 풀
 */
import { loadStaticData } from "./lib/data";
import { createChampionCardBuilder } from "./lib/facts";
import {
  ARCHETYPE_LABEL,
  championBuildProfile,
  classifyItem,
  type ItemArchetype,
} from "./lib/itemArchetype";

const ORDER: ItemArchetype[] = [
  "bruiser",
  "tank",
  "mage",
  "battlemage",
  "marksman",
  "assassin",
  "enchanter",
  "utility",
  "boots",
  "starter",
  "component",
  "jungle",
  "consumable",
  "trinket",
];

function main() {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const data = loadStaticData("ko_KR");
  const rift = data.items.items.filter(
    (i) => i.availableOnMap11 && i.purchasable !== false && i.inStore !== false,
  );

  const nameQuery = get("--name");
  if (nameQuery) {
    for (const item of rift.filter((i) => i.name.includes(nameQuery))) {
      const c = classifyItem(item);
      console.log(
        `${item.name} (${item.priceTotal}G) [${c.tier}] → ${c.archetypes.map((a) => ARCHETYPE_LABEL[a]).join(", ") || "미분류"}${c.functions.length ? ` | 기능: ${c.functions.join(", ")}` : ""}`,
      );
      console.log(`  스탯: ${item.stats.map((s) => `${s.stat} ${s.value}`).join(", ")}`);
    }
    return;
  }

  const championQuery = get("--champion");
  if (championQuery) {
    const builder = createChampionCardBuilder(data.champions, data.riotMeta, data.wikiMeta);
    const found = builder.find(championQuery);
    if (!found) throw new Error(`챔피언 부재: ${championQuery}`);
    const card = builder.build(found.id);
    if (!card) throw new Error("카드 생성 실패");
    const profile = championBuildProfile({
      roleTags: card.roleTags,
      scaling: card.scalingProfile.primary,
      rangeType: card.rangeType,
      hasPhysicalSpell: card.spells.some((s) => s.damageTypes.includes("물리")),
      riot: card.riot,
      wikiSubclass: card.wiki?.subclass,
    });
    console.log(
      `${card.name} — 역할 ${card.roleTags.join("/") || "미상"}, 계수 ${card.scalingProfile.primary}, ${card.rangeType}`,
    );
    console.log(`빌드 성향: ${profile.label}`);
    console.log(`선호 역할군: ${profile.preferred.map((a) => ARCHETYPE_LABEL[a]).join(" > ")}`);
    console.log(`제외 역할군: ${profile.excluded.map((a) => ARCHETYPE_LABEL[a]).join(", ")}`);
    const legendary = rift
      .map((item) => ({ item, c: classifyItem(item) }))
      .filter(({ c }) => c.tier === "legendary")
      .filter(({ c }) => c.archetypes.some((a) => profile.preferred.includes(a)))
      .filter(({ c }) => !c.archetypes.some((a) => profile.excluded.includes(a)))
      .sort((a, b) => a.item.priceTotal - b.item.priceTotal);
    console.log(`\n추천 가능한 전설 아이템 ${legendary.length}종:`);
    for (const { item, c } of legendary) {
      console.log(
        `  ${item.name.padEnd(16)} ${String(item.priceTotal).padStart(4)}G  ${c.archetypes.map((a) => ARCHETYPE_LABEL[a]).join(",")}${c.functions.length ? ` | ${c.functions.join(",")}` : ""}`,
      );
    }
    return;
  }

  // 기본: 역할군별 분포와 목록
  const byArchetype = new Map<ItemArchetype, string[]>();
  const unclassified: string[] = [];
  for (const item of rift) {
    const c = classifyItem(item);
    if (c.archetypes.length === 0) unclassified.push(`${item.name}(${item.priceTotal}G)`);
    for (const a of c.archetypes) {
      if (!byArchetype.has(a)) byArchetype.set(a, []);
      byArchetype.get(a)!.push(`${item.name}(${item.priceTotal}G)`);
    }
  }
  console.log(`협곡 아이템 ${rift.length}종 분류\n`);
  for (const a of ORDER) {
    const list = byArchetype.get(a);
    if (!list) continue;
    console.log(`## ${ARCHETYPE_LABEL[a]} (${list.length})`);
    console.log(`  ${list.join(", ")}\n`);
  }
  if (unclassified.length) {
    console.log(`## 미분류 (${unclassified.length})`);
    console.log(`  ${unclassified.join(", ")}`);
  }
}

main();
