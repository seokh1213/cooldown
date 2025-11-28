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
 * 레벨별 값을 "/" 형식으로 포맷팅
 */
function formatLevelValues(values: (string | number)[], maxLevel?: number): string {
  if (!values || values.length === 0) return "";
  
  const validValues = values.filter(v => v !== null && v !== undefined && v !== "" && v !== "0");
  if (validValues.length === 0) return "";
  
  // 모든 레벨의 값이 같으면 하나만 표시
  const allSame = validValues.every(v => v === validValues[0]);
  if (allSame && validValues[0]) {
    return String(validValues[0]);
  }
  
  // 레벨별 값 표시 (최대 레벨까지만)
  const displayValues = maxLevel 
    ? validValues.slice(0, maxLevel)
    : validValues;
  
  return displayValues.map(v => String(v)).join("/");
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

  // {{ variable }} 패턴 찾기 (HTML 태그 내부도 포함)
  // 하지만 HTML 태그 자체는 건드리지 않음
  const variableRegex = /\{\{([^}]+)\}\}/g;
  
  result = result.replace(variableRegex, (match, variableName) => {
    const trimmedVar = variableName.trim();
    
    // 쿨타임 변수 처리
    if (trimmedVar.includes("cooldown") && !trimmedVar.includes("decrease")) {
      if (showAllLevels && spell.cooldownBurn) {
        return spell.cooldownBurn;
      }
      if (spell.cooldown && spell.cooldown.length >= level) {
        const cd = spell.cooldown[level - 1];
        if (cd !== undefined && cd !== null && cd !== "") {
          return typeof cd === "number" ? cd.toString() : cd;
        }
      }
      if (spell.cooldownBurn) {
        const values = spell.cooldownBurn.split("/");
        if (values.length >= level && values[level - 1]) {
          return values[level - 1];
        }
      }
    }

    // range 변수 처리
    if (trimmedVar.includes("range") || trimmedVar.includes("attackrangebonus")) {
      if (showAllLevels && spell.rangeBurn) {
        return spell.rangeBurn;
      }
      if (spell.range && spell.range.length >= level) {
        const range = spell.range[level - 1];
        if (range !== undefined && range !== null && range !== "") {
          return typeof range === "number" ? range.toString() : range;
        }
      }
      if (spell.rangeBurn) {
        if (showAllLevels) {
          return spell.rangeBurn;
        }
        const values = spell.rangeBurn.split("/");
        if (values.length >= level && values[level - 1]) {
          return values[level - 1];
        }
      }
    }

    // cost 변수 처리
    if (trimmedVar.includes("cost") || trimmedVar.includes("mana") || trimmedVar.includes("energy")) {
      if (showAllLevels && spell.costBurn && spell.costBurn.includes("/")) {
        return spell.costBurn;
      }
      if (spell.cost && spell.cost.length >= level) {
        const cost = spell.cost[level - 1];
        if (cost !== undefined && cost !== null && cost !== "") {
          return typeof cost === "number" ? cost.toString() : cost;
        }
      }
      if (spell.costBurn) {
        if (showAllLevels && spell.costBurn.includes("/")) {
          return spell.costBurn;
        }
        const values = spell.costBurn.split("/");
        if (values.length >= level && values[level - 1]) {
          return values[level - 1];
        }
      }
    }

    // effectBurn 배열에서 값 찾기 시도
    if (spell.effectBurn && spell.effectBurn.length > 0) {
      for (const effectBurnValue of spell.effectBurn) {
        if (effectBurnValue && effectBurnValue !== "0" && effectBurnValue !== null) {
          // "/"로 구분된 값이 있으면 레벨별 표시
          if (effectBurnValue.includes("/")) {
            if (showAllLevels) {
              return effectBurnValue;
            }
            const values = effectBurnValue.split("/");
            if (values.length >= level && values[level - 1] && values[level - 1] !== "0") {
              return values[level - 1];
            }
          } else {
            // 단일 값이면 그대로 반환
            if (effectBurnValue !== "0") {
              return effectBurnValue;
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
            // 레벨별 값 계산하여 "/" 형식으로 표시
            const calculatedValues = values.map(v => {
              const num = typeof v === "number" ? v : parseFloat(String(v));
              if (operator === "*") {
                const result = num * multiplierNum;
                // 정수인 경우 소수점 제거
                return result % 1 === 0 ? result.toString() : result.toFixed(1).replace(/\.0+$/, "");
              } else if (operator === "+") {
                return (num + multiplierNum).toFixed(1).replace(/\.0+$/, "");
              } else if (operator === "-") {
                return (num - multiplierNum).toFixed(1).replace(/\.0+$/, "");
              }
              return String(v);
            });
            return calculatedValues.join("/");
          } else if (values.length >= level) {
            // 특정 레벨의 값 계산
            const value = values[level - 1];
            const num = typeof value === "number" ? value : parseFloat(String(value));
            if (operator === "*") {
              const result = num * multiplierNum;
              return result % 1 === 0 ? result.toString() : result.toFixed(1).replace(/\.0+$/, "");
            } else if (operator === "+") {
              return (num + multiplierNum).toFixed(1).replace(/\.0+$/, "");
            } else if (operator === "-") {
              return (num - multiplierNum).toFixed(1).replace(/\.0+$/, "");
            }
            return String(value);
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
              const calculatedValues = values.map(v => {
                const num = typeof v === "number" ? v : parseFloat(String(v));
                if (operator === "*") {
                  return (num * multiplierNum).toFixed(1).replace(/\.0+$/, "");
                } else if (operator === "+") {
                  return (num + multiplierNum).toFixed(1).replace(/\.0+$/, "");
                } else if (operator === "-") {
                  return (num - multiplierNum).toFixed(1).replace(/\.0+$/, "");
                }
                return String(v);
              });
              return calculatedValues.join("/");
            } else if (values.length >= level) {
              const value = values[level - 1];
              const num = typeof value === "number" ? value : parseFloat(String(value));
              if (operator === "*") {
                return (num * multiplierNum).toFixed(1).replace(/\.0+$/, "");
              } else if (operator === "+") {
                return (num + multiplierNum).toFixed(1).replace(/\.0+$/, "");
              } else if (operator === "-") {
                return (num - multiplierNum).toFixed(1).replace(/\.0+$/, "");
              }
              return String(value);
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
            // 레벨별 값 포맷팅
            const formattedValues = values.map(v => {
              // 퍼센트 값인 경우 100을 곱하고 % 추가
              if (mappedVarName === 'ArmorShredPercent') {
                return `${(Number(v) * 100).toFixed(0)}%`;
              }
              return String(v);
            });
            return formattedValues.join("/");
          } else if (values.length >= level) {
            const value = values[level - 1];
            if (mappedVarName === 'ArmorShredPercent') {
              return `${(Number(value) * 100).toFixed(0)}%`;
            }
            return String(value);
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
              // 레벨별 값 포맷팅
              const formattedValues = values.map(v => {
                // 퍼센트 관련 변수인 경우 100을 곱하고 % 추가
                if (foundKey.toLowerCase().includes('percent') || foundKey.toLowerCase().includes('shred')) {
                  const numValue = Number(v);
                  if (numValue < 1 && numValue > 0) {
                    return `${(numValue * 100).toFixed(0)}%`;
                  }
                }
                return String(v);
              });
              return formattedValues.join("/");
            } else if (values.length >= level) {
              const value = values[level - 1];
              const numValue = Number(value);
              if ((foundKey.toLowerCase().includes('percent') || foundKey.toLowerCase().includes('shred')) && numValue < 1 && numValue > 0) {
                return `${(numValue * 100).toFixed(0)}%`;
              }
              return String(value);
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
          return values.map(v => String(v)).join("/");
        } else if (values.length >= level) {
          return String(values[level - 1]);
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
            return values.map(v => String(v)).join("/");
          } else if (values.length >= level) {
            return String(values[level - 1]);
          }
        }
      }
    }

    // 값을 찾을 수 없으면 빈 문자열로 제거
    return "";
  });

  // 치환 후 남은 "%" 기호가 혼자 있는 경우 제거
  // 예: "{{ armorshredpercent*100 }}%" -> "%" -> ""
  // 하지만 실제 퍼센트 값은 유지해야 하므로, 숫자와 함께 있는 경우는 유지
  result = result.replace(/\s+%\s+/g, " "); // 공백으로 둘러싸인 % 제거
  result = result.replace(/(?<!\d)\s*%\s*(?!\d)/g, ""); // 숫자와 함께 있지 않은 % 제거
  result = result.replace(/^\s*%\s*/g, ""); // 시작 부분의 % 제거
  result = result.replace(/\s*%\s*$/g, ""); // 끝 부분의 % 제거

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

