/**
 * 챔피언 직군 자료를 검사한다
 *
 * 목록 화면의 거르개가 이 값을 쓴다. 비면 거르개 자체가 사라지므로 조용히 망가진다.
 *
 * 라이엇의 `tags` 를 안 쓰는 까닭이 커버리지가 아니라 **해상도**다. 여섯 갈래뿐이라
 * 가렌과 야스오가 같은 Fighter 로 묶인다. 커뮤니티 위키는 열넷으로 갈라 두어
 * 가렌은 Juggernaut, 야스오는 Skirmisher 다. 그 구분이 실제로 살아 있는지 몇 명을
 * 집어 확인한다.
 *
 * 출처: League of Legends Wiki (Fandom) Module:ChampionData/data — CC BY-SA
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionIndexV2 } from "../src/data/contracts/championData";
import {
  enChampionProfile,
  koChampionProfile,
  zhChampionProfile,
} from "../src/i18n/championProfileTranslations";

const directory = path.join(process.cwd(), "public/data");
const patch = (JSON.parse(fs.readFileSync(path.join(directory, "version.json"), "utf8")) as { patchVersion: string }).patchVersion;

for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
  const file = path.join(directory, patch, "champions", locale, "index.json");
  const index = JSON.parse(fs.readFileSync(file, "utf8")) as ChampionIndexV2;
  const withRoles = index.champions.filter((champion) => (champion.subclasses?.length ?? 0) > 0);

  assert.ok(index.champions.length > 150, `${locale}: 챔피언이 ${index.champions.length}명뿐이다`);
  /*
   * 새 챔피언은 위키에 늦게 올라온다. 전원을 요구하면 출시 주간마다 CI 가 멈춘다.
   * 대신 **거의 다 있어야 한다**로 건다. 크게 떨어지면 수집이 깨진 것이다.
   */
  const ratio = withRoles.length / index.champions.length;
  assert.ok(ratio >= 0.9, `${locale}: 직군이 붙은 챔피언이 ${withRoles.length}/${index.champions.length} (${Math.round(ratio * 100)}%) 뿐이다`);

  const roles = new Set(withRoles.flatMap((champion) => champion.subclasses ?? []));
  assert.ok(roles.size >= 10, `${locale}: 갈래가 ${roles.size}종뿐이다. 하위 직군이 아니라 큰 분류가 들어온 것이다`);
}

// 라이엇 분류로는 못 가르는 구분이 실제로 살아 있는가.
const ko = JSON.parse(
  fs.readFileSync(path.join(directory, patch, "champions", "ko_KR", "index.json"), "utf8"),
) as ChampionIndexV2;
const roleOf = (id: string) => ko.champions.find((champion) => champion.id === id)?.subclasses ?? [];
assert.deepEqual(roleOf("Garen"), ["Juggernaut"], "가렌은 Juggernaut 이어야 한다");
assert.deepEqual(roleOf("Yasuo"), ["Skirmisher"], "야스오는 Skirmisher 이어야 한다");
assert.ok(roleOf("Nasus").includes("Juggernaut"), "나서스는 Juggernaut 이어야 한다");
// 한 챔피언이 둘에 걸치기도 한다. 거르개가 배열을 받는 근거다.
assert.ok(roleOf("Aurora").length >= 2, "오로라는 갈래가 둘 이상이어야 한다");

/*
 * 갈래 이름이 세 언어에 다 있어야 한다.
 *
 * 없으면 화면이 영문을 그대로 보인다. 빈칸보다는 낫지만 한국어 화면에 영문이 섞여
 * 나오는 것은 고장이다. 자료에 실제로 쓰인 갈래만 본다 — 위키가 새 갈래를 만들면
 * 여기서 먼저 걸린다.
 */
const usedRoles = [...new Set(ko.champions.flatMap((champion) => champion.subclasses ?? []))].sort();
for (const [locale, labels] of [
  ["ko_KR", koChampionProfile],
  ["zh_CN", zhChampionProfile],
] as const) {
  const missingNames = usedRoles.filter((role) => !labels.roleNames[role]);
  assert.deepEqual(missingNames, [], `${locale}: 갈래 이름이 없다`);
}
// 영어는 위키가 쓰는 말이 곧 영어라 옮길 것이 없다. 표가 비어 있는 것이 맞다.
assert.deepEqual(Object.keys(enChampionProfile.roleNames), [], "영어는 옮기지 않는다");

const covered = ko.champions.filter((champion) => (champion.subclasses?.length ?? 0) > 0).length;
console.log(`✅ 챔피언 직군 통과 (${covered}/${ko.champions.length}명 · 로케일 3종)`);
