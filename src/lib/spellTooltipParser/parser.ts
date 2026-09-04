import { ChampionSpell } from "@/types";
import type {
  CommunityDragonSpellData,
  TooltipLocale,
  TooltipRenderResult,
} from "./types";
import { convertXmlTagsToHtml } from "./xmlTagConverter";
import {
  replaceVariables,
  replaceVariablesWithDiagnostics,
} from "./variableReplacer";
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
  communityDragonData?: CommunityDragonSpellData,
  lang: TooltipLocale = "ko_KR"
): string {
  return parseSpellTooltipWithDiagnostics(
    text,
    spell,
    communityDragonData,
    lang
  ).html;
}

export function parseSpellTooltipWithDiagnostics(
  text: string | undefined,
  spell?: ChampionSpell,
  communityDragonData?: CommunityDragonSpellData,
  lang: TooltipLocale = "ko_KR"
): TooltipRenderResult {
  if (!text) return { html: "", unresolvedTokens: [] };

  const converted = convertXmlTagsToHtml(text);
  const replaced = replaceVariablesWithDiagnostics(
    converted,
    spell,
    communityDragonData,
    lang
  );
  return {
    html: sanitizeHtml(replaced.text).replace(/\n/g, "<br />"),
    unresolvedTokens: replaced.unresolvedTokens,
  };
}

/**
 * 스킬 설명 파싱 (description 필드용)
 * description은 보통 tooltip보다 간단하므로 기본적인 처리만 수행
 */
export function parseSpellDescription(
  text: string | undefined,
  spell?: ChampionSpell,
  lang: TooltipLocale = "ko_KR"
): string {
  if (!text) return "";

  let result = text;

  // XML 태그 제거 또는 변환
  result = convertXmlTagsToHtml(result);

  // 변수 치환 (간단한 버전)
  result = replaceVariables(result, spell, undefined, lang);

  return result;
}

/**
 * 아이템 description 파싱
 * - XML 태그를 HTML로 변환
 * - 치환이 안 되는 변수들은 빨간색 ?로 표시
 */
export function parseItemDescription(
  text: string | undefined
): string {
  if (!text) return "";

  let result = text;

  // 1. XML 태그를 HTML로 변환
  result = convertXmlTagsToHtml(result);

  // 2. 치환이 안 되는 변수들을 빨간색 ?로 표시
  // 아이템 description에서는 스킬 데이터가 없으므로 모든 {{ variable }} 패턴을 빨간색 ?로 변경
  result = result.replace(/\{\{[^}]+\}\}/g, '<span class="text-red-500 font-bold">?</span>');

  // 3. HTML 정리
  result = sanitizeHtml(result);

  // 4. 줄바꿈을 <br />로 변환
  result = result.replace(/\n/g, "<br />");

  return result;
}
