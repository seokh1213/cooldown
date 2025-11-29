import { ChampionSpell } from "@/types";
import { convertXmlTagsToHtml } from "./xmlTagConverter";
import { replaceVariables } from "./variableReplacer";
import { sanitizeHtml } from "./formatters";
import { formatLevelValues } from "./formatters";

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

/**
 * leveltip을 이용한 수치 표시 포맷팅
 * leveltip.label과 effect를 파싱하여 레벨별 수치를 표시
 * @param spell 스킬 데이터
 * @param communityDragonData Community Dragon 데이터 (ammo 스킬용)
 * @returns 포맷팅된 수치 문자열 (HTML)
 */
export function formatLeveltipStats(
  spell: ChampionSpell,
  communityDragonData?: Record<string, (number | string)[]>
): string {
  if (!spell.leveltip || !spell.leveltip.label || !spell.leveltip.effect) {
    return "";
  }

  const { label, effect } = spell.leveltip;
  const stats: string[] = [];

  for (let i = 0; i < label.length && i < effect.length; i++) {
    const labelText = label[i];
    const effectPattern = effect[i];

    // effect 패턴에서 변수명 추출 (예: "{{ e1 }} -> {{ e1NL }}"에서 e1 추출)
    const effectMatch = effectPattern.match(/\{\{\s*([^}]+)\s*\}\}/);
    if (!effectMatch) continue;

    const varName = effectMatch[1].trim();
    let value: string | null = null;

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
      if (communityDragonData && communityDragonData["mAmmoRechargeTime"]) {
        const ammoRechargeTime = communityDragonData["mAmmoRechargeTime"];
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

