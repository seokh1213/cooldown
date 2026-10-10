import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AbilityStructuredDetails } from "../../../src/features/champions/comparison/AbilityStructuredDetails";
import type { AbilitySimulation } from "../../../src/domain/game/contracts/championData";
import { getTranslations, I18nProvider } from "../../../src/shared/i18n";

const lang = "en_US";
const t = getTranslations(lang);

function render(simulation: AbilitySimulation): string {
  return renderToStaticMarkup(createElement(
    I18nProvider,
    { lang } as Parameters<typeof I18nProvider>[0],
    createElement(AbilityStructuredDetails, { simulation }),
  ));
}

test("비선형 공격 속도 계수에 추가 스탯을 표시한다", () => {
  const simulation: AbilitySimulation = {
    status: "expression",
    unsupportedPartTypes: [],
    expression: {
      id: "Damage",
      kind: "damage",
      damageType: "physical",
      requiresBuffStacks: false,
      root: {
        kind: "stat",
        stat: "bonusAttackSpeed",
        coefficient: { byRank: [0.3] },
      },
    },
  };
  assert.ok(render(simulation).includes(`30% ${t.common.bonus} ${t.stats.attackspeed}`));
});

test("선형 마나 계수에 추가 스탯을 표시한다", () => {
  const simulation: AbilitySimulation = {
    status: "complete",
    unsupportedPartTypes: [],
    primary: {
      id: "Damage",
      kind: "damage",
      damageType: "magical",
      baseByRank: [75],
      terms: [{ stat: "bonusMana", coefficientsByRank: [0.02] }],
    },
  };
  assert.ok(render(simulation).includes(`${t.common.bonus} ${t.stats.mana}`));
});
