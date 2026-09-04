import type { ChampionSpell } from "@/types";
import { logger } from "@/lib/logger";
import { formatCalculationResult } from "./calculationResultFormatter";
import { evaluateSpellCalculation } from "./spellCalculationEvaluator";
import type {
  CommunityDragonSpellData,
  ParseResult,
  TooltipLocale,
} from "./types";

/**
 * mSpellCalculations에서 대소문자를 구분하지 않고 계산식을 찾아 표시 문자열로 변환한다.
 */
export function replaceCalculateData(
  parseResult: ParseResult,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: TooltipLocale = "ko_KR",
): string | null {
  const calculations = communityDragonData?.mSpellCalculations;
  if (!communityDragonData || !calculations) return null;

  const calculationKey = Object.keys(calculations).find(
    (key) => key.toLowerCase() === parseResult.variable.toLowerCase(),
  );
  if (!calculationKey) return null;

  try {
    const result = evaluateSpellCalculation({
      key: calculationKey,
      spell,
      data: communityDragonData,
      lang,
    });
    return formatCalculationResult(result);
  } catch (error) {
    logger.error("Failed to evaluate calculation:", error);
    return null;
  }
}
