import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPatchSkillInfo, type SkillCatalogChampion } from "../../scripts/patch-notes/skills";
import { decodePatchSkillArchive, type PatchSkillArchive } from "../../src/data/contracts/patchSkills";
import type { PatchMetric } from "../../src/data/contracts/patchNotes";
import type { Champion } from "../../src/types";
import { patchStatGlyph } from "../../src/pages/PatchNotesPage/statGlyph";
import { StatKey, STAT_DEFINITIONS } from "../../src/types/combatStats";
import { selectPatchSkillIcons } from "../../scripts/patch-notes/skillIcons";

const text = { ko_KR: "피해량", en_US: "Damage", zh_CN: "伤害" };
const metadata: SkillCatalogChampion = {
  partype: "마나", passive: { name: "패시브", description: "이전 패시브", image: { full: "TestPassive.png" } },
  spells: [{ id: "TestQ", name: "스킬", description: "보관한 설명", image: { full: "TestQ.png" }, maxrank: 5, cooldown: [20, 18], cost: [50] }],
};
const damage: PatchMetric = { id: "Test/values/BaseDamage", label: text, section: "Q", unit: "number", values: [100, 150], favorable: "higher", sourceKey: "BaseDamage" };
const options = { championId: "Test", section: "Q", title: "스킬", metrics: [damage], metadata, locale: "ko_KR" as const };

test("과거 스킬은 해당 스냅샷의 쿨타임과 수치·설명을 표시한다", () => {
  const cooldown: PatchMetric = { ...damage, id: "Test/abilities/Q/cooldown", label: { ...text, en_US: "Cooldown" }, values: [18, 16], unit: "seconds" };
  const info = buildPatchSkillInfo({ ...options, metrics: [damage, cooldown] });
  assert.deepEqual(info.skill?.cooldown, [18, 16]);
  assert.equal(info.skill?.description, "보관한 설명");
  assert.deepEqual(info.skill?.rankValues, [{ label: "피해량", values: "100 / 150" }]);
});

test("현재 패치의 공통 스킬 상세 데이터는 변신 형태와 계산식을 유지한다", () => {
  const canonical = { ...metadata.spells[0], tooltip: "해석된 현재 설명", simulation: { status: "unavailable" as const, unsupportedPartTypes: [] } };
  const current = { id: "Test", key: "1", name: "테스트", title: "", spells: [canonical] } as Champion;
  const info = buildPatchSkillInfo({ ...options, current });
  assert.equal(info.skill, canonical);
});

test("같은 슬롯의 개별 무기에 일반 스킬의 쿨타임·소모량을 섞지 않는다", () => {
  const variant = buildPatchSkillInfo({ ...options, title: "다른 무기" });
  assert.deepEqual(variant.skill?.cooldown, []);
  assert.equal(variant.skill?.cost, undefined);
  assert.equal(variant.skill?.name, "다른 무기");
  const specific = { ...damage, id: "InfernumQCD", label: { ...text, en_US: "Cooldown (level 1)" }, values: [8], unit: "seconds" as const };
  assert.deepEqual(buildPatchSkillInfo({ ...options, title: "다른 무기", metrics: [specific] }).skill?.cooldown, [8]);
});

test("패시브도 같은 상세 컴포넌트용 이미지와 보관 수치를 제공한다", () => {
  const info = buildPatchSkillInfo({ ...options, section: "P", title: "패시브" });
  assert.equal(info.slot, "P");
  assert.equal(info.passive?.image.full, "TestPassive.png");
  assert.deepEqual(info.passive?.rankValues, [{ label: "피해량", values: "100 / 150" }]);
});

test("스킬 JSON의 패치·언어·원본 판본과 손상된 쿨타임을 검증한다", () => {
  const identity = { patchVersion: "26.18", locale: "ko_KR" as const, sources: { ddragon: "16.18.1", cdragon: "16.18" } };
  const archive: PatchSkillArchive = { ...identity, schemaVersion: 1, champions: { Test: { "Q:스킬": buildPatchSkillInfo(options) } } };
  assert.equal(decodePatchSkillArchive(archive, identity), archive);
  assert.throws(() => decodePatchSkillArchive(archive, { ...identity, patchVersion: "26.19" }));
  assert.throws(() => decodePatchSkillArchive(archive, { ...identity, locale: "en_US" }));
  assert.throws(() => decodePatchSkillArchive(archive, { ...identity, sources: { ...identity.sources, cdragon: "16.19" } }));
  assert.throws(() => decodePatchSkillArchive({ ...archive, champions: { Test: { Q: { slot: "Q", skill: { id: "TestQ", cooldown: [NaN] } } } } }, identity));
  assert.throws(() => decodePatchSkillArchive({ ...archive, champions: { Test: {
    Q: { ...buildPatchSkillInfo(options), icons: [{ file: "../../secret.webp", spellId: "TestQ" }] },
  } } }, identity));
});

test("아이콘은 Q 슬롯이나 번역명이 아닌 실제 변경 수치의 스킬 경로로 선택한다", () => {
  const severum = { spellId: "ApheliosSeverumQ", iconPath: "severum.png", file: `patch-notes/icons/${"a".repeat(32)}.webp` };
  const calibrum = { spellId: "ApheliosCalibrumQ", iconPath: "calibrum.png", file: `patch-notes/icons/${"b".repeat(32)}.webp` };
  const catalog = { "{c872c72d}": severum, "{9501e989}": calibrum };
  assert.deepEqual(selectPatchSkillIcons(["{c872c72d}/calculations/HealAmount/mEndValue"], catalog), [
    { spellId: severum.spellId, file: severum.file },
  ]);
  assert.deepEqual(selectPatchSkillIcons(["{9501e989}/values/Damage", "{9501e989}/calculations/BaseDamage"], catalog), [
    { spellId: calibrum.spellId, file: calibrum.file },
  ]);
  assert.deepEqual(selectPatchSkillIcons(["Aphelios/abilities/Q/cooldown"], catalog), []);
});

test("R에 보관한 Q·패시브 효과에는 R 아이콘을 붙이지 않는다", () => {
  const spellPath = "Characters/Ryze/Spells/RyzeRAbility/RyzeR";
  const source = { name: "Ryze", stats: {}, spells: {}, rootSpells: ["RyzeQ", "RyzeW", "RyzeE", spellPath] };
  const icon = { spellId: "RyzeR", iconPath: "RyzeR.png", file: `patch-notes/icons/${"c".repeat(32)}.webp` };
  const keys = [`${spellPath}/values/OverloadDamageBonus`];
  assert.deepEqual(selectPatchSkillIcons(keys, { [spellPath]: icon }, { source, section: "Q" }), []);
  assert.deepEqual(selectPatchSkillIcons(keys, { [spellPath]: icon }, { source, section: "P" }), []);
  assert.deepEqual(selectPatchSkillIcons(keys, { [spellPath]: icon }, { source, section: "R" }), [{ file: icon.file, spellId: "RyzeR" }]);
});

test("기본 능력치와 아이템 글리프는 번역 대신 안정적인 수치 키로 고른다", () => {
  assert.equal(patchStatGlyph({ id: "stats/attackdamage", section: "stats" }), STAT_DEFINITIONS[StatKey.ATTACK_DAMAGE].icon);
  assert.equal(patchStatGlyph({ id: "stats/hpperlevel", section: "stats" }), STAT_DEFINITIONS[StatKey.MAX_HEALTH].icon);
  assert.equal(patchStatGlyph({ id: "Items/3865/mPercentBaseHPRegenMod", section: "stats" }), STAT_DEFINITIONS[StatKey.HEALTH_REGEN].icon);
  assert.equal(patchStatGlyph({ id: "Items/123/AbilityHasteMod", section: "stats" }), STAT_DEFINITIONS[StatKey.ABILITY_HASTE].icon);
  assert.equal(patchStatGlyph({ id: "unknown/damage", section: "Q" }), undefined);
});
