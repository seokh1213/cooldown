import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSpellTooltip } from "../src/lib/spellTooltipParser/parser";
import { evaluateSpellCalculation } from "../src/lib/spellTooltipParser/spellCalculationEvaluator";
import { renderStatIconTokens, stripStatIconTokens } from "../src/lib/spellTooltipParser/statIcons";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";
import type { ChampionSpell } from "../src/types";

// Nunu Q: champion healing is the original heal multiplied by 0.6.
const spell: ChampionSpell = { id: "NunuQ", name: "잡아먹기", maxrank: 5, cooldown: [12] };
const data: CommunityDragonSpellData = {
  DataValues: { Heal: [0, 65, 95, 125, 155, 185] },
  mSpellCalculations: {
    Heal: {
      __type: "GameCalculation",
      mFormulaParts: [
        { __type: "NamedDataValueCalculationPart", mDataValue: "Heal" },
        { __type: "StatByCoefficientCalculationPart", mStat: 12, mStatFormula: 2, mCoefficient: 0.1 },
        { __type: "StatByCoefficientCalculationPart", mCoefficient: 0.9 },
      ],
    },
    ChampionHeal: {
      __type: "GameCalculationModified",
      mModifiedGameCalculation: "Heal",
      mMultiplier: { mNumber: 0.6 },
    },
    NestedHeal: {
      __type: "GameCalculationModified",
      mModifiedGameCalculation: "ChampionHeal",
      mMultiplier: { mNumber: 2 },
    },
  },
};

for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) {
  const result = evaluateSpellCalculation({ key: "ChampionHeal", spell, data, lang });
  assert.deepEqual(result.base, [39, 57, 75, 93, 111]);
  assert.deepEqual(result.statParts.map(({ icon, isCoefficient }) => ({ icon, isCoefficient })), [
    { icon: "scalehealth", isCoefficient: true },
    { icon: "scaleap", isCoefficient: true },
  ]);
  const html = parseSpellTooltip("{{ ChampionHeal }}", spell, data, lang);
  assert.match(html, /\[\[si:scalehealth]]6%/);
  assert.match(html, /\[\[si:scaleap]]54%/);
  assert.equal((renderStatIconTokens(html).match(/<img /g) ?? []).length, 2);
  assert.doesNotMatch(stripStatIconTokens(html), /\[\[si:/);
  const nested = parseSpellTooltip("{{ NestedHeal }}", spell, data, lang);
  assert.match(nested, /\[\[si:scalehealth]]12%/);
  assert.match(nested, /\[\[si:scaleap]]108%/);
}

assert.match(renderStatIconTokens("[[si:scaleap]]"), /class="stat-icon /);
const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
assert.match(css, /img\.stat-icon\s*\{\s*box-shadow:\s*none;/);
console.log("✅ Modified calculations preserve stat icons and metadata in all locales");
