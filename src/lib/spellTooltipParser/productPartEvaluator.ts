import type { ChampionSpell } from "@/types";
import { logger } from "@/lib/logger";
import type {
  EffectValueCalculationPart,
  NamedDataValueCalculationPart,
  NumberCalculationPart,
  ProductOfSubPartsCalculationPart,
  Value,
} from "./types";
import { mul } from "./valueUtils";

type DataValueEvaluator = (name: string) => Value | null;

function parseEffectValue(effectBurn: string): Value {
  const values = effectBurn
    .split("/")
    .map(Number.parseFloat)
    .filter((value) => !Number.isNaN(value));
  if (values.length === 0) return 0;
  return values.length === 1 ? values[0] : values;
}

function evaluateSubPart(
  part: unknown,
  spell: ChampionSpell,
  evaluateDataValue: DataValueEvaluator,
): Value {
  if (!part || typeof part !== "object" || !("__type" in part)) return 0;
  const type = (part as { __type?: string }).__type;

  if (type === "NamedDataValueCalculationPart") {
    const name = (part as NamedDataValueCalculationPart).mDataValue;
    if (!name) {
      logger.debug("Product part is missing mDataValue", part);
      return 0;
    }
    return evaluateDataValue(name) ?? 0;
  }
  if (type === "NumberCalculationPart") {
    return (part as NumberCalculationPart).mNumber ?? 0;
  }
  if (type === "EffectValueCalculationPart") {
    const index = (part as EffectValueCalculationPart).mEffectIndex ?? 0;
    const effectBurn = spell.effectBurn?.[index];
    if (!effectBurn) {
      logger.debug(`Product part is missing effectBurn[${index}]`, {
        spellId: spell.id,
      });
      return 0;
    }
    return parseEffectValue(effectBurn);
  }

  logger.debug(`Unsupported product sub-part type "${type}"`, part);
  return 0;
}

export function evaluateProductPart(
  part: ProductOfSubPartsCalculationPart,
  spell: ChampionSpell,
  evaluateDataValue: DataValueEvaluator,
): Value {
  return mul(
    evaluateSubPart(part.mPart1, spell, evaluateDataValue),
    evaluateSubPart(part.mPart2, spell, evaluateDataValue),
  );
}
