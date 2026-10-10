import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAbilityForms, withAbilityUsageCondition } from "../../scripts/data-pipeline/ability-forms";
import type { ExtractedActiveSpellData } from "../../scripts/data-pipeline/cdragon-active-spells";
import type { Champion, ChampionSpell } from "../../../src/domain/game/types";

const spell: ChampionSpell = { id: "JayceStanceHtG", name: "캐논 / 해머", maxrank: 1, cooldown: [6] };
const champion: Champion = { id: "Jayce", key: "126", name: "제이스", title: "미래의 수호자", spells: [spell, spell, spell, spell] };

function formSource(id: string, start: number, step: number, percent = false): ExtractedActiveSpellData {
  return {
    source: {
      path: `Characters/Jayce/Spells/${id}`,
      iconPath: "assets/characters/jayce/hud/icons2d/jaycer_ranged.png",
      locKeys: { keyTooltip: `${id}_Tooltip` },
    },
    mSpellCalculations: {
      Value: {
        __type: "GameCalculation",
        mDisplayAsPercent: percent,
        mSimpleTooltipCalculationDisplay: 6,
        mFormulaParts: [{
          __type: "ByCharLevelBreakpointsCalculationPart",
          mLevel1Value: start,
          mBreakpoints: [6, 11, 16].map((level) => ({
            __type: "Breakpoint",
            mLevel: level,
            mAdditionalBonusAtThisLevel: step,
          })),
        }],
      },
    },
  };
}

function buildForms(tooltipB = "@Value@") {
  return buildAbilityForms({
    champion, spell, slot: "R", locale: "ko_KR", cdragonVersion: "16.19",
    aliases: {
      JayceStanceHtG: formSource("JayceStanceHtG", 0.2, 0.05, true),
      JayceStanceGtH: formSource("JayceStanceGtH", 25, 35),
    },
    table: { entries: { jaycestancehtg_tooltip: "@Value@", jaycestancegth_tooltip: tooltipB } },
  })!;
}

test("형태마다 자기 툴팁의 챔피언 레벨별 수치를 보존한다", () => {
  const forms = buildForms();
  assert.deepEqual(forms[0].levelValues?.[0].values, [20, 25, 30, 35].flatMap((value) => Array(5).fill(value)));
  assert.equal(forms[0].levelValues?.[0].percent, true);
  assert.deepEqual(forms[1].levelValues?.[0].values, [25, 60, 95, 130].flatMap((value) => Array(5).fill(value)));
  assert.equal(forms[1].levelValues?.[0].percent, undefined);
});

test("레벨 범위가 없는 형태에는 다른 형태의 수치를 넣지 않는다", () => {
  const forms = buildForms("무기를 변환합니다.");
  assert.equal(forms[0].levelValues?.length, 1);
  assert.equal(forms[1].levelValues, undefined);
});

test("매복 Q는 기본 Q의 독립 쿨타임 값을 쓰고 공유 스킬에는 형태를 만들지 않는다", () => {
  const primary: ChampionSpell = { id: "RekSaiQ", name: "여왕의 진노 / 먹잇감 추적", maxrank: 5, cooldown: [4, 3.5, 3, 2.5, 2] };
  const owner = { ...champion, id: "RekSai", spells: [primary, primary, primary, primary] };
  const source = formSource(primary.id, 1, 0);
  source.source.cooldowns = [4, 4, 3.5, 3, 2.5, 2, 2];
  source.DataValues = { BurrowedCooldown: [12.5, 12, 11.5, 11, 10.5, 10, 9.5] };
  const input = {
    champion: owner, spell: primary, slot: "Q" as const, locale: "ko_KR" as const, cdragonVersion: "16.19",
    aliases: { RekSaiQ: source, RekSaiQBurrowed: formSource("RekSaiQBurrowed", 2, 0) },
    table: { entries: { reksaiq_tooltip: "@Value@", reksaiqburrowed_tooltip: "@Value@" } },
  };
  const forms = buildAbilityForms(input)!;
  assert.deepEqual(forms.map((form) => form.cooldownSeconds), [primary.cooldown, [12, 11.5, 11, 10.5, 10]]);
  assert.deepEqual(forms.map((form) => form.name), ["여왕의 진노", "먹잇감 추적"]);
  assert.equal(buildAbilityForms({ ...input, slot: "R" }), undefined);
});

test("렐의 양쪽 W는 공유 비용·쿨타임을 보존하고 자기 형태 이름을 쓴다", () => {
  const primary: ChampionSpell = { id: "RellW_Dismount", name: "철마술: 붕괴", maxrank: 5, cooldown: [10, 10, 10, 10, 10], cost: [40, 40, 40, 40, 40] };
  const input = {
    champion: { ...champion, id: "Rell" }, spell: primary, slot: "W" as const, locale: "ko_KR" as const, cdragonVersion: "16.19",
    aliases: { RellW_Dismount: formSource(primary.id, 1, 0), RellW_MountUp: formSource("RellW_MountUp", 2, 0) },
    table: { entries: {
      rellw_dismount_tooltip: "@Value@", rellw_mountup_tooltip: "@Value@",
      generatedtip_spell_rellw_dismount_tooltipsimple: "<subtitleRight>@AbilityResourceName@ @Cost@</subtitleRight>",
      generatedtip_spell_rellw_mountup_tooltipsimple: "<subtitleRight>@AbilityResourceName@ @Cost@</subtitleRight>",
    } },
  };
  input.aliases.RellW_MountUp.source.locKeys.keyName = "Mount_Name";
  Object.assign(input.table.entries, { mount_name: "철마술: 탑승" });
  const forms = buildAbilityForms(input)!;
  assert.deepEqual(forms.map((form) => form.name), ["철마술: 붕괴", "철마술: 탑승"]);
  for (const form of forms) {
    assert.deepEqual(form.cooldownSeconds, primary.cooldown);
    assert.match(form.bodyHtml, /^마나 40/);
    assert.deepEqual(form.diagnostics.unresolvedTokens, []);
  }
  for (const slot of ["Q", "E", "R"] as const) assert.equal(buildAbilityForms({ ...input, slot }), undefined);
});

test("클레드 미탑승 Q는 발사 간격·랭크별 탄환 재충전·탄환 소모를 구분한다", () => {
  const primary: ChampionSpell = { id: "KledQ", name: "덫날리기", maxrank: 5, cooldown: [11, 10, 9, 8, 7] };
  const alternate = formSource("KledRiderQ", 2, 0);
  alternate.source.cooldowns = [3, 3, 3, 3, 3, 3, 3];
  alternate.DataValues = { RechargeTime: [20, 18, 16, 14, 12, 10, 8], mAmmoRechargeTime: Array(7).fill(20) };
  const input = {
    champion: { ...champion, id: "Kled" }, spell: primary, slot: "Q" as const, locale: "ko_KR" as const, cdragonVersion: "16.19",
    aliases: { KledQ: formSource("KledQ", 1, 0), KledRiderQ: alternate },
    table: { entries: {
      kledq_tooltip: "@Value@", kledriderq_tooltip: "@Value@",
      generatedtip_spell_kledriderq_tooltipsimple: "<titleRight>재장전 대기시간 @TOOLTIPAmmoRecharge@초 (@Cooldown@초)</titleRight><subtitleRight>탄환 1발</subtitleRight>",
    } },
  };
  const forms = buildAbilityForms(input)!;
  assert.deepEqual(forms[0].cooldownSeconds, primary.cooldown);
  assert.deepEqual(forms[1].cooldownSeconds, [3, 3, 3, 3, 3]);
  assert.match(forms[1].bodyHtml, /^탄환 1발<br \/>재장전 대기시간 18\/16\/14\/12\/10초 \(3초\)/);
  assert.deepEqual(forms[1].diagnostics.unresolvedTokens, []);
  for (const slot of ["W", "E", "R"] as const) assert.equal(buildAbilityForms({ ...input, slot }), undefined);
  const body = "<p>Original ability damage and rank values.</p>";
  for (const [locale, expected] of [["ko_KR", /스칼에 탑승한 상태에서만/], ["en_US", /Only usable while mounted on Skaarl/], ["zh_CN", /仅在骑乘斯嘎尔时可用/]] as const) {
    for (const slot of ["E", "R"] as const) {
      const conditioned = withAbilityUsageCondition("Kled", slot, body, locale);
      assert.ok(conditioned.startsWith(body));
      assert.match(conditioned, expected);
      assert.equal(withAbilityUsageCondition("Kled", slot, conditioned, locale), conditioned);
      assert.equal(withAbilityUsageCondition("Jayce", slot, body, locale), body);
    }
    for (const slot of ["P", "Q", "W"] as const) assert.equal(withAbilityUsageCondition("Kled", slot, body, locale), body);
    assert.equal(withAbilityUsageCondition("Kled", "E", "", locale), "");
  }
});
