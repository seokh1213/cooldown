/**
 * 검색 은어·동의어 사전(`knowledge/search-aliases.json`) — 규칙·게임 원리·게임 메타를 은어로도 찾는다.
 *
 * "스마 충전 몇 초마다 차?", "PTA on towers?", "TP 回城" 처럼 공식 이름이 아닌 말로 묻는다. 챔피언 별명 사전처럼
 * 사람이 쓰는 말을 적어 둔다. 문서 id(`rule:점화` · `mech:…` · `meta:…`)마다 세 언어 목록.
 *
 * 찾는 법이 글자 체계마다 다르다.
 *   영문          낱말 경계로만, 대소문자 무시("dh" 가 "dhal" 에 걸리지 않게)
 *   두 글자 이하 한글  앞이 한글이 아니고, 뒤가 한글이 아니거나 조사일 때만("플" 이 "플레이" 에, "수확" 이 "수확량" 에 걸리지 않게)
 *   그 밖         들어 있으면(한글 세 글자 이상·한자)
 */
import dictionary from "../../../knowledge/search-aliases.json";

const ALIASES = (dictionary as { aliases: Record<string, Partial<Record<"ko" | "en" | "zh", string[]>>> }).aliases;

/** 문서 id 의 은어 전부(세 언어). 질문 언어와 상관없이 본다 — 한국어 화면에서도 "PTA" 라고 쓴다. */
export function aliasesOf(id: string): string[] {
  const entry = ALIASES[id];
  return entry ? [...(entry.ko ?? []), ...(entry.en ?? []), ...(entry.zh ?? [])] : [];
}

const PARTICLE = "(?:은|는|이|가|을|를|의|에|에서|로|으로|도|만|랑|이랑|하고|과|와|쿨|각|템)";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 문장에서 은어가 처음 나온 자리. 없으면 -1. */
export function aliasAt(text: string, alias: string): number {
  if (/^[ -~]+$/.test(alias)) {
    const m = new RegExp(`(?<![a-z0-9])${escape(alias.toLowerCase())}(?![a-z0-9])`).exec(text.toLowerCase());
    return m ? m.index : -1;
  }
  if (/^[가-힣]{1,2}$/.test(alias)) {
    const m = new RegExp(`(?<![가-힣])${escape(alias)}(?=$|[^가-힣]|${PARTICLE}(?:$|[^가-힣]))`).exec(text);
    return m ? m.index : -1;
  }
  return text.indexOf(alias);
}
