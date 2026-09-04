/**
 * 챔피언 빌드 성향 판정 점검
 *
 * 역할 태그와 계수 프로필로 정한 아이템 풀이 상식과 맞는지 눈으로 확인한다.
 * 사용: npm run llm:profiles [-- --all]
 */
import { loadStaticData } from "./lib/data";
import { createChampionCardBuilder } from "./lib/facts";
import { ARCHETYPE_LABEL, championBuildProfile } from "./lib/itemArchetype";

const SAMPLE = [
  "Fiora",
  "Camille",
  "Jax",
  "Aatrox",
  "Garen",
  "Darius",
  "Renekton",
  "Malphite",
  "Ornn",
  "Singed",
  "Ahri",
  "Zed",
  "Caitlyn",
  "Teemo",
  "Kayle",
  "Quinn",
  "Thresh",
  "Braum",
  "Yasuo",
  "Nasus",
  "Gwen",
  "Sett",
];

function main() {
  const showAll = process.argv.includes("--all");
  const data = loadStaticData("ko_KR");
  const builder = createChampionCardBuilder(data.champions, data.riotMeta, data.wikiMeta);
  const ids = showAll ? data.champions.map((c) => c.id) : SAMPLE;

  console.log(
    `${"챔피언".padEnd(10)}${"클래스(위키)".padEnd(20)}${"하위 클래스".padEnd(14)}${"피해".padEnd(6)}${"포지션".padEnd(14)}빌드 성향 → 선호 역할군`,
  );
  for (const id of ids) {
    const card = builder.build(id);
    if (!card) continue;
    const profile = championBuildProfile({
      roleTags: card.roleTags,
      scaling: card.scalingProfile.primary,
      rangeType: card.rangeType,
      hasPhysicalSpell: card.spells.some((s) => s.damageTypes.includes("물리")),
      riot: card.riot,
      wikiSubclass: card.wiki?.subclass,
    });
    const combat = profile.preferred.filter(
      (a) => !["boots", "starter", "component"].includes(a),
    );
    console.log(
      `${card.name.padEnd(10)}${`${card.wiki?.heroType ?? "?"}/${card.wiki?.altType ?? "-"}`.padEnd(20)}${(card.wiki?.subclass ?? "-").padEnd(14)}${(card.riot?.damageType ?? card.scalingProfile.primary).padEnd(6)}${(card.wiki?.positions.join(",") ?? "-").padEnd(14)}${profile.label} → ${combat.map((a) => ARCHETYPE_LABEL[a]).join(" > ")}`,
    );
  }
}

main();
