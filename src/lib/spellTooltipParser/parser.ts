import { ChampionSpell } from "@/types";
import { CommunityDragonSpellData } from "./types";
import { convertXmlTagsToHtml } from "./xmlTagConverter";
import { replaceVariables } from "./variableReplacer";
import { sanitizeHtml } from "./formatters";

/**
 * 스킬 툴팁 파싱 메인 함수
 * @param text 원본 툴팁 텍스트
 * @param spell 스킬 데이터 (변수 치환용)
 * @param communityDragonData Community Dragon에서 가져온 스킬 데이터 (선택적)
 * @returns 파싱된 HTML 문자열
 */
export function parseSpellTooltip(
  text: string | undefined,
  spell?: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData
): string {
  if (!text) return "";

  let result = text;

  // 1. XML 태그를 먼저 HTML로 변환 (변수 치환 전에 수행하여 태그 범위 보존)
  result = convertXmlTagsToHtml(result);

  // 2. 변수 치환 (XML 태그 변환 후 수행)
  result = replaceVariables(result, spell, communityDragonData);

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
  result = replaceVariables(result, spell);

  return result;
}
