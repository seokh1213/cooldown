import { ChampionSpell } from "@/types";
import { formatNumber, formatLevelValues } from "./formatters";

/**
 * 변수 치환 ({{ variable }} 형식)
 * 레벨별 값은 "/" 형식으로 표시
 * HTML 태그 내부의 변수도 치환하되, 태그 구조는 보존
 * @param communityDragonData Community Dragon에서 가져온 스킬 데이터 (선택적)
 */
export function replaceVariables(
  text: string,
  spell?: ChampionSpell,
  level: number = 1,
  showAllLevels: boolean = true,
  communityDragonData?: Record<string, (number | string)[]>
): string {
  if (!spell) return text;

  let result = text;

  // 이미 치환된 변수를 추적하여 중복 방지
  const replacedVars = new Set<string>();

  // 중첩된 변수 패턴 처리 (예: {{Spell_GangplankQWrapper_Tooltip_{{ gamemodeinteger }}}})
  // 먼저 중첩된 패턴을 제거하거나 처리
  result = result.replace(/\{\{([^}]*\{\{[^}]*\}\}[^}]*)\}\}/g, () => {
    // 중첩된 변수 패턴은 제거 (게임 모드별 tooltip 등은 처리 불가)
    return "";
  });

  // Spell_*_Tooltip 패턴 제거 (Community Dragon에서도 치환이 안되는 값)
  result = result.replace(/\{\{Spell_[^}]*Tooltip[^}]*\}\}/gi, "");

  // spellmodifierdescriptionappend 단독 패턴 제거
  result = result.replace(/\{\{spellmodifierdescriptionappend\}\}/gi, "");

  // {{ variable }} 패턴 찾기 (HTML 태그 내부도 포함)
  // 하지만 HTML 태그 자체는 건드리지 않음
  const variableRegex = /\{\{([^}]+)\}\}/g;

  result = result.replace(variableRegex, (_match, variableName) => {
    const trimmedVar = variableName.trim();

    // 이미 치환된 변수는 건너뛰기 (중복 방지)
    if (replacedVars.has(trimmedVar)) {
      return "";
    }

    // 특수 변수 처리 (spellmodifierdescriptionappend 등)
    if (
      trimmedVar === "spellmodifierdescriptionappend" ||
      trimmedVar.includes("gamemodeinteger") ||
      (trimmedVar.includes("Spell_") && trimmedVar.includes("Tooltip"))
    ) {
      // 이런 변수들은 제거
      replacedVars.add(trimmedVar);
      return "";
    }

    // 변수 치환 로직 (기존 코드에서 가져옴)
    const replacement = replaceVariable(
      trimmedVar,
      spell,
      level,
      showAllLevels,
      communityDragonData,
      replacedVars
    );

    if (replacement !== null) {
      replacedVars.add(trimmedVar);
      return replacement;
    }

    // 값을 찾을 수 없으면 빈 문자열로 제거
    return "";
  });

  // 치환 후 남은 불완전한 변수 패턴 제거 ({{ 또는 }}만 남은 경우)
  result = result.replace(/\{\{\s*\}/g, ""); // {{ }} 패턴 제거
  result = result.replace(/\}\}/g, ""); // 남은 }} 제거
  result = result.replace(/\{\{/g, ""); // 남은 {{ 제거

  // 치환 후 남은 "%" 기호가 혼자 있는 경우 제거
  result = result.replace(/\s+%\s+/g, " "); // 공백으로 둘러싸인 % 제거
  result = result.replace(/(?<!\d)\s*%\s*(?!\d)/g, ""); // 숫자와 함께 있지 않은 % 제거
  result = result.replace(/^\s*%\s*/g, ""); // 시작 부분의 % 제거
  result = result.replace(/\s*%\s*$/g, ""); // 끝 부분의 % 제거

  // 중복된 숫자 패턴 제거 (예: "25/30/35% 0.25/0.3/0.35" -> "25/30/35%")
  result = removeDuplicatePercentPatterns(result);

  // 연속된 공백 정리
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

/**
 * 개별 변수 치환 로직
 */
function replaceVariable(
  trimmedVar: string,
  spell: ChampionSpell,
  level: number,
  showAllLevels: boolean,
  communityDragonData?: Record<string, (number | string)[]>,
  _replacedVars?: Set<string>
): string | null {
  // ammo recharge time 변수 처리
  if (
    trimmedVar.includes("ammorechargetime") ||
    trimmedVar.includes("ammorecharge")
  ) {
    // 새로운 구조 지원: DataValues가 있으면 그것을 사용, 없으면 전체 객체 사용 (호환성)
    const dataValues = (communityDragonData as any)?.DataValues || communityDragonData;
    if (dataValues && dataValues["mAmmoRechargeTime"]) {
      const ammoRechargeTime = dataValues["mAmmoRechargeTime"];
      if (Array.isArray(ammoRechargeTime) && ammoRechargeTime.length > 0) {
        if (showAllLevels && ammoRechargeTime.length > 1) {
          const startIndex = 1;
          const numericValues = ammoRechargeTime
            .slice(startIndex)
            .map((v) => (typeof v === "number" ? v : parseFloat(String(v))));
          return formatLevelValues(numericValues, spell.maxrank, false);
        } else if (ammoRechargeTime.length > level) {
          const value = ammoRechargeTime[level];
          return formatNumber(value);
        }
      }
    }
  }

  // 쿨타임 변수 처리
  if (trimmedVar.includes("cooldown") && !trimmedVar.includes("decrease")) {
    if (showAllLevels && spell.cooldownBurn) {
      const values = spell.cooldownBurn.split("/").map((v) => parseFloat(v) || 0);
      return formatLevelValues(values, spell.maxrank);
    }
    if (spell.cooldown && spell.cooldown.length >= level) {
      const cd = spell.cooldown[level - 1];
      if (cd !== undefined && cd !== null && cd !== "") {
        return formatNumber(cd);
      }
    }
    if (spell.cooldownBurn) {
      const values = spell.cooldownBurn.split("/").map((v) => parseFloat(v) || 0);
      if (values.length >= level && values[level - 1]) {
        return formatNumber(values[level - 1]);
      }
    }
  }

  // range 변수 처리
  if (trimmedVar.includes("range") || trimmedVar.includes("attackrangebonus")) {
    if (showAllLevels && spell.rangeBurn) {
      const values = spell.rangeBurn.split("/").map((v) => parseFloat(v) || 0);
      return formatLevelValues(values, spell.maxrank);
    }
    if (spell.range && spell.range.length >= level) {
      const range = spell.range[level - 1];
      if (range !== undefined && range !== null && range !== "") {
        return formatNumber(range);
      }
    }
    if (spell.rangeBurn) {
      if (showAllLevels) {
        const values = spell.rangeBurn.split("/").map((v) => parseFloat(v) || 0);
        return formatLevelValues(values, spell.maxrank);
      }
      const values = spell.rangeBurn.split("/").map((v) => parseFloat(v) || 0);
      if (values.length >= level && values[level - 1]) {
        return formatNumber(values[level - 1]);
      }
    }
  }

  // cost 변수 처리
  if (
    trimmedVar.includes("cost") ||
    trimmedVar.includes("mana") ||
    trimmedVar.includes("energy")
  ) {
    if (showAllLevels && spell.costBurn && spell.costBurn.includes("/")) {
      const values = spell.costBurn.split("/").map((v) => parseFloat(v) || 0);
      return formatLevelValues(values, spell.maxrank);
    }
    if (spell.cost && spell.cost.length >= level) {
      const cost = spell.cost[level - 1];
      if (cost !== undefined && cost !== null && cost !== "") {
        return formatNumber(cost);
      }
    }
    if (spell.costBurn) {
      if (showAllLevels && spell.costBurn.includes("/")) {
        const values = spell.costBurn.split("/").map((v) => parseFloat(v) || 0);
        return formatLevelValues(values, spell.maxrank);
      }
      const values = spell.costBurn.split("/").map((v) => parseFloat(v) || 0);
      if (values.length >= level && values[level - 1]) {
        return formatNumber(values[level - 1]);
      }
    }
  }

  // effectBurn 배열에서 값 찾기
  const effectMatch = trimmedVar.match(/^e(\d+)$/i);
  if (effectMatch && spell.effectBurn && spell.effectBurn.length > 0) {
    const effectIndex = parseInt(effectMatch[1]);
    if (effectIndex >= 0 && effectIndex < spell.effectBurn.length) {
      const effectBurnValue = spell.effectBurn[effectIndex];
      if (effectBurnValue && effectBurnValue !== "0" && effectBurnValue !== null) {
        if (typeof effectBurnValue === "string" && effectBurnValue.includes("/")) {
          if (showAllLevels) {
            const values = effectBurnValue.split("/").map((v) => parseFloat(v) || 0);
            return formatLevelValues(values, spell.maxrank);
          }
          const values = effectBurnValue.split("/").map((v) => parseFloat(v) || 0);
          if (values.length >= level && values[level - 1] && values[level - 1] !== 0) {
            return formatNumber(values[level - 1]);
          }
        } else {
          if (effectBurnValue !== "0") {
            return formatNumber(effectBurnValue);
          }
        }
      }
    }
  }

  // Community Dragon 데이터에서 찾기
  if (communityDragonData) {
    // 새로운 구조 지원: DataValues가 있으면 그것을 사용, 없으면 전체 객체 사용 (호환성)
    const dataValues = (communityDragonData as any)?.DataValues || communityDragonData;
    const replacement = findInCommunityDragonData(
      trimmedVar,
      spell,
      level,
      showAllLevels,
      dataValues as Record<string, (number | string)[]>,
      communityDragonData as any
    );
    if (replacement !== null) {
      return replacement;
    }
  }

  return null;
}

/**
 * Community Dragon 데이터에서 변수 찾기
 */
function findInCommunityDragonData(
  trimmedVar: string,
  spell: ChampionSpell,
  level: number,
  showAllLevels: boolean,
  communityDragonData: Record<string, (number | string)[]>,
  fullCommunityDragonData?: Record<string, any>
): string | null {
  // 먼저 mSpellCalculations에서 계산 공식 찾기 시도
  if (fullCommunityDragonData?.mSpellCalculations) {
    const calculationResult = findInSpellCalculations(
      trimmedVar,
      spell,
      level,
      showAllLevels,
      fullCommunityDragonData.mSpellCalculations,
      communityDragonData
    );
    if (calculationResult !== null) {
      return calculationResult;
    }
  }

  // 수식이 포함된 변수 처리 (예: "armorshredpercent*100")
  const mathMatch = trimmedVar.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*([*+-])\s*([0-9.]+)$/);
  if (mathMatch) {
    const [, varName, operator, multiplier] = mathMatch;
    const multiplierNum = parseFloat(multiplier);
    return processMathVariable(
      varName,
      operator,
      multiplierNum,
      spell,
      level,
      showAllLevels,
      communityDragonData
    );
  }

  // 단순 변수명만 있는 경우
  return processSimpleVariable(
    trimmedVar,
    spell,
    level,
    showAllLevels,
    communityDragonData
  );
}

/**
 * 수식 변수 처리 (예: armorshredpercent*100)
 */
function processMathVariable(
  varName: string,
  operator: string,
  multiplier: number,
  spell: ChampionSpell,
  level: number,
  showAllLevels: boolean,
  communityDragonData: Record<string, (number | string)[]>
): string | null {
  const variableMapping: Record<string, string> = {
    armorshredpercent: "ArmorShredPercent",
    attackrangebonus: "AttackRangeBonus",
    shredduration: "ShredDuration",
  };

  const mappedVarName = variableMapping[varName.toLowerCase()] || varName;

  if (communityDragonData[mappedVarName] && Array.isArray(communityDragonData[mappedVarName])) {
    const values = communityDragonData[mappedVarName];
    if (showAllLevels && values.length > 1) {
      const startIndex = values.length > 1 ? 1 : 0;
      const calculatedValues = values.slice(startIndex).map((v) => {
        const num = typeof v === "number" ? v : parseFloat(String(v));
        if (operator === "*") return num * multiplier;
        if (operator === "+") return num + multiplier;
        if (operator === "-") return num - multiplier;
        return num;
      });
      return formatLevelValues(calculatedValues, spell.maxrank, false);
    } else if (values.length > level) {
      const value = values[level];
      const num = typeof value === "number" ? value : parseFloat(String(value));
      let result: number;
      if (operator === "*") result = num * multiplier;
      else if (operator === "+") result = num + multiplier;
      else if (operator === "-") result = num - multiplier;
      else result = num;
      return formatNumber(result);
    }
  }

  return null;
}

/**
 * 단순 변수 처리
 */
function processSimpleVariable(
  trimmedVar: string,
  spell: ChampionSpell,
  level: number,
  showAllLevels: boolean,
  communityDragonData: Record<string, (number | string)[]>
): string | null {
  const variableMapping: Record<string, string> = {
    attackrangebonus: "AttackRangeBonus",
    bonusdamagett: "BaseDamage",
    shredduration: "ShredDuration",
    armorshredpercent: "ArmorShredPercent",
    cooldowndecrease: "CooldownDecrease",
    stealthduration: "StealthDuration",
    cloneduration: "CloneDuration",
    clonedamagemod: "CloneDamageMod",
    attackrangebonusnl: "AttackRangeBonus",
    shreddurationnl: "ShredDuration",
  };

  const mappedVarName = variableMapping[trimmedVar.toLowerCase()];
  if (mappedVarName && communityDragonData[mappedVarName]) {
    const values = communityDragonData[mappedVarName];
    if (Array.isArray(values) && values.length > 0) {
      if (showAllLevels && values.length > 1) {
        const startIndex = 1;
        const numericValues = values.slice(startIndex).map((v) => {
          if (mappedVarName === "ArmorShredPercent") {
            return Number(v) * 100;
          }
          return typeof v === "number" ? v : parseFloat(String(v));
        });
        const formatted = formatLevelValues(numericValues, spell.maxrank, false);
        if (mappedVarName === "ArmorShredPercent") {
          return `${formatted}%`;
        }
        return formatted;
      } else if (values.length > level) {
        const value = values[level];
        if (mappedVarName === "ArmorShredPercent") {
          const result = Number(value) * 100;
          return `${formatNumber(result)}%`;
        }
        return formatNumber(value);
      }
    }
  }

  // 유사한 변수명 찾기
  const varLower = trimmedVar.toLowerCase();
  const foundKey = Object.keys(communityDragonData).find(
    (key) => key.toLowerCase() === varLower
  );

  if (foundKey && Array.isArray(communityDragonData[foundKey])) {
    const values = communityDragonData[foundKey];
    if (showAllLevels && values.length > 1) {
      const startIndex = 1;
      const numericValues = values.slice(startIndex).map((v) =>
        typeof v === "number" ? v : parseFloat(String(v))
      );
      return formatLevelValues(numericValues, spell.maxrank, false);
    } else if (values.length > level) {
      return formatNumber(values[level]);
    }
  }

  return null;
}

/**
 * 중복된 퍼센트 패턴 제거
 */
function removeDuplicatePercentPatterns(result: string): string {
  // 텍스트에서 모든 퍼센트 값 찾기
  const percentMatches: Array<{ value: string; index: number }> = [];
  const percentRegex = /(\d+(?:\/\d+)+)%/g;
  let match;
  while ((match = percentRegex.exec(result)) !== null) {
    percentMatches.push({ value: match[1], index: match.index });
  }

  // 텍스트에서 모든 소수점 패턴 찾기 (0.숫자/0.숫자 형식)
  const decimalRegex = /(0\.[0-9]+(?:\/0?\.[0-9]+)+)/g;
  const decimalMatches: Array<{ value: string; index: number }> = [];
  while ((match = decimalRegex.exec(result)) !== null) {
    decimalMatches.push({ value: match[1], index: match.index });
  }

  // 각 소수점 패턴이 퍼센트 값과 같은지 확인하고 제거
  for (let i = decimalMatches.length - 1; i >= 0; i--) {
    const decimalMatch = decimalMatches[i];
    const decimalValues = decimalMatch.value.split("/").map((v) => parseFloat(v));

    // 앞에 있는 퍼센트 값과 비교
    for (const percentMatch of percentMatches) {
      if (percentMatch.index < decimalMatch.index) {
        const percentValues = percentMatch.value.split("/").map((v) => parseFloat(v));

        // 같은 값인지 확인 (퍼센트 값을 100으로 나눈 값과 소수점 값 비교)
        if (
          percentValues.length === decimalValues.length &&
          percentValues.length > 0
        ) {
          const isSame = percentValues.every((pv, idx) => {
            if (idx >= decimalValues.length) return false;
            const expectedDecimal = pv / 100;
            return Math.abs(expectedDecimal - decimalValues[idx]) < 0.01;
          });

          if (isSame) {
            // 소수점 패턴 제거
            const before = result.substring(0, decimalMatch.index);
            const after = result.substring(decimalMatch.index + decimalMatch.value.length);
            result = (before + after).replace(/\s+/g, " ").trim();
            break; // 하나만 제거하고 다음으로
          }
        }
      }
    }
  }

  return result;
}

/**
 * mSpellCalculations에서 계산 공식 찾기
 * 계산 공식의 계수를 추출하여 표시 (예: AD 계수 0.5 -> 50%)
 */
function findInSpellCalculations(
  trimmedVar: string,
  spell: ChampionSpell,
  level: number,
  showAllLevels: boolean,
  mSpellCalculations: Record<string, any>,
  dataValues: Record<string, (number | string)[]>
): string | null {
  // 변수명을 계산 공식 이름으로 매핑 시도
  const varLower = trimmedVar.toLowerCase();
  
  // 일반적인 계산 공식 이름 패턴 매칭
  const calculationNameMap: Record<string, string[]> = {
    "damage": ["TotalDamage", "ShotDamage", "Damage", "BaseDamage"],
    "totaldamage": ["TotalDamage", "ShotDamage"],
    "shotdamage": ["ShotDamage"],
    "basedamage": ["BaseDamage"],
    "adratio": ["TotalDamage", "ShotDamage", "Damage"],
    "ad": ["TotalDamage", "ShotDamage", "Damage"],
    "ratio": ["TotalDamage", "ShotDamage", "Damage"],
  };

  // 변수명에 따라 계산 공식 이름 후보 찾기
  let calculationNames: string[] = [];
  for (const [key, names] of Object.entries(calculationNameMap)) {
    if (varLower.includes(key)) {
      calculationNames.push(...names);
    }
  }

  // 직접 매칭도 시도
  if (mSpellCalculations[trimmedVar]) {
    calculationNames.unshift(trimmedVar);
  }
  if (mSpellCalculations[varLower]) {
    calculationNames.unshift(varLower);
  }

  // 각 계산 공식 후보를 확인
  for (const calcName of calculationNames) {
    const calculation = mSpellCalculations[calcName];
    if (!calculation || !calculation.mFormulaParts || !Array.isArray(calculation.mFormulaParts)) {
      continue;
    }

    // AD 계수 추출 (StatByCoefficientCalculationPart 또는 StatByNamedDataValueCalculationPart)
    let adCoefficient: number | null = null;
    let baseDamage: (number | string)[] | null = null;

    for (const part of calculation.mFormulaParts) {
      const partType = part.__type;

      // StatByCoefficientCalculationPart: 스탯 * 계수 (예: AD * 0.5)
      if (partType === "StatByCoefficientCalculationPart" && part.mCoefficient !== undefined) {
        const coeff = typeof part.mCoefficient === "number" ? part.mCoefficient : parseFloat(String(part.mCoefficient));
        // mStat이 2면 AD (Attack Damage)
        if (part.mStat === 2 || part.mStat === undefined) {
          adCoefficient = coeff;
        }
      }

      // StatByNamedDataValueCalculationPart: 스탯 * DataValue (예: AD * ADRatio)
      if (partType === "StatByNamedDataValueCalculationPart" && part.mDataValue && part.mStat === 2) {
        const ratioName = part.mDataValue;
        if (dataValues[ratioName] && Array.isArray(dataValues[ratioName])) {
          // ADRatio 값이 있으면 사용 (보통 1.0이지만 0.5일 수도 있음)
          const ratioValues = dataValues[ratioName];
          if (showAllLevels && ratioValues.length > 1) {
            const startIndex = 1;
            const numericValues = ratioValues.slice(startIndex).map((v) => {
              const num = typeof v === "number" ? v : parseFloat(String(v));
              return num * 100; // 퍼센트로 변환
            });
            return formatLevelValues(numericValues, spell.maxrank, false) + "%";
          } else if (ratioValues.length > level) {
            const value = ratioValues[level];
            const num = typeof value === "number" ? value : parseFloat(String(value));
            return formatNumber(num * 100) + "%";
          }
        }
      }

      // NamedDataValueCalculationPart: 기본 피해량
      if (partType === "NamedDataValueCalculationPart" && part.mDataValue) {
        const dataValueName = part.mDataValue;
        if (dataValues[dataValueName] && Array.isArray(dataValues[dataValueName])) {
          baseDamage = dataValues[dataValueName];
        }
      }
    }

    // AD 계수가 있으면 퍼센트로 표시
    if (adCoefficient !== null) {
      const percentValue = adCoefficient * 100;
      return formatNumber(percentValue) + "%";
    }

    // 기본 피해량이 있고 AD 계수도 있으면 함께 표시할 수 있지만, 여기서는 계수만 반환
    // (기본 피해량은 다른 곳에서 처리됨)
  }

  return null;
}

