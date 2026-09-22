/**
 * 아이템 별칭 검색을 검사한다
 *
 * 리엇이 `colloq` 에 채워 둔 상점 별칭으로도 찾히는지 본다. 쓰는 사람이 실제로
 * 부르는 말이라("똥신", "bf", "sdzx") 이름만 보는 검색은 이것들을 다 놓쳤다.
 *
 * 자료가 사라지면 시험이 조용히 통과해 버리므로, 로케일마다 별칭이 붙은 아이템
 * 개수부터 확인하고 들어간다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { groupItemsByTier } from "../src/pages/EncyclopediaPage/itemCatalogModel";
import type { NormalizedItem } from "../src/types/combatNormalized";

const directory = path.join(process.cwd(), "public/data");
const patch = (JSON.parse(fs.readFileSync(path.join(directory, "version.json"), "utf8")) as { patchVersion: string }).patchVersion;

function load(locale: string): NormalizedItem[] {
  const file = path.join(directory, patch, `items-normalized-${locale}.json`);
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { items: NormalizedItem[] }).items;
}

/** 검색어로 걸린 아이템 이름들. 화면과 같은 경로를 탄다. */
function search(items: NormalizedItem[], query: string): string[] {
  return Object.values(groupItemsByTier(items, query)).flat().map((item) => item.name);
}

const CASES: Array<[string, number, Array<[string, string]>]> = [
  // [로케일, 별칭이 붙어야 할 최소 개수, [검색어, 걸려야 할 이름]]
  [
    "ko_KR",
    120,
    [
      ["똥신", "장화"],
      ["요부", "요정의 부적"],
      ["완두콩", "원기 회복의 구슬"],
    ],
  ],
  [
    "en_US",
    50,
    [
      ["bf", "B. F. Sword"],
      ["dshield", "Doran's Shield"],
    ],
  ],
  [
    "zh_CN",
    120,
    [
      // 병음과 그 이니셜. 이니셜 쪽이 한국어 초성과 같은 장치다.
      ["sdzx", "鞋子"],
      ["xnfh", "仙女护符"],
    ],
  ],
];

for (const [locale, minimum, checks] of CASES) {
  const items = load(locale);
  const withAliases = items.filter((item) => (item.aliases?.length ?? 0) > 0);
  assert.ok(
    withAliases.length >= minimum,
    `${locale}: 별칭이 붙은 아이템이 ${withAliases.length}개뿐이다 (최소 ${minimum}). 파이프라인이 colloq 를 버리고 있다`,
  );
  for (const [query, expected] of checks) {
    const hits = search(items, query);
    assert.ok(hits.includes(expected), `${locale}: "${query}" 로 ${expected} 를 못 찾는다 (${hits.slice(0, 5).join(", ") || "결과 없음"})`);
  }
}

// 이름 검색이 망가지지 않았는지. 별칭을 얹느라 원래 길을 막으면 안 된다.
assert.ok(search(load("ko_KR"), "장화").includes("장화"), "이름으로도 찾혀야 한다");
assert.ok(search(load("ko_KR"), "ㅁㅊㅅ").includes("민첩성의 망토"), "초성 검색이 그대로 돌아야 한다");

console.log(`✅ 아이템 별칭 검색 통과 (로케일 ${CASES.length}종)`);
