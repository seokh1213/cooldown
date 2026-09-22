/**
 * 챔피언 역할군 자료를 검사한다
 *
 * 목록 화면의 거르개가 이 값을 쓴다. 비면 거르개 자체가 사라지므로 조용히 망가진다.
 *
 * 라이엇 공식 여섯 갈래를 쓴다 — 클라이언트가 보여 주는 것 그대로다. 한때 커뮤니티
 * 위키의 하위 직군 열넷을 썼는데 가르는 눈은 더 밝지만 칸이 잘게 쪼개져 거르개로
 * 쓸모가 없었다(Artillery 7명, Mage 1명 하는 식이었다).
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

/** 라이엇이 쓰는 여섯 갈래. 여기 없는 값이 들어오면 자료가 바뀐 것이다. */
const OFFICIAL = ["assassin", "fighter", "mage", "marksman", "support", "tank"];

function load(locale: string): ChampionIndexV2 {
  return JSON.parse(
    fs.readFileSync(path.join(directory, patch, "champions", locale, "index.json"), "utf8"),
  ) as ChampionIndexV2;
}

for (const locale of ["ko_KR", "en_US", "zh_CN"]) {
  const index = load(locale);
  const withRoles = index.champions.filter((champion) => (champion.roles?.length ?? 0) > 0);

  assert.ok(index.champions.length > 150, `${locale}: 챔피언이 ${index.champions.length}명뿐이다`);
  /*
   * 새 챔피언은 메타에 늦게 올라오기도 한다. 전원을 요구하면 출시 주간마다 CI 가
   * 멈추므로 9할로 건다. 크게 떨어지면 수집이 깨진 것이다.
   */
  const ratio = withRoles.length / index.champions.length;
  assert.ok(ratio >= 0.9, `${locale}: 역할군이 붙은 챔피언이 ${withRoles.length}/${index.champions.length} (${Math.round(ratio * 100)}%) 뿐이다`);

  const seen = [...new Set(withRoles.flatMap((champion) => champion.roles ?? []))].sort();
  assert.deepEqual(seen, OFFICIAL, `${locale}: 공식 여섯 갈래가 아니다`);
}

const ko = load("ko_KR");
const rolesOf = (id: string) => ko.champions.find((champion) => champion.id === id)?.roles ?? [];
assert.deepEqual(rolesOf("Garen"), ["fighter", "tank"], "가렌은 전사이자 탱커여야 한다");
assert.deepEqual(rolesOf("Ashe"), ["marksman", "support"], "애쉬는 원거리 딜러이자 서포터여야 한다");
// 한 챔피언이 둘에 걸친다. 거르개가 배열을 받는 근거다.
assert.ok(rolesOf("Ahri").length >= 2, "아리는 갈래가 둘 이상이어야 한다");

/*
 * 칸이 고르게 나뉘는지 본다. 거르개를 공식 여섯으로 줄인 까닭이 이것이다.
 * 한 갈래에 열 명도 안 들어가면 그 칸은 눌러 볼 값이 없다.
 */
const perRole = new Map<string, number>();
for (const champion of ko.champions) for (const role of champion.roles ?? []) perRole.set(role, (perRole.get(role) ?? 0) + 1);
for (const role of OFFICIAL) {
  assert.ok((perRole.get(role) ?? 0) >= 20, `${role} 이 ${perRole.get(role) ?? 0}명뿐이다. 칸이 너무 잘다`);
}

// 갈래 이름이 세 언어에 다 있어야 한다. 없으면 화면이 영문 열쇠를 그대로 보인다.
for (const [locale, labels] of [
  ["ko_KR", koChampionProfile],
  ["en_US", enChampionProfile],
  ["zh_CN", zhChampionProfile],
] as const) {
  assert.deepEqual(
    OFFICIAL.filter((role) => !labels.roleNames[role]),
    [],
    `${locale}: 갈래 이름이 없다`,
  );
}

console.log(
  `✅ 챔피언 역할군 통과 (${ko.champions.length}명 · ${OFFICIAL.map((role) => `${role} ${perRole.get(role)}`).join(" · ")})`,
);
