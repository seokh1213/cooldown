import { ChampionSpell } from "@/types";
import { ParseResult, CommunityDragonSpellData } from "./types";
import { getDataValueByName, applyFormulaToValue } from "./dataValueUtils";
import { valueToTooltipString } from "./valueUtils";

/**
 * DataValues를 사용하여 변수 치환
 */
export function replaceData(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData
): string | null {
  const dataValues = communityDragonData?.DataValues;
  if (!dataValues) return null;

  const value = getDataValueByName(dataValues, parseResult.variable, spell.maxrank);
  if (value == null) return null;

  const withFormula = applyFormulaToValue(value, parseResult);
  return valueToTooltipString(withFormula);
}

