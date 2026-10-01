import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAbilityForms } from "../../scripts/data-pipeline/ability-forms";
import type { ExtractedActiveSpellData } from "../../scripts/data-pipeline/cdragon-active-spells";
import type { Champion, ChampionSpell } from "../../src/types";

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
