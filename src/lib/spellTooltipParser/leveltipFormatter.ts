import { ChampionSpell } from "@/types";
import { CommunityDragonSpellData } from "./types";
import { formatLevelValues } from "./formatters";
import { parseExpression } from "./expressionParser";
import { replaceData } from "./dataValueHandler";

/**
 * leveltip을 이용한 수치 표시 포맷팅
 * leveltip.label과 effect를 파싱하여 레벨별 수치를 표시
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon 데이터 (ammo 스킬용)
 * @returns 포맷팅된 수치 문자열 (HTML)
 */
export function formatLeveltipStats(
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData | Record<string, any>
): string {
  if (!spell.leveltip || !spell.leveltip.label || !spell.leveltip.effect) {
    return "";
  }

  // Community Dragon 데이터가 DataValues만 넘어오는 경우와
  // 전체 스킬 객체가 넘어오는 경우 모두 지원
  let cdragonForData: CommunityDragonSpellData | undefined;
  if (communityDragonData) {
    if ((communityDragonData as CommunityDragonSpellData).DataValues) {
      cdragonForData = communityDragonData as CommunityDragonSpellData;
    } else {
      cdragonForData = {
        DataValues: communityDragonData as any,
      };
    }
  }

  const { label, effect } = spell.leveltip;
  const stats: string[] = [];

  for (let i = 0; i < label.length && i < effect.length; i++) {
    const labelText = label[i];
    const effectPattern = effect[i];

    // effect 패턴에서 변수명 추출 (예: "{{ e1 }} -> {{ e1NL }}"에서 e1 추출)
    const effectMatch = effectPattern.match(/\{\{\s*([^}]+)\s*\}\}/);
    if (!effectMatch) continue;

    const variableExpr = effectMatch[1].trim();
    const parseResult = parseExpression(variableExpr);

    // 퍼센트 여부: 라벨 또는 effect 패턴에 "%"가 명시되어 있는지 확인
    const afterVar = effectPattern.slice(
      (effectMatch.index ?? 0) + effectMatch[0].length
    );
    const effectHasPercentAfterVar = afterVar.trimStart().startsWith("%");
    const labelIndicatesPercent =
      labelText.includes("%") ||
      labelText.toLowerCase().includes("percent") ||
      labelText.toLowerCase().includes("퍼센트") ||
      labelText.toLowerCase().includes("둔화");

    let value: string | null = null;

    // 1) Community Dragon DataValues 우선 사용
    // 예: "{{ basedamage }} -> {{ basedamageNL }}", "{{ armorshredpercent*100.000000 }}% -> ..."
    if (cdragonForData) {
      try {
        const replaced = replaceData(parseResult, spell, cdragonForData);

        if (replaced && replaced.trim() !== "") {
          let finalValue = replaced;

          // 퍼센트형(label 또는 effect 패턴에 %)인데 값에 %가 없으면 %를 붙여준다.
          const shouldDisplayPercent =
            (labelIndicatesPercent || effectHasPercentAfterVar) &&
            !finalValue.includes("%");

          if (shouldDisplayPercent) {
            finalValue = finalValue
              .split("/")
              .map((v) => (v ? `${v}%` : v))
              .join("/");
          }

          // @AbilityResourceName@ 치환
          let resourceName = "마나";
          if (spell.costType) {
            const costType = spell.costType.trim();
            if (costType && !costType.includes("{{")) {
              resourceName = costType;
            } else if (spell.resource && !spell.resource.includes("{{")) {
              resourceName = spell.resource;
            }
          } else if (spell.resource && !spell.resource.includes("{{")) {
            resourceName = spell.resource;
          }

          const displayLabel = labelText.replace("@AbilityResourceName@", resourceName);

          // 치환되지 않은 변수 패턴이 남아있으면 해당 항목 미노출
          if (displayLabel.includes("{{") || displayLabel.includes("}}")) {
            continue;
          }

          stats.push(`${displayLabel}: [${finalValue}]`);
          continue; // 이미 CDragon 데이터로 처리했으므로 다음 항목으로
        }
      } catch {
        // CDragon 파싱 실패 시 Data Dragon 기반 로직으로 폴백
      }
    }

    // 2) CDragon에서 값을 찾지 못한 경우 기존 Data Dragon 기반 로직 사용
    const baseVarName = parseResult.variable;
    // effect{N}amount → e{N} 로 매핑 (예: effect1amount → e1)
    const effectAmountMatch = baseVarName.match(/^effect(\d+)amount$/i);
    const normalizedVarName = effectAmountMatch
      ? `e${effectAmountMatch[1]}`
      : baseVarName;

    value = null;

    // e1, e2, e5 같은 패턴에서 숫자 추출
    const effectIndexMatch = normalizedVarName.match(/^e(\d+)$/i);
    if (effectIndexMatch) {
      const index = parseInt(effectIndexMatch[1]);
      if (spell.effectBurn && spell.effectBurn.length > index) {
        const effectValue = spell.effectBurn[index];
        if (effectValue && effectValue !== null && effectValue !== "0") {
          value = effectValue;
        }
      }
    } else if (
      normalizedVarName.toLowerCase() === "cost" ||
      normalizedVarName.toLowerCase().includes("cost")
    ) {
      if (spell.costBurn) {
        value = spell.costBurn;
      }
    } else if (normalizedVarName.toLowerCase().includes("cooldown")) {
      if (spell.cooldownBurn) {
        value = spell.cooldownBurn;
      }
    } else if (
      normalizedVarName.toLowerCase().includes("ammorechargetime") ||
      normalizedVarName.toLowerCase().includes("ammorecharge")
    ) {
      // 새로운 구조 지원: DataValues가 있으면 그것을 사용, 없으면 전체 객체 사용 (호환성)
      const dataValues = (communityDragonData as any)?.DataValues || communityDragonData;
      if (dataValues && dataValues["mAmmoRechargeTime"]) {
        const ammoRechargeTime = dataValues["mAmmoRechargeTime"];
        if (Array.isArray(ammoRechargeTime) && ammoRechargeTime.length > 1) {
          const startIndex = 1;
          const numericValues = ammoRechargeTime
            .slice(startIndex)
            .map((v) => (typeof v === "number" ? v : parseFloat(String(v))));
          const formatted = formatLevelValues(numericValues, spell.maxrank, false);
          if (formatted) {
            value = formatted;
          }
        }
      }
    }

    if (value) {
      const rawParts = value.includes("/") ? value.split("/") : [value];

      // Data Dragon 기반 값에도 간단한 수식(*, +, -, /)을 적용
      let processedParts: (string | number)[] = rawParts;
      if (parseResult.type === "formula") {
        processedParts = rawParts.map((part) => {
          const num = parseFloat(String(part));
          if (!Number.isFinite(num)) return part;

          switch (parseResult.operator) {
            case "*":
              return num * parseResult.operand;
            case "+":
              return num + parseResult.operand;
            case "-":
              return num - parseResult.operand;
            case "/":
              return num / parseResult.operand;
            default:
              return num;
          }
        });
      }

      const formattedValue = formatLevelValues(processedParts, spell.maxrank);

      if (formattedValue) {
        // @AbilityResourceName@ 치환
        let resourceName = "마나";
        if (spell.costType) {
          const costType = spell.costType.trim();
          if (costType && !costType.includes("{{")) {
            resourceName = costType;
          } else if (spell.resource && !spell.resource.includes("{{")) {
            resourceName = spell.resource;
          }
        } else if (spell.resource && !spell.resource.includes("{{")) {
          resourceName = spell.resource;
        }

        const displayLabel = labelText.replace("@AbilityResourceName@", resourceName);

        // 치환되지 않은 변수 패턴이 남아있으면 해당 항목 미노출
        if (displayLabel.includes("{{") || displayLabel.includes("}}")) {
          continue;
        }

        // 퍼센트 값 처리 (label 또는 effect 패턴에 %가 있는 경우)
        let finalValue = formattedValue;
        const shouldDisplayPercent =
          (labelIndicatesPercent ||
            labelText.toLowerCase().includes("slow") ||
            effectHasPercentAfterVar) &&
          !formattedValue.includes("%");

        if (shouldDisplayPercent) {
          finalValue = formattedValue.split("/").map((v) => `${v}%`).join("/");
        }

        stats.push(`${displayLabel}: [${finalValue}]`);
      }
    }
  }

  if (stats.length === 0) {
    return "";
  }

  return stats.join("<br />");
}

