import type { ChampionSpell } from "@/types";
import { logger } from "@/lib/logger";
import { binHashKey } from "./binHash";
import { resolveCalculationOverride } from "./runtimeTokenAliases";
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

  const wanted = parseResult.variable.toLowerCase();
  const hashed = binHashKey(parseResult.variable);
  const calculationKey = Object.keys(calculations).find(
    (key) => key.toLowerCase() === wanted || key === hashed,
  );
  if (!calculationKey) return null;

  // BIN 안에서 낡은 채로 남은 계산식은 교체본으로 바꿔 넣는다
  const override = resolveCalculationOverride(spell.id, calculationKey);
  const data = override
    ? {
        ...communityDragonData,
        mSpellCalculations: { ...calculations, [calculationKey]: override },
      }
    : communityDragonData;

  try {
    const result = evaluateSpellCalculation({
      key: calculationKey,
      spell,
      data,
      lang,
    });
    return formatCalculationResult(result, lang);
  } catch (error) {
    logger.error("Failed to evaluate calculation:", error);
    return null;
  }
}
