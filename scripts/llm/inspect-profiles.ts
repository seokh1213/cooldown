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
  const builder = createChampionCardBuilder(data.champions);
  const ids = showAll ? data.champions.map((c) => c.id) : SAMPLE;

  console.log(
    `${"챔피언".padEnd(10)}${"역할 태그".padEnd(20)}${"계수".padEnd(6)}${"사거리".padEnd(7)}빌드 성향 → 선호 역할군`,
  );
  for (const id of ids) {
    const card = builder.build(id);
    if (!card) continue;
    const profile = championBuildProfile({
      roleTags: card.roleTags,
      scaling: card.scalingProfile.primary,
      rangeType: card.rangeType,
      hasPhysicalSpell: card.spells.some((s) => s.damageTypes.includes("물리")),
    });
    const combat = profile.preferred.filter(
      (a) => !["boots", "starter", "component"].includes(a),
    );
    console.log(
      `${card.name.padEnd(10)}${card.roleTags.join("/").padEnd(20)}${card.scalingProfile.primary.padEnd(6)}${card.rangeType.padEnd(7)}${profile.label} → ${combat.map((a) => ARCHETYPE_LABEL[a]).join(" > ")}`,
    );
  }
}

main();
