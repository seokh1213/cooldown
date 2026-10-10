import { ChampionSpell } from "@/domain/game/types";
import { CommunityDragonSpellData, DroppedCalculation, TooltipLocale } from "../contracts";
import { resolveReferenceFirstRank } from "../data/rankZeroReferences";
import { resolveRuntimeTokenAlias } from "../data/runtimeTokenAliases";
import type { LevelValuesReporter } from "../formatting/calculationResultFormatter";
import { replaceData } from "./dataValueHandler";
import { parseExpression } from "./expressionParser";
import { replaceCalculateData } from "./spellCalculationHandler";
import {
  replaceEffectBurn,
  replaceHotKey,
  replaceSpellField,
  replaceSpellMetadata,
  resolveSpellRefData,
} from "./spellValues";

/**
 * 단일 변수 치환
 * @param trimmedVar 변수명
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon 데이터
 * @returns 치환된 문자열 또는 null
 */
export function replaceVariable(
  trimmedVar: string,
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: TooltipLocale = "ko_KR",
  reportDrop?: (entry: DroppedCalculation) => void,
  reportLevelValues?: LevelValuesReporter
): string | null {
  const effectAlias = /^Effect(\d+)Amount(.*)$/i.exec(trimmedVar);
  const runtimeAlias = resolveRuntimeTokenAlias(spell.id, trimmedVar);
  const normalizedVariable = runtimeAlias
    ? runtimeAlias
    : effectAlias
      ? `e${effectAlias[1]}${effectAlias[2]}`
      : /^AmmoRechargeTime(.*)$/i.test(trimmedVar)
        ? trimmedVar.replace(/^AmmoRechargeTime/i, "mAmmoRechargeTime")
        : trimmedVar;
  const parseResult = parseExpression(normalizedVariable);

  const bySpellMetadata = replaceSpellMetadata(parseResult, spell);
  if (bySpellMetadata !== null) return bySpellMetadata;

  // `spell.<이름>:<변수>` 는 값의 출처 스킬이 명시된 형태다.
  // 자기 자신을 가리키면 그대로, 다른 스킬이면 형제 스킬 데이터에서 찾는다.
  const targetData = resolveSpellRefData(parseResult.spellRef, spell, communityDragonData);
  if (parseResult.spellRef && !targetData) {
    return null;
  }
  const data = targetData ?? communityDragonData;
  // 다른 스킬 값은 그 스킬의 랭크 축으로 읽는다. 부르는 쪽 랭크 수로 자르면
  // 패시브(랭크 1)가 부른 일라오이 Q 배율이 1랭크 값(×1.1)으로 굳는다.
  const isSibling = Boolean(targetData && targetData !== communityDragonData);
  const siblingMaxRank = isSibling ? targetData?.maxRank : undefined;
  const valueSpell: ChampionSpell =
    siblingMaxRank ? { ...spell, maxrank: siblingMaxRank } : spell;
  // 대상 스킬을 배우기 전에도 보이는 값이면 0랭크부터 읽는다 (피오라 패시브 → FioraR 20/30/40/50%)
  const firstRank =
    siblingMaxRank && targetData
      ? resolveReferenceFirstRank(spell.id, communityDragonData, targetData, parseResult)
      : 1;
  const reportSiblingDrop = reportDrop && isSibling
    ? (entry: DroppedCalculation) =>
        reportDrop({ ...entry, key: `${parseResult.spellRef}:${entry.key}` })
    : reportDrop;

  // 0. 다른 스킬의 단축키를 가리키는 토큰 (에코 R 의 spell.EkkoW:HotKey)
  const byHotKey = replaceHotKey(parseResult);
  if (byHotKey !== null) return byHotKey;

  // 0. effectBurn 기반 eN 변수(e1, e2, e3, ...) 우선 처리
  const byEffectBurn = replaceEffectBurn(parseResult, valueSpell, data);
  if (byEffectBurn !== null) return byEffectBurn;

  // 0.5 DDragon 스킬 자체 필드(cost, maxammo)를 가리키는 토큰
  const bySpellField = replaceSpellField(parseResult, spell);
  if (bySpellField !== null) return bySpellField;

  // 1. DataValues 먼저 시도
  const byData = replaceData(parseResult, valueSpell, data, firstRank);
  if (byData !== null) return byData;

  // 2. 안 되면 mSpellCalculations
  return replaceCalculateData(parseResult, valueSpell, data, lang, reportSiblingDrop, firstRank, reportLevelValues);
}
