import assert from "node:assert/strict";
import type { ChampionSpell } from "../src/types";
import { localizeActiveTooltip } from "./data-pipeline/active-tooltip-data";
import type { ExtractedActiveSpellData } from "./data-pipeline/cdragon-active-spells";

const spell: ChampionSpell = {
  id: "TestSpell",
  name: "Legacy name",
  maxrank: 2,
  cooldown: [8, 7],
  effectBurn: [null, null, "1.5/2"],
};

const source: ExtractedActiveSpellData = {
  DataValues: {
    Damage: [0, 10, 20],
  },
  source: {
    path: "Characters/Test/Spells/TestSpell",
    locKeys: {
      keyName: "Spell_Test_Name",
      keySummary: "Spell_Test_Summary",
      keyTooltip: "Spell_Test_Tooltip",
      keyTooltipExtendedBelowLine: "Spell_Test_Tooltip_Extended",
    },
  },
};

const localized = localizeActiveTooltip(
  spell,
  source,
  {
    entries: {
      spell_test_name: "시험 스킬",
      spell_test_summary: "짧은 설명",
      spell_test_tooltip:
        "{{ Reminder_Test }} 대상에게 @Damage@의 피해를 입힙니다.",
      spell_test_tooltip_extended:
        "재사용 대기시간은 @cooldown@초, 지속시간은 @Effect2Amount@초이며 @UnknownValue@는 진단합니다.",
      reminder_test: "강조:",
    },
  },
  "ko_KR"
);

assert.equal(localized.name, "시험 스킬");
assert.equal(localized.summary, "짧은 설명");
// 값을 못 구한 자리는 지우지 않고 "?" 로 남긴다.
// 빈 문자열로 지우면 조사만 남아 문장이 깨진다.
assert.equal(
  localized.tooltip,
  "강조: 대상에게 10/20의 피해를 입힙니다.<br /><br />재사용 대기시간은 8/7초, 지속시간은 1.5/2초이며 ?는 진단합니다."
);
assert.doesNotMatch(localized.tooltip ?? "", /[@{}]/);
assert.deepEqual(localized.unresolvedTokens, ["UnknownValue"]);

console.log("✅ Active SpellObject localization pipeline passed");
