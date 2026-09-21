/**
 * 보정 항목 검사
 *
 * `knowledge/spell-effects.json` 은 툴팁이 말하지 않는 것을 사람이 채운 자리다.
 * 손으로 적으므로 오타와 낡음이 들어온다. 기계가 가릴 수 있는 것만 가린다.
 *
 *   실재    없는 챔피언·슬롯을 짚지 않았는가
 *   어휘    쓰지 않는 태그 이름을 적지 않았는가
 *   출처    무엇을 보고 적었는지 남겼는가
 *   무용    규칙이 이미 잡는 것을 또 적지 않았는가
 *
 * 마지막 항목이 중요하다. 규칙을 고쳐 그 태그를 잡게 되면 보정은 할 일이 없어지는데,
 * 그대로 두면 다음 사람이 "이건 왜 여기 있지" 를 다시 따져야 한다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { loadSpellOverrides } from "./llm/lib/spellOverrides";
import { detectEffects } from "./llm/lib/facts-analysis";

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
]);
const DAMAGE_TYPES = new Set(["물리", "마법", "고정"]);

const overrides = loadSpellOverrides();
let tags = 0;
let types = 0;

for (const [key, override] of Object.entries(overrides)) {
  const [championId, slot] = key.split(":");
  assert.ok(slot, `${key}: 키는 "<ChampionId>:<슬롯>" 꼴이어야 합니다`);

  const card = byId.get(championId);
  assert.ok(card, `${key}: 없는 챔피언입니다`);
  const spell = card.spells.find((s) => s.slot === slot);
  assert.ok(spell, `${key}: 없는 슬롯입니다`);

  assert.ok(override.why?.trim(), `${key}: why 가 비어 있습니다`);
  assert.ok(/^https?:\/\//.test(override.source ?? ""), `${key}: source 가 주소가 아닙니다`);
  // 주석과 같은 결로 적는다. 합니다체가 섞이면 파일 안에서 말투가 갈린다.
  assert.ok(!/습니다\.|입니다\./.test(override.why), `${key}: why 는 평서형으로 씁니다`);

  // 규칙이 이미 잡는 것을 또 적으면, 규칙을 고친 뒤에도 보정이 남아 다음 사람이
  // "이건 왜 여기 있지" 를 다시 따지게 된다. 이동기·돌진은 위키 판정에서 오므로 뺀다.
  const derived = new Set(
    detectEffects(spell.text, card.spells.map((s) => s.name)),
  );
  for (const tag of override.add ?? []) {
    assert.ok(TAGS.has(tag), `${key}: 모르는 태그 "${tag}"`);
    if (tag !== "이동기" && tag !== "돌진") {
      assert.ok(!derived.has(tag), `${key}: "${tag}" 은 규칙이 이미 잡습니다. 보정을 지웁니다`);
    }
    tags += 1;
  }
  for (const tag of override.remove ?? []) {
    assert.ok(TAGS.has(tag), `${key}: 모르는 태그 "${tag}"`);
  }
  for (const type of override.damageTypes ?? []) {
    assert.ok(DAMAGE_TYPES.has(type), `${key}: 모르는 피해 유형 "${type}"`);
    types += 1;
  }

  assert.ok(
    (override.add?.length ?? 0) + (override.remove?.length ?? 0) + (override.damageTypes?.length ?? 0) > 0,
    `${key}: 보정할 내용이 없습니다`,
  );
}

assert.ok(Object.keys(overrides).length > 0, "보정 항목이 하나도 없습니다");
console.log(`✅ 보정 항목 통과 (${Object.keys(overrides).length}자리 · 태그 ${tags}건 · 피해 유형 ${types}건)`);
