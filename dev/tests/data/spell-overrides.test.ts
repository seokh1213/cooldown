// 수동 보정은 리워크와 자동 태그 규칙 변경 뒤에도 낡은 상태로 남을 수 있다.
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import type { ChampionCard } from "../../../src/domain/knowledge/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "../../scripts/advisor/lib/data";
import { digestSpellText, loadSpellOverrides } from "../../scripts/advisor/lib/spellOverrides";
import { detectEffects } from "../../../src/domain/knowledge/facts-analysis";

const llmDir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;
const byId = new Map(cards.map((c) => [c.id, c]));

/** 쓰는 효과 태그. 새 이름을 늘리려면 여기부터 고친다. */
const TAGS = new Set([
  "둔화", "이동기", "돌진", "이동 속도 증가", "광역", "회복", "보호막", "공격 속도 증가",
  "기절", "기본 공격 강화", "최대 체력 비례 피해", "에어본", "강제 이동(넉백/끌기)", "속박",
  "고정 피해", "잃은 체력 비례", "쿨타임 초기화", "자기 마법 저항력 증가", "자기 방어력 증가",
  "적 방어력 감소", "은신", "적 마법 저항력 감소", "처형", "관통", "침묵", "공포", "피해 면역",
  "분신", "투사체 차단", "도발", "매혹", "치유 감소", "공격 무효화", "강인함",
  // 사람이 결정해 늘린 어휘. 34개로는 담기지 않던 것들이다.
  "받는 피해 감소", "변신", "생명력 흡수", "소환수", "자기 공격력 증가", "치명타", "부활", "연계 강화",
  "표식 부여", "성장 스택", "스킬 강화", "사거리 증가", "자기 주문력 증가",
]);
const DAMAGE_TYPES = new Set(["물리", "마법", "고정"]);

const overrides = loadSpellOverrides();

function validateOverride(key: string, override: (typeof overrides)[string]): void {
  const [championId, slot] = key.split(":");
  assert.ok(slot, `${key}: 키는 "<ChampionId>:<슬롯>" 꼴이어야 합니다`);

  const card = byId.get(championId);
  assert.ok(card, `${key}: 없는 챔피언입니다`);
  const spell = card.spells.find((s) => s.slot === slot);
  assert.ok(spell, `${key}: 없는 슬롯입니다`);

  // 수치를 지운 지문으로 리워크를 감지하고 밸런스 변경은 허용한다.
  if (override.textDigest) {
    const now = digestSpellText(spell.text);
    assert.equal(
      now,
      override.textDigest,
      `${key}: 툴팁 문구가 바뀌었습니다. 보정을 다시 확인하고 textDigest 를 "${now}" 로 바꾸십시오`,
    );
  }

  assert.ok(override.why?.trim(), `${key}: why 가 비어 있습니다`);
  assert.ok(/^https?:\/\//.test(override.source ?? ""), `${key}: source 가 주소가 아닙니다`);

  // 이동기·돌진은 텍스트가 아닌 위키 판정에서 가져온다.
  const derived = new Set(
    detectEffects(spell.text, card.spells.map((s) => s.name)),
  );
  for (const tag of override.add ?? []) {
    assert.ok(TAGS.has(tag), `${key}: 모르는 태그 "${tag}"`);
    if (tag !== "이동기" && tag !== "돌진") {
      assert.ok(!derived.has(tag), `${key}: "${tag}" 은 규칙이 이미 잡습니다. 보정을 지웁니다`);
    }
  }
  for (const tag of override.remove ?? []) {
    assert.ok(TAGS.has(tag), `${key}: 모르는 태그 "${tag}"`);
  }
  for (const type of override.damageTypes ?? []) {
    assert.ok(DAMAGE_TYPES.has(type), `${key}: 모르는 피해 유형 "${type}"`);
  }

  // 빈 보정 확인과 실제 변경을 함께 적으면 어느 쪽이 유효한지 모호해진다.
  const changes =
    (override.add?.length ?? 0) + (override.remove?.length ?? 0) + (override.damageTypes?.length ?? 0);
  if (override.confirmedEmpty) {
    assert.equal(changes, 0, `${key}: 비었음을 확인해 놓고 보정도 적었습니다`);
  }
  if (!override.confirmedEmpty && !override.confirmedNoDamage) {
    assert.ok(changes > 0, `${key}: 보정할 내용이 없습니다`);
  }
}

test("모든 수동 스킬 보정의 대상·출처·지문·태그가 유효하다", () => {
  const entries = Object.entries(overrides);
  assert.ok(entries.length > 0, "보정 항목이 하나도 없습니다");
  for (const [key, override] of entries) validateOverride(key, override);
});
