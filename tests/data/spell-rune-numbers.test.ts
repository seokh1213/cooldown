/**
 * 스킬 사거리(CDragon BIN)와 룬 재사용 대기시간(룬 툴팁)을 읽는 규칙과 26.19 자료.
 *
 * "제드 궁 사거리" 에 625 가, "감전 쿨타임" 에 20초가 어디에도 없었다(2026-09-30 브라우저 시험).
 * 기대값은 게임 안 툴팁과 맞춰 본 값이다(제드 R 625, 감전 20초 — 14.13 이후 고정 20초).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { extractAbilityCastRanges, spellCastRange } from "../../scripts/data-pipeline/sources/cdragon-champion";
import { parseRuneCooldown } from "../../scripts/data-pipeline/normalization/rune";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { patchVersion } = JSON.parse(fs.readFileSync(path.join(root, "public/data/version.json"), "utf8")) as { patchVersion: string };
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(root, "public/data", patchVersion, file), "utf8")) as T;

/** BIN 배열은 0번이 랭크 0 자리이고 7칸이다 */
const seven = (value: number) => Array(7).fill(value);

test("사거리: 표시값을 먼저, 없으면 castRange", () => {
  // 제드 W: castRange 700, 표시값 650
  assert.equal(spellCastRange({ castRange: seven(700), castRangeDisplayOverride: seven(650) }, 5), 650);
  // 제드 R: 표시값 없음
  assert.equal(spellCastRange({ castRange: seven(625) }, 3), 625);
  // 잔나 W: 표시값 -1 은 "표시 안 함"
  assert.equal(spellCastRange({ castRange: seven(550), castRangeDisplayOverride: seven(-1) }, 5), 550);
  // 녹턴 R: 랭크마다 다르면 배열
  assert.deepEqual(spellCastRange({ castRange: [2500, 2500, 3250, 4000, 2500, 2500, 2500] }, 3), [2500, 3250, 4000]);
});

test("사거리: 제한 없음·자기 시전·값 없음은 비운다", () => {
  assert.equal(spellCastRange({ castRange: seven(25000) }, 3), undefined, "애쉬 R 25000");
  assert.equal(spellCastRange({ castRange: seven(10000) }, 5), undefined, "트위스티드 페이트 Q 10000 (실제 1450)");
  assert.equal(spellCastRange({ castRange: seven(0) }, 5), undefined, "가렌 W 0");
  assert.equal(spellCastRange({ castRange: seven(20) }, 3), undefined, "니달리 R 20");
  assert.equal(spellCastRange({}, 3), undefined, "castRange 없음 (DDragon 은 400 을 채운다)");
});

test("사거리: 루트의 spells 가 슬롯 순서다", () => {
  const bin = {
    "Characters/Zed/CharacterRecords/Root": {
      spells: ["Characters/Zed/Spells/ZedQAbility/ZedQ", "Characters/Zed/Spells/ZedWAbility/ZedW", "Characters/Zed/Spells/ZedEAbility/ZedE", "Characters/Zed/Spells/ZedRAbility/ZedR"],
    },
    "Characters/Zed/Spells/ZedQAbility/ZedQ": { mSpell: { castRange: seven(25000), castRangeDisplayOverride: seven(900) } },
    // 같은 폴더의 투사체. 이름이 비슷해도 고르지 않는다.
    "Characters/Zed/Spells/ZedQAbility/ZedQMissile": { mSpell: { castRange: seven(925) } },
    "Characters/Zed/Spells/ZedWAbility/ZedW": { mSpell: { castRange: seven(700), castRangeDisplayOverride: seven(650) } },
    "Characters/Zed/Spells/ZedEAbility/ZedE": { mSpell: { castRange: seven(290), castRadius: seven(290) } },
    "Characters/Zed/Spells/ZedRAbility/ZedR": { mSpell: { castRange: seven(625) } },
  };
  assert.deepEqual(extractAbilityCastRanges(bin, { Q: 5, W: 5, E: 5, R: 3 }), { Q: 900, W: 650, E: 290, R: 625 });
});

test(`${patchVersion} 사거리 자료`, () => {
  const { abilities } = read<{ abilities: Record<string, number | number[]> }>("llm/ability-ranges.json");
  assert.equal(abilities["Zed:R"], 625);
  assert.equal(abilities["Zed:Q"], 900);
  assert.equal(abilities["Zed:W"], 650);
  assert.equal(abilities["Zed:E"], 290);
  assert.equal(abilities["Ahri:Q"], 970);
  assert.equal(abilities["Garen:E"], 325);
  assert.equal(abilities["Lux:R"], 3340);
  assert.deepEqual(abilities["Nocturne:R"], [2500, 3250, 4000]);
  for (const none of ["Ashe:R", "Ezreal:R", "TwistedFate:Q", "Garen:W", "Tryndamere:R"]) {
    assert.equal(abilities[none], undefined, none);
  }
  // 카드에 실렸는가(세 언어 모두 같은 값)
  for (const lang of ["ko_KR", "en_US", "zh_CN"]) {
    const { cards } = read<{ cards: Array<{ id: string; spells: Array<{ slot: string; range?: number | number[] }> }> }>(`llm/champion-cards-${lang}.json`);
    assert.equal(cards.find((card) => card.id === "Zed")?.spells.find((spell) => spell.slot === "R")?.range, 625, lang);
  }
});

test("룬 재사용 대기시간: 툴팁 끝줄", () => {
  assert.equal(parseRuneCooldown("피해량: 70~240<br>재사용 대기시간: 20초<br><br><i>'…'</i>"), 20);
  assert.equal(parseRuneCooldown("Damage: 70-240<br>Cooldown: 20s<br>"), 20);
  assert.equal(parseRuneCooldown("伤害：70-240<br>冷却时间：20秒<br>"), 20);
  // 괄호 안 조건은 버린다
  assert.equal(parseRuneCooldown("재사용 대기시간: 35초 (처치 관여 시 1.0초로 초기화)"), 35);
  assert.equal(parseRuneCooldown("Cooldown: 35s (resets to 1.0s on takedown)"), 35);
  // 레벨에 따라 주는 값
  assert.equal(parseRuneCooldown("재사용 대기시간: <scaleLevel>25~15</scaleLevel>초"), "25~15");
  assert.equal(parseRuneCooldown("Cooldown: 20s - 10s"), "20~10");
  assert.equal(parseRuneCooldown("冷却时间：75 ~40秒护盾值"), "75~40");
  // 사이에 말이 낀 영어 머리말(기민함)
  assert.equal(parseRuneCooldown("Cooldown for damage restoration: 8s"), 8);
  // 풀리지 않은 값과 쿨타임 문장이 아닌 것은 비운다
  assert.equal(parseRuneCooldown("재사용 대기시간이 영구적으로 25초씩 감소합니다. (최초 교환의 재사용 대기시간: @f3@초)"), undefined);
  assert.equal(parseRuneCooldown("재사용 대기시간: "), undefined);
  assert.equal(parseRuneCooldown("기본 스킬의 재사용 대기시간 20% 감소"), undefined);
});

test(`${patchVersion} 룬 재사용 대기시간 자료`, () => {
  for (const lang of ["ko_KR", "en_US", "zh_CN"]) {
    const { runes } = read<{ runes: Array<{ id: string; cooldown?: number | string }> }>(`runes-normalized-${lang}.json`);
    const cooldown = (id: string) => runes.find((rune) => rune.id === id)?.cooldown;
    assert.equal(cooldown("8112"), 20, `${lang} 감전`);
    assert.equal(cooldown("8128"), 35, `${lang} 어둠의 수확`);
    assert.equal(cooldown("8369"), "25~15", `${lang} 선제공격`);
    assert.equal(cooldown("8360"), undefined, `${lang} 봉인 풀린 주문서`);
    assert.equal(cooldown("8010"), undefined, `${lang} 정복자`);
  }
});
