import { ChampionSpell } from "@/types";
import { CommunityDragonSpellData } from "./types";
import { formatLevelValues } from "./formatters";
import { parseExpression } from "./expressionParser";
import { replaceData } from "./dataValueHandler";
import type { Language } from "@/i18n";
import { getTranslations } from "@/i18n";

/**
 * leveltip을 이용한 수치 표시 포맷팅
 * leveltip.label과 effect를 파싱하여 레벨별 수치를 표시
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon 데이터 (ammo 스킬용)
 * @param lang 언어 설정
 * @returns 포맷팅된 수치 문자열 (HTML)
 */
export function formatLeveltipStats(
  spell: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData | Record<string, any>,
  lang: Language = "ko_KR"
): string {
  const t = getTranslations(lang);
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
    let value: string | null = null;

    // 1) Community Dragon DataValues 우선 사용
    // 예: "{{ basedamage }} -> {{ basedamageNL }}", "{{ armorshredpercent*100.000000 }}% -> ..."
    if (cdragonForData) {
      try {
        const parseResult = parseExpression(variableExpr);
        const replaced = replaceData(parseResult, spell, cdragonForData);

        if (replaced && replaced.trim() !== "") {
          let finalValue = replaced;

          // 퍼센트형 label인데 값에 %가 없으면 %를 붙여준다.
          const labelIndicatesPercent =
            labelText.includes("%") ||
            labelText.toLowerCase().includes("percent") ||
            labelText.toLowerCase().includes("퍼센트") ||
            labelText.toLowerCase().includes("둔화");

          if (labelIndicatesPercent && !finalValue.includes("%")) {
            finalValue = finalValue
              .split("/")
              .map((v) => (v ? `${v}%` : v))
              .join("/");
          }

          // @AbilityResourceName@ 치환
          let resourceName = t.common.mana;
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
    const varName = variableExpr;
    value = null;

    // e1, e2, e5 같은 패턴에서 숫자 추출
    const effectIndexMatch = varName.match(/^e(\d+)$/i);
    if (effectIndexMatch) {
      const index = parseInt(effectIndexMatch[1]);
      if (spell.effectBurn && spell.effectBurn.length > index) {
        const effectValue = spell.effectBurn[index];
        if (effectValue && effectValue !== null && effectValue !== "0") {
          value = effectValue;
        }
      }
    } else if (varName.toLowerCase() === "cost" || varName.toLowerCase().includes("cost")) {
      if (spell.costBurn) {
        value = spell.costBurn;
      }
    } else if (varName.toLowerCase().includes("cooldown")) {
      if (spell.cooldownBurn) {
        value = spell.cooldownBurn;
      }
    } else if (
      varName.toLowerCase().includes("ammorechargetime") ||
      varName.toLowerCase().includes("ammorecharge")
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
      const formattedValue = formatLevelValues(
        value.includes("/") ? value.split("/") : [value],
        spell.maxrank
      );

      if (formattedValue) {
        // @AbilityResourceName@ 치환
        let resourceName = t.common.mana;
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

        // 퍼센트 값 처리
        let finalValue = formattedValue;
        if (
          labelText.includes("%") ||
          labelText.toLowerCase().includes("slow") ||
          labelText.toLowerCase().includes("둔화")
        ) {
          if (!formattedValue.includes("%")) {
            finalValue = formattedValue.split("/").map((v) => `${v}%`).join("/");
          }
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

