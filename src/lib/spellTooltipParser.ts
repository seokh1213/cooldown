import { ChampionSpell } from "@/types";

/**
 * League of Legends 스킬 툴팁의 XML 태그를 HTML로 변환
 * 테마에 따라 색상이 잘 보이도록 조정
 */
const XML_TAG_MAP: Record<string, { tag: string; className?: string }> = {
  physicalDamage: { tag: "span", className: "text-red-600 dark:text-red-500 font-semibold" },
  magicDamage: { tag: "span", className: "text-blue-600 dark:text-blue-500 font-semibold" },
  trueDamage: { tag: "span", className: "text-yellow-600 dark:text-yellow-500 font-semibold" },
  status: { tag: "span", className: "text-purple-600 dark:text-purple-500" },
  lifeSteal: { tag: "span", className: "text-green-600 dark:text-green-500" },
  scaleAD: { tag: "span", className: "text-orange-600 dark:text-orange-500" },
  scaleAP: { tag: "span", className: "text-blue-600 dark:text-blue-400" },
  scaleArmor: { tag: "span", className: "text-orange-600 dark:text-orange-400" },
  scaleLevel: { tag: "span", className: "text-gray-600 dark:text-gray-400" },
  healing: { tag: "span", className: "text-green-600 dark:text-green-400" },
  speed: { tag: "span", className: "text-cyan-600 dark:text-cyan-500" },
  keywordMajor: { tag: "span", className: "text-yellow-600 dark:text-yellow-400 font-semibold" },
  keywordStealth: { tag: "span", className: "text-purple-600 dark:text-purple-400 font-semibold" },
  spellPassive: { tag: "span", className: "text-gray-600 dark:text-gray-500 italic" },
  spellActive: { tag: "span", className: "text-gray-900 dark:text-white font-semibold" },
  recast: { tag: "span", className: "text-yellow-600 dark:text-yellow-300" },
  damage: { tag: "span", className: "text-red-600 dark:text-red-400" },
  shield: { tag: "span", className: "text-blue-600 dark:text-blue-300" },
  mana: { tag: "span", className: "text-blue-600 dark:text-blue-400" },
  energy: { tag: "span", className: "text-yellow-600 dark:text-yellow-400" },
  health: { tag: "span", className: "text-red-600 dark:text-red-400" },
  cooldown: { tag: "span", className: "text-gray-600 dark:text-gray-300" },
  range: { tag: "span", className: "text-cyan-600 dark:text-cyan-400" },
  radius: { tag: "span", className: "text-purple-600 dark:text-purple-400" },
  width: { tag: "span", className: "text-indigo-600 dark:text-indigo-400" },
  length: { tag: "span", className: "text-pink-600 dark:text-pink-400" },
  rules: { tag: "span", className: "text-gray-600 dark:text-gray-400 italic" },
};

/**
 * XML 태그를 HTML로 변환
 * 변수 치환 전에 호출되어야 함 (XML 태그 내부의 변수도 보존)
 * font 태그는 색상 속성을 유지하여 변환
 */
function convertXmlTagsToHtml(text: string): string {
  // XML 태그 패턴: <tagName>content</tagName>
  let result = text;

  // font 태그 처리 (color 속성 보존)
  // 예: <font color='#91d7ee'>투명</font> -> <span style="color: #91d7ee">투명</span>
  result = result.replace(
    /<font\s+color=['"]([^'"]+)['"]\s*>/gi,
    '<span style="color: $1">'
  );
  result = result.replace(/<\/font>/gi, "</span>");

  // 모든 XML 태그를 찾아서 변환 (정확한 매칭을 위해 순서대로 처리)
  // 먼저 닫는 태그를 처리하고, 그 다음 여는 태그를 처리해야 중복 변환 방지
  Object.entries(XML_TAG_MAP).forEach(([xmlTag, { tag, className }]) => {
    // 닫는 태그 먼저 처리
    const closeTagRegex = new RegExp(`</${xmlTag}>`, "gi");
    result = result.replace(closeTagRegex, `</${tag}>`);
    
    // 여는 태그 처리
    const openTagRegex = new RegExp(`<${xmlTag}>`, "gi");
    result = result.replace(openTagRegex, `<${tag}${className ? ` class="${className}"` : ""}>`);
  });

  // 알려지지 않은 XML 태그 처리 (keywordMajor, keywordStealth 등)
  // keywordMajor는 이미 XML_TAG_MAP에 있지만, 혹시 모르니 처리
  const keywordTags = ['keywordMajor', 'keywordStealth', 'rules', 'recast'];
  keywordTags.forEach((keywordTag) => {
    // 닫는 태그 먼저 처리
    result = result.replace(new RegExp(`</${keywordTag}>`, "gi"), `</span>`);
    // 여는 태그 처리 (테마에 따라 색상 조정)
    if (keywordTag === 'rules') {
      result = result.replace(new RegExp(`<${keywordTag}>`, "gi"), `<span class="text-gray-600 dark:text-gray-400 italic">`);
    } else if (keywordTag === 'keywordStealth') {
      result = result.replace(new RegExp(`<${keywordTag}>`, "gi"), `<span class="text-purple-600 dark:text-purple-400 font-semibold">`);
    } else {
      result = result.replace(new RegExp(`<${keywordTag}>`, "gi"), `<span class="text-yellow-600 dark:text-yellow-400 font-semibold">`);
    }
  });

  // 나머지 알려지지 않은 XML 태그는 기본 span으로 변환
  // 단, font 태그와 이미 처리된 태그는 제외
  result = result.replace(/<(\w+)(?![\\w])>/gi, (match, tagName) => {
    // 이미 처리된 태그는 건너뛰기
    if (XML_TAG_MAP[tagName] || keywordTags.includes(tagName) || tagName === 'font' || tagName === 'br') {
      return match;
    }
    return "<span>";
  });
  result = result.replace(/<\/(\w+)(?![\\w])>/gi, (match, tagName) => {
    // 이미 처리된 태그는 건너뛰기
    if (XML_TAG_MAP[tagName] || keywordTags.includes(tagName) || tagName === 'font' || tagName === 'br') {
      return match;
    }
    return "</span>";
  });

  return result;
}

/**
 * 숫자를 깔끔하게 포맷팅 (소수점 자릿수 제한, 불필요한 0 제거)
 */
function formatNumber(value: string | number): string {
  if (value === null || value === undefined || value === "") return "";
  
  const num = typeof value === "number" ? value : parseFloat(String(value));
  
  // 숫자가 아닌 경우 원본 반환
  if (isNaN(num)) return String(value);
  
  // 정수인 경우 소수점 없이 반환
  if (num % 1 === 0) return num.toString();
  
  // 소수점이 있는 경우 최대 2자리까지, 불필요한 0 제거
  return parseFloat(num.toFixed(2)).toString();
}

/**
 * 레벨별 값을 "/" 형식으로 포맷팅
 * @param values 레벨별 값 배열
 * @param maxLevel 최대 레벨 (spell.maxrank)
 * @param skipFirst Community Dragon 데이터인 경우 true (0번째 인덱스가 버퍼)
 * @returns 포맷팅된 문자열 (예: "1/2/3" 또는 "1" - 모두 같으면)
 */
function formatLevelValues(values: (string | number)[], maxLevel?: number, skipFirst: boolean = false): string {
  if (!values || values.length === 0) return "";
  
  // Community Dragon 데이터인 경우 0번째 인덱스(버퍼) 제외
  const startIndex = skipFirst && values.length > 1 ? 1 : 0;
  const processedValues = values.slice(startIndex);
  
  const validValues = processedValues.filter(v => v !== null && v !== undefined && v !== "" && v !== "0");
  if (validValues.length === 0) return "";
  
  // 최대 레벨까지만 사용
  const displayValues = maxLevel 
    ? validValues.slice(0, maxLevel)
    : validValues;
  
  if (displayValues.length === 0) return "";
  
  // 포맷팅된 값들
  const formattedValues = displayValues.map(v => formatNumber(v));
  
  // 모든 값이 같으면 하나만 표시
  const firstValue = formattedValues[0];
  const allSame = formattedValues.every(v => v === firstValue);
  if (allSame) {
    return firstValue;
  }
  
  return formattedValues.join("/");
}

/**
 * 변수 치환 ({{ variable }} 형식)
 * 레벨별 값은 "/" 형식으로 표시
 * HTML 태그 내부의 변수도 치환하되, 태그 구조는 보존
 * @param communityDragonData Community Dragon에서 가져온 스킬 데이터 (선택적)
 */
function replaceVariables(
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
  result = result.replace(/\{\{([^}]*\{\{[^}]*\}\}[^}]*)\}\}/g, (match) => {
    // 중첩된 변수 패턴은 제거 (게임 모드별 tooltip 등은 처리 불가)
    return "";
  });
  
  // {{ variable }} 패턴 찾기 (HTML 태그 내부도 포함)
  // 하지만 HTML 태그 자체는 건드리지 않음
  const variableRegex = /\{\{([^}]+)\}\}/g;
  
  result = result.replace(variableRegex, (match, variableName) => {
    const trimmedVar = variableName.trim();
    
    // 이미 치환된 변수는 건너뛰기 (중복 방지)
    if (replacedVars.has(trimmedVar)) {
      return "";
    }
    
    // 특수 변수 처리 (spellmodifierdescriptionappend 등)
    if (trimmedVar === "spellmodifierdescriptionappend" || 
        trimmedVar.includes("gamemodeinteger") ||
        trimmedVar.includes("Spell_") && trimmedVar.includes("Tooltip")) {
      // 이런 변수들은 제거
      replacedVars.add(trimmedVar);
      return "";
    }
    
    // ammo recharge time 변수 처리 (ammo 스킬용)
    if (trimmedVar.includes("ammorechargetime") || trimmedVar.includes("ammorecharge")) {
      if (communityDragonData && communityDragonData["mAmmoRechargeTime"]) {
        const ammoRechargeTime = communityDragonData["mAmmoRechargeTime"];
        if (Array.isArray(ammoRechargeTime) && ammoRechargeTime.length > 0) {
          if (showAllLevels && ammoRechargeTime.length > 1) {
            // 0번째 인덱스는 버퍼이므로 제외하고 레벨별 값 포맷팅
            const startIndex = 1;
            const numericValues = ammoRechargeTime.slice(startIndex).map(v => typeof v === "number" ? v : parseFloat(String(v)));
            const formatted = formatLevelValues(numericValues, spell.maxrank, false);
            replacedVars.add(trimmedVar);
            return formatted;
          } else if (ammoRechargeTime.length > level) {
            // 특정 레벨의 값 (0번째 인덱스 버퍼 제외)
            const value = ammoRechargeTime[level]; // level은 1부터 시작하므로 level 인덱스 사용
            replacedVars.add(trimmedVar);
            return formatNumber(value);
          }
        }
      }
    }

    // 쿨타임 변수 처리
    if (trimmedVar.includes("cooldown") && !trimmedVar.includes("decrease")) {
      if (showAllLevels && spell.cooldownBurn) {
        // "/"로 구분된 값들을 포맷팅
        const values = spell.cooldownBurn.split("/").map(v => parseFloat(v) || 0);
        const formatted = formatLevelValues(values, spell.maxrank);
        replacedVars.add(trimmedVar);
        return formatted;
      }
      if (spell.cooldown && spell.cooldown.length >= level) {
        const cd = spell.cooldown[level - 1];
        if (cd !== undefined && cd !== null && cd !== "") {
          replacedVars.add(trimmedVar);
          return formatNumber(cd);
        }
      }
      if (spell.cooldownBurn) {
        const values = spell.cooldownBurn.split("/").map(v => parseFloat(v) || 0);
        if (values.length >= level && values[level - 1]) {
          replacedVars.add(trimmedVar);
          return formatNumber(values[level - 1]);
        }
      }
    }

    // range 변수 처리
    if (trimmedVar.includes("range") || trimmedVar.includes("attackrangebonus")) {
      if (showAllLevels && spell.rangeBurn) {
        const values = spell.rangeBurn.split("/").map(v => parseFloat(v) || 0);
        const formatted = formatLevelValues(values, spell.maxrank);
        replacedVars.add(trimmedVar);
        return formatted;
      }
      if (spell.range && spell.range.length >= level) {
        const range = spell.range[level - 1];
        if (range !== undefined && range !== null && range !== "") {
          replacedVars.add(trimmedVar);
          return formatNumber(range);
        }
      }
      if (spell.rangeBurn) {
        if (showAllLevels) {
          const values = spell.rangeBurn.split("/").map(v => parseFloat(v) || 0);
          const formatted = formatLevelValues(values, spell.maxrank);
          replacedVars.add(trimmedVar);
          return formatted;
        }
        const values = spell.rangeBurn.split("/").map(v => parseFloat(v) || 0);
        if (values.length >= level && values[level - 1]) {
          replacedVars.add(trimmedVar);
          return formatNumber(values[level - 1]);
        }
      }
    }

    // cost 변수 처리
    if (trimmedVar.includes("cost") || trimmedVar.includes("mana") || trimmedVar.includes("energy")) {
      if (showAllLevels && spell.costBurn && spell.costBurn.includes("/")) {
        const values = spell.costBurn.split("/").map(v => parseFloat(v) || 0);
        const formatted = formatLevelValues(values, spell.maxrank);
        replacedVars.add(trimmedVar);
        return formatted;
      }
      if (spell.cost && spell.cost.length >= level) {
        const cost = spell.cost[level - 1];
        if (cost !== undefined && cost !== null && cost !== "") {
          replacedVars.add(trimmedVar);
          return formatNumber(cost);
        }
      }
      if (spell.costBurn) {
        if (showAllLevels && spell.costBurn.includes("/")) {
          const values = spell.costBurn.split("/").map(v => parseFloat(v) || 0);
          const formatted = formatLevelValues(values, spell.maxrank);
          replacedVars.add(trimmedVar);
          return formatted;
        }
        const values = spell.costBurn.split("/").map(v => parseFloat(v) || 0);
        if (values.length >= level && values[level - 1]) {
          replacedVars.add(trimmedVar);
          return formatNumber(values[level - 1]);
        }
      }
    }

    // effectBurn 배열에서 값 찾기 시도 (e1, e2, e3 등 변수명 매칭)
    // 변수명이 e1, e2, e3 형식인 경우 effectBurn 배열의 인덱스와 매칭
    const effectMatch = trimmedVar.match(/^e(\d+)$/i);
    if (effectMatch && spell.effectBurn && spell.effectBurn.length > 0) {
      const effectIndex = parseInt(effectMatch[1]);
      if (effectIndex >= 0 && effectIndex < spell.effectBurn.length) {
        const effectBurnValue = spell.effectBurn[effectIndex];
        if (effectBurnValue && effectBurnValue !== "0" && effectBurnValue !== null) {
          // "/"로 구분된 값이 있으면 레벨별 표시
          if (typeof effectBurnValue === "string" && effectBurnValue.includes("/")) {
            if (showAllLevels) {
              const values = effectBurnValue.split("/").map(v => parseFloat(v) || 0);
              const formatted = formatLevelValues(values, spell.maxrank);
              replacedVars.add(trimmedVar);
              return formatted;
            }
            const values = effectBurnValue.split("/").map(v => parseFloat(v) || 0);
            if (values.length >= level && values[level - 1] && values[level - 1] !== 0) {
              replacedVars.add(trimmedVar);
              return formatNumber(values[level - 1]);
            }
          } else {
            // 단일 값이면 포맷팅하여 반환
            if (effectBurnValue !== "0") {
              replacedVars.add(trimmedVar);
              return formatNumber(effectBurnValue);
            }
          }
        }
      }
    }
    
    // effectBurn 배열에서 값 찾기 시도 (일반적인 경우 - 변수명이 명확하지 않을 때)
    // 이 부분은 마지막에만 실행되어야 함 (명확한 매칭이 없을 때만)
    if (!effectMatch && spell.effectBurn && spell.effectBurn.length > 0) {
      for (const effectBurnValue of spell.effectBurn) {
        if (effectBurnValue && effectBurnValue !== "0" && effectBurnValue !== null) {
          // "/"로 구분된 값이 있으면 레벨별 표시
          if (typeof effectBurnValue === "string" && effectBurnValue.includes("/")) {
            if (showAllLevels) {
              const values = effectBurnValue.split("/").map(v => parseFloat(v) || 0);
              const formatted = formatLevelValues(values, spell.maxrank);
              replacedVars.add(trimmedVar);
              return formatted;
            }
            const values = effectBurnValue.split("/").map(v => parseFloat(v) || 0);
            if (values.length >= level && values[level - 1] && values[level - 1] !== 0) {
              replacedVars.add(trimmedVar);
              return formatNumber(values[level - 1]);
            }
          } else {
            // 단일 값이면 포맷팅하여 반환
            if (effectBurnValue !== "0") {
              replacedVars.add(trimmedVar);
              return formatNumber(effectBurnValue);
            }
          }
        }
      }
    }

    // leveltip에서 변수명 매핑 찾기
    if (spell.leveltip?.effect) {
      for (const effect of spell.leveltip.effect) {
        // "{{ basedamage }} -> {{ basedamageNL }}" 형식에서 변수명 추출
        const match = effect.match(/\{\{([^}]+)\}\}\s*->\s*\{\{([^}]+)\}\}/);
        if (match) {
          const sourceVar = match[1].trim();
          const targetVar = match[2].trim();
          
          // 현재 변수가 sourceVar와 일치하면 targetVar로 매핑
          if (sourceVar === trimmedVar || targetVar === trimmedVar) {
            // targetVar에서 NL 접미사 제거하여 기본 변수명 찾기
            const baseVarName = targetVar.replace(/NL$/, "").replace(/nl$/, "");
            
            // 기본 변수명으로 다시 시도 (재귀 호출)
            const baseVarMatch = `{{ ${baseVarName} }}`;
            if (result.includes(baseVarMatch)) {
              // 재귀 호출 대신 직접 처리
              continue;
            }
          }
        }
      }
    }

    // 수식이 포함된 변수 처리 (예: "armorshredpercent*100")
    // 패턴: 변수명 * 숫자 또는 변수명 + 숫자 등
    const mathMatch = trimmedVar.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*([*+\-])\s*([0-9.]+)$/);
    if (mathMatch) {
      const [, varName, operator, multiplier] = mathMatch;
      const multiplierNum = parseFloat(multiplier);
      
      // 변수명 매핑 테이블
      const variableMapping: Record<string, string> = {
        'armorshredpercent': 'ArmorShredPercent',
        'attackrangebonus': 'AttackRangeBonus',
        'shredduration': 'ShredDuration',
      };
      
      // Community Dragon 데이터에서 값 찾기
      if (communityDragonData) {
        // 매핑된 변수명으로 찾기
        const mappedVarName = variableMapping[varName.toLowerCase()] || varName;
        
        // 변수명으로 직접 찾기
        if (communityDragonData[mappedVarName] && Array.isArray(communityDragonData[mappedVarName])) {
          const values = communityDragonData[mappedVarName];
          if (showAllLevels && values.length > 1) {
            // 레벨별 값 계산하여 "/" 형식으로 표시 (0번째 인덱스 버퍼 제외)
            const startIndex = values.length > 1 ? 1 : 0;
            const calculatedValues = values.slice(startIndex).map(v => {
              const num = typeof v === "number" ? v : parseFloat(String(v));
              if (operator === "*") {
                return num * multiplierNum;
              } else if (operator === "+") {
                return num + multiplierNum;
              } else if (operator === "-") {
                return num - multiplierNum;
              }
              return num;
            });
            const formatted = formatLevelValues(calculatedValues, spell.maxrank, false);
            replacedVars.add(trimmedVar);
            return formatted;
          } else if (values.length > level) {
            // 특정 레벨의 값 계산 (0번째 인덱스 버퍼 제외)
            const value = values[level]; // level은 1부터 시작하므로 level 인덱스 사용
            const num = typeof value === "number" ? value : parseFloat(String(value));
            let result: number;
            if (operator === "*") {
              result = num * multiplierNum;
            } else if (operator === "+") {
              result = num + multiplierNum;
            } else if (operator === "-") {
              result = num - multiplierNum;
            } else {
              result = num;
            }
            replacedVars.add(trimmedVar);
            return formatNumber(result);
          }
        }
        
        // 변수명 변형으로 찾기 (더 많은 변형 시도)
        const varLower = varName.toLowerCase();
        const varUpper = varName.toUpperCase();
        const camelCaseVar = varName.charAt(0).toUpperCase() + varName.slice(1);
        const pascalCaseVar = varName.split(/(?=[A-Z])/).map((s, i) => 
          i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
        ).join("");
        
        // 가능한 모든 키 찾기
        const possibleKeys = Object.keys(communityDragonData).filter(key => {
          const keyLower = key.toLowerCase();
          return (
            keyLower === varLower ||
            keyLower.includes(varLower) ||
            keyLower.includes(varUpper.toLowerCase()) ||
            keyLower.includes(camelCaseVar.toLowerCase()) ||
            keyLower.includes(pascalCaseVar.toLowerCase()) ||
            // 언더스코어 제거 후 비교
            keyLower.replace(/_/g, "") === varLower.replace(/_/g, "") ||
            keyLower.replace(/_/g, "").includes(varLower.replace(/_/g, ""))
          );
        });
        
        for (const key of possibleKeys) {
          const values = communityDragonData[key];
          if (Array.isArray(values) && values.length > 0) {
            if (showAllLevels && values.length > 1) {
              // 0번째 인덱스 버퍼 제외
              const startIndex = 1;
              const calculatedValues = values.slice(startIndex).map(v => {
                const num = typeof v === "number" ? v : parseFloat(String(v));
                if (operator === "*") {
                  return num * multiplierNum;
                } else if (operator === "+") {
                  return num + multiplierNum;
                } else if (operator === "-") {
                  return num - multiplierNum;
                }
                return num;
              });
              const formatted = formatLevelValues(calculatedValues, spell.maxrank, false);
              replacedVars.add(trimmedVar);
              return formatted;
            } else if (values.length > level) {
              // 특정 레벨의 값 계산 (0번째 인덱스 버퍼 제외)
              const value = values[level]; // level은 1부터 시작하므로 level 인덱스 사용
              const num = typeof value === "number" ? value : parseFloat(String(value));
              let result: number;
              if (operator === "*") {
                result = num * multiplierNum;
              } else if (operator === "+") {
                result = num + multiplierNum;
              } else if (operator === "-") {
                result = num - multiplierNum;
              } else {
                result = num;
              }
              replacedVars.add(trimmedVar);
              return formatNumber(result);
            }
          }
        }
      }
      
      // Community Dragon 데이터가 없거나 값을 찾을 수 없으면 제거
      return "";
    }
    
    // 단순 변수명만 있는 경우 (예: "bonusdamagett", "shredduration", "stealthduration", "cloneduration")
    // Community Dragon 데이터에서 찾기 시도
    if (communityDragonData) {
      // 변수명 매핑 테이블 (공식 API 변수명 -> Community Dragon 변수명)
      const variableMapping: Record<string, string> = {
        'attackrangebonus': 'AttackRangeBonus',
        'bonusdamagett': 'BaseDamage', // BaseDamage는 실제로는 계산된 값이 필요할 수 있음
        'shredduration': 'ShredDuration',
        'armorshredpercent': 'ArmorShredPercent',
        'cooldowndecrease': 'CooldownDecrease',
        'stealthduration': 'StealthDuration',
        'cloneduration': 'CloneDuration',
        'clonedamagemod': 'CloneDamageMod',
        'attackrangebonusnl': 'AttackRangeBonus', // NL 접미사 제거
        'shreddurationnl': 'ShredDuration',
      };
      
      // 매핑 테이블에서 찾기
      const mappedVarName = variableMapping[trimmedVar.toLowerCase()];
      if (mappedVarName && communityDragonData[mappedVarName]) {
        const values = communityDragonData[mappedVarName];
        if (Array.isArray(values) && values.length > 0) {
          if (showAllLevels && values.length > 1) {
            // 레벨별 값 포맷팅 (0번째 인덱스 버퍼 제외)
            const startIndex = 1;
            const numericValues = values.slice(startIndex).map(v => {
              // 퍼센트 값인 경우 100을 곱함
              if (mappedVarName === 'ArmorShredPercent') {
                return Number(v) * 100;
              }
              return typeof v === "number" ? v : parseFloat(String(v));
            });
            const formatted = formatLevelValues(numericValues, spell.maxrank, false);
            replacedVars.add(trimmedVar);
            // 퍼센트 값인 경우 % 추가
            if (mappedVarName === 'ArmorShredPercent') {
              return `${formatted}%`;
            }
            return formatted;
          } else if (values.length > level) {
            // 특정 레벨의 값 (0번째 인덱스 버퍼 제외)
            const value = values[level]; // level은 1부터 시작하므로 level 인덱스 사용
            let result: number;
            if (mappedVarName === 'ArmorShredPercent') {
              result = Number(value) * 100;
              replacedVars.add(trimmedVar);
              return `${formatNumber(result)}%`;
            }
            result = typeof value === "number" ? value : parseFloat(String(value));
            replacedVars.add(trimmedVar);
            return formatNumber(result);
          }
        }
      }
      
      // 매핑 테이블에 없으면 유사한 변수명 찾기 (부분 일치)
      if (!mappedVarName) {
        const varLower = trimmedVar.toLowerCase();
        const varWithoutNL = varLower.replace(/nl$/, ''); // NL 접미사 제거
        
        // Community Dragon 데이터의 모든 키를 확인하여 유사한 이름 찾기
        const allKeys = Object.keys(communityDragonData);
        
        // 1. 정확한 일치 (대소문자 무시)
        let foundKey = allKeys.find(key => key.toLowerCase() === varLower);
        
        // 2. NL 접미사 제거 후 일치
        if (!foundKey) {
          foundKey = allKeys.find(key => {
            const keyLower = key.toLowerCase();
            return keyLower === varWithoutNL || keyLower.replace(/nl$/, '') === varWithoutNL;
          });
        }
        
        // 3. 부분 일치 (변수명이 키에 포함되거나 키가 변수명에 포함)
        if (!foundKey) {
          foundKey = allKeys.find(key => {
            const keyLower = key.toLowerCase();
            return (
              keyLower.includes(varLower) || 
              varLower.includes(keyLower) ||
              keyLower.includes(varWithoutNL) ||
              varWithoutNL.includes(keyLower)
            );
          });
        }
        
        // 4. 단어 단위로 매칭 (예: "armorshredpercent" -> "ArmorShredPercent")
        if (!foundKey) {
          // camelCase를 단어로 분리하여 매칭
          const varWords = varLower.replace(/([A-Z])/g, ' $1').toLowerCase().split(/\s+/);
          foundKey = allKeys.find(key => {
            const keyLower = key.toLowerCase();
            const keyWords = key.replace(/([A-Z])/g, ' $1').toLowerCase().split(/\s+/);
            // 모든 단어가 포함되는지 확인
            return varWords.every(word => keyWords.some(kw => kw.includes(word) || word.includes(kw)));
          });
        }
        
        if (foundKey && communityDragonData[foundKey]) {
          const values = communityDragonData[foundKey];
          if (Array.isArray(values) && values.length > 0) {
            if (showAllLevels && values.length > 1) {
              // 레벨별 값 포맷팅 (0번째 인덱스 버퍼 제외)
              const startIndex = 1;
              const numericValues = values.slice(startIndex).map(v => {
                // 퍼센트 관련 변수인 경우 100을 곱함
                if (foundKey.toLowerCase().includes('percent') || foundKey.toLowerCase().includes('shred')) {
                  const numValue = Number(v);
                  if (numValue < 1 && numValue > 0) {
                    return numValue * 100;
                  }
                }
                return typeof v === "number" ? v : parseFloat(String(v));
              });
              const formatted = formatLevelValues(numericValues, spell.maxrank, false);
              replacedVars.add(trimmedVar);
              // 퍼센트 관련 변수인 경우 % 추가
              if (foundKey.toLowerCase().includes('percent') || foundKey.toLowerCase().includes('shred')) {
                const firstValue = Number(values[startIndex] || values[1]);
                if (firstValue < 1 && firstValue > 0) {
                  return `${formatted}%`;
                }
              }
              return formatted;
            } else if (values.length > level) {
              // 특정 레벨의 값 (0번째 인덱스 버퍼 제외)
              const value = values[level]; // level은 1부터 시작하므로 level 인덱스 사용
              const numValue = Number(value);
              if ((foundKey.toLowerCase().includes('percent') || foundKey.toLowerCase().includes('shred')) && numValue < 1 && numValue > 0) {
                replacedVars.add(trimmedVar);
                return `${formatNumber(numValue * 100)}%`;
              }
              replacedVars.add(trimmedVar);
              return formatNumber(value);
            }
          }
        }
      }
      
      // 정확한 변수명으로 찾기 (대소문자 무시)
      const exactMatch = Object.keys(communityDragonData).find(key => 
        key.toLowerCase() === trimmedVar.toLowerCase()
      );
      if (exactMatch && Array.isArray(communityDragonData[exactMatch])) {
        const values = communityDragonData[exactMatch];
        if (showAllLevels && values.length > 1) {
          // 0번째 인덱스 버퍼 제외
          const startIndex = 1;
          const numericValues = values.slice(startIndex).map(v => typeof v === "number" ? v : parseFloat(String(v)));
          const formatted = formatLevelValues(numericValues, spell.maxrank, false);
          replacedVars.add(trimmedVar);
          return formatted;
        } else if (values.length > level) {
          // 특정 레벨의 값 (0번째 인덱스 버퍼 제외)
          replacedVars.add(trimmedVar);
          return formatNumber(values[level]); // level은 1부터 시작하므로 level 인덱스 사용
        }
      }
      
      // 변수명 변형으로 찾기 (더 많은 변형 시도)
      const varLower = trimmedVar.toLowerCase();
      const varUpper = trimmedVar.toUpperCase();
      const camelCaseVar = trimmedVar.charAt(0).toUpperCase() + trimmedVar.slice(1);
      const pascalCaseVar = trimmedVar.split(/(?=[A-Z])/).map((s, i) => 
        i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
      ).join("");
      
      const possibleKeys = Object.keys(communityDragonData).filter(key => {
        const keyLower = key.toLowerCase();
        return (
          keyLower === varLower ||
          keyLower.includes(varLower) ||
          keyLower.includes(varUpper.toLowerCase()) ||
          keyLower.includes(camelCaseVar.toLowerCase()) ||
          keyLower.includes(pascalCaseVar.toLowerCase()) ||
          // 언더스코어 제거 후 비교
          keyLower.replace(/_/g, "") === varLower.replace(/_/g, "") ||
          keyLower.replace(/_/g, "").includes(varLower.replace(/_/g, ""))
        );
      });
      
      for (const key of possibleKeys) {
        const values = communityDragonData[key];
        if (Array.isArray(values) && values.length > 0) {
          if (showAllLevels && values.length > 1) {
            // 0번째 인덱스 버퍼 제외
            const startIndex = 1;
            const numericValues = values.slice(startIndex).map(v => typeof v === "number" ? v : parseFloat(String(v)));
            const formatted = formatLevelValues(numericValues, spell.maxrank, false);
            replacedVars.add(trimmedVar);
            return formatted;
          } else if (values.length > level) {
            // 특정 레벨의 값 (0번째 인덱스 버퍼 제외)
            replacedVars.add(trimmedVar);
            return formatNumber(values[level]); // level은 1부터 시작하므로 level 인덱스 사용
          }
        }
      }
    }

    // 값을 찾을 수 없으면 빈 문자열로 제거
    return "";
  });

  // 치환 후 남은 불완전한 변수 패턴 제거 ({{ 또는 }}만 남은 경우)
  result = result.replace(/\{\{\s*\}/g, ""); // {{ }} 패턴 제거
  result = result.replace(/\}\}/g, ""); // 남은 }} 제거
  result = result.replace(/\{\{/g, ""); // 남은 {{ 제거
  
  // 치환 후 남은 "%" 기호가 혼자 있는 경우 제거
  // 예: "{{ armorshredpercent*100 }}%" -> "%" -> ""
  // 하지만 실제 퍼센트 값은 유지해야 하므로, 숫자와 함께 있는 경우는 유지
  result = result.replace(/\s+%\s+/g, " "); // 공백으로 둘러싸인 % 제거
  result = result.replace(/(?<!\d)\s*%\s*(?!\d)/g, ""); // 숫자와 함께 있지 않은 % 제거
  result = result.replace(/^\s*%\s*/g, ""); // 시작 부분의 % 제거
  result = result.replace(/\s*%\s*$/g, ""); // 끝 부분의 % 제거

  // 중복된 숫자 패턴 제거 (예: "25/30/35% 0.25/0.3/0.35" -> "25/30/35%")
  // 같은 값이지만 다른 형식(퍼센트 vs 소수점)으로 표시되는 것을 방지
  
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
    const decimalValues = decimalMatch.value.split('/').map(v => parseFloat(v));
    
    // 앞에 있는 퍼센트 값과 비교
    for (const percentMatch of percentMatches) {
      if (percentMatch.index < decimalMatch.index) {
        const percentValues = percentMatch.value.split('/').map(v => parseFloat(v));
        
        // 같은 값인지 확인 (퍼센트 값을 100으로 나눈 값과 소수점 값 비교)
        if (percentValues.length === decimalValues.length && percentValues.length > 0) {
          const isSame = percentValues.every((pv, idx) => {
            if (idx >= decimalValues.length) return false;
            const expectedDecimal = pv / 100;
            return Math.abs(expectedDecimal - decimalValues[idx]) < 0.01;
          });
          
          if (isSame) {
            // 소수점 패턴 제거
            const before = result.substring(0, decimalMatch.index);
            const after = result.substring(decimalMatch.index + decimalMatch.value.length);
            result = (before + after).replace(/\s+/g, ' ').trim();
            break; // 하나만 제거하고 다음으로
          }
        }
      }
    }
  }
  
  // 연속된 공백 정리
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * HTML 태그 정리 및 안전한 렌더링을 위한 처리
 */
function sanitizeHtml(text: string): string {
  let result = text;

  // <br /> 태그를 줄바꿈으로 변환
  result = result.replace(/<br\s*\/?>/gi, "\n");

  // 연속된 공백 정리
  result = result.replace(/\s+/g, " ");

  return result;
}

/**
 * 스킬 툴팁 파싱 메인 함수
 * @param text 원본 툴팁 텍스트
 * @param spell 스킬 데이터 (변수 치환용)
 * @param level 스킬 레벨 (기본값: 1)
 * @param showAllLevels 레벨별 값을 "/" 형식으로 모두 표시할지 여부 (기본값: true)
 * @param communityDragonData Community Dragon에서 가져온 스킬 데이터 (선택적)
 * @returns 파싱된 HTML 문자열
 */
export function parseSpellTooltip(
  text: string | undefined,
  spell?: ChampionSpell,
  level: number = 1,
  showAllLevels: boolean = true,
  communityDragonData?: Record<string, (number | string)[]>
): string {
  if (!text) return "";

  let result = text;

  // 1. XML 태그를 먼저 HTML로 변환 (변수 치환 전에 수행하여 태그 범위 보존)
  result = convertXmlTagsToHtml(result);

  // 2. 변수 치환 (XML 태그 변환 후 수행)
  result = replaceVariables(result, spell, level, showAllLevels, communityDragonData);

  // 3. HTML 정리
  result = sanitizeHtml(result);

  // 4. 줄바꿈을 <br />로 다시 변환 (렌더링을 위해)
  result = result.replace(/\n/g, "<br />");

  // 5. 결과가 비어있거나 특수 변수만 남은 경우 description 사용
  const trimmedResult = result.trim();
  if (!trimmedResult || trimmedResult.length === 0) {
    // description이 있으면 사용
    if (spell?.description) {
      return parseSpellTooltip(spell.description, spell, level, showAllLevels, communityDragonData);
    }
  }

  return result;
}

/**
 * 스킬 설명 파싱 (description 필드용)
 * description은 보통 tooltip보다 간단하므로 기본적인 처리만 수행
 */
export function parseSpellDescription(
  text: string | undefined,
  spell?: ChampionSpell
): string {
  if (!text) return "";

  let result = text;

  // XML 태그 제거 또는 변환
  result = convertXmlTagsToHtml(result);

  // 변수 치환 (간단한 버전)
  result = replaceVariables(result, spell, 1);

  return result;
}

