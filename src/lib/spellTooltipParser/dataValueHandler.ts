import { ChampionSpell } from "@/types";
import { ParseResult, CommunityDragonSpellData } from "./types";
import { getDataValueByName, applyFormulaToValue } from "./dataValueUtils";
import { valueToTooltipString } from "./valueUtils";

/**
 * DataValues를 사용하여 변수 치환
 * @param firstRank 0 이면 0랭크 값부터 읽는다 (getDataValueByName)
 */
export function replaceData(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  firstRank: 0 | 1 = 1
): string | null {
  const dataValues = communityDragonData?.DataValues;
  if (!dataValues) return null;

  const value = getDataValueByName(
    dataValues,
    parseResult.variable,
    spell.maxrank,
    firstRank
  );
  if (value == null) return null;

  const withFormula = applyFormulaToValue(value, parseResult);
  return valueToTooltipString(withFormula);
}

