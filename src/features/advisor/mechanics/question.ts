/** 표기·수치 정정은 공통으로 처리한다. 지원하지 않는 식은 계산값을 만들지 않는다. */
import type { MechanicMemory } from "./types";
const DIGITS: Record<string, number> = { 영: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
const UNITS: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
function koreanNumber(word: string): number {
  let total = 0, digit = 0;
  for (const char of word) {
    if (char in DIGITS) digit = DIGITS[char];
    else { total += (digit || 1) * UNITS[char]; digit = 0; }
  }
  return total + digit;
}
export function normalizeMechanicQuestion(question: string): string {
  return question.replace(/\bHP\b/gi, "체력").replace(/\bAP\b/gi, "주문력").replace(/\bAD\b/gi, "공격력")
    .replace(/피통/g, "체력").replace(/공속/g, "공격 속도").replace(/이속/g, "이동 속도").replace(/체젠/g, "체력 재생").replace(/힐/g, "회복").replace(/체력\s*태ㅁ/g, "체력 템").replace(/(?:추가타|후속탄|2타)/g, "추가 공격")
    .replace(/캔슬/g, "취소").replace(/(?<![\d,.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,.])/g, value => value.replace(/,/g, ""))
    .replace(/(체력|주문력)\s*([일이삼사오육칠팔구십백천]+)(?=\s|이면|짜리|은|는|$)/g,
      (_, stat: string, word: string) => `${stat} ${koreanNumber(word)}`);
}
export function correctedQuestion(question: string): string {
  const normalized = normalizeMechanicQuestion(question)
    .replace(/^(?:아까|이전|앞서)\s*.+?(?:돌아가서|돌아와서)\s*[,，:：]?\s*/, "");
  const corrections = [...normalized.matchAll(/말고|아니라(?!면)|대신|(?<=\d\s*)아니(?=\s*\d)/g)];
  const last = corrections[corrections.length - 1];
  return last ? normalized.slice(last.index! + last[0].length).trim() : normalized.trim();
}
export function isMechanicFollowup(question: string): boolean {
  const text = correctedQuestion(question);
  return /^(?:그럼|(?:아\s*)?아니|그거|그건|그때|아\s*\d)/.test(text)
    || /^(?:한|두|세|네|\d+)\s*(?:대|번|발)/.test(text)
    || /^\d+(?:\.\d+)?\s*(?:짜리|체력)?\s*(?:은|는|이면|면|일 때|로|으로)[?？\s가-힣]*$/.test(text)
    || /^(?:쿨|재사용\s*대기시간|두\s*번째|추가\s*공격|미니언|몬스터|챔피언)/.test(text);
}
export function conversionAmount(question: string): number | undefined {
  const text = correctedQuestion(question);
  if (/\d,\d|-(?:\s*)\d|\d\s*[+*/%]|\d\s*(?:퍼센트|프로)/.test(text)) return undefined;
  const amounts = [...text.matchAll(/(?:체력|주문력)\s*(?:템\s*(?:으로\s*)?)?(\d+(?:\.\d+)?)|(?<![\d.-])(\d+(?:\.\d+)?)\s*(?:짜리|체력)/g)]
    .map(match => Number(match[1] ?? match[2]));
  if (amounts.length === 1) return amounts[0];
  if (amounts.length > 1) return undefined;
  const short = /^(?:(?:그럼|아니|아)\s*)?(\d+(?:\.\d+)?)(?:\s*(?:은|는|이면|면|짜리|로|으로)|[?？]|$)/.exec(text);
  return short ? Number(short[1]) : undefined;
}
export function cooldownRemaining(question: string): boolean | undefined {
  const text = correctedQuestion(question);
  if (!/쿨|재사용\s*대기/.test(text)) return undefined;
  if (/끝.*(?:아니|않)|안\s*돌|돌지\s*않|남|아직.*쿨|(?:쿨타임|쿨|재사용\s*대기)\s*(?:중|동안)/.test(text)
    && !/안\s*남|남지\s*않|남.*없/.test(text)) return true;
  if (/안\s*남|남지\s*않|남.*없|(?:다|이미)\s*돌|끝|없/.test(text)) return false;
  return undefined;
}
function countOf(text: string, unit: string): number | undefined {
  const match = new RegExp(`(?<![\\d.-])(\\d+|하나|한|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉|열)\\s*${unit}`).exec(text);
  if (!match) return undefined;
  const words: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10 };
  return words[match[1]] ?? Number(match[1]);
}
export interface QuestionState extends Omit<MechanicMemory, "abilityId" | "sourceHash" | "topic" | "ruleIndices"> {
  firstCancelled?: boolean;
  visibility?: "visible" | "unseen";
  invalidAmount?: boolean;
}
export function questionState(question: string, previous?: MechanicMemory): QuestionState {
  const text = correctedQuestion(question);
  const state: QuestionState = { ...previous };
  delete state.firstCancelled;
  delete state.invalidAmount;
  const amount = conversionAmount(text), count = countOf(text, "개");
  if (/(?:\d|[가-힣])\s*개/.test(text) && count === undefined || count !== undefined && (!Number.isSafeInteger(count) || count <= 0)) state.invalidAmount = true;
  const numericStat = /(?:체력|주문력)\s*(?:템\s*(?:으로\s*)?)?\d/.exec(text)?.[0];
  const stat = numericStat?.startsWith("주문력") ? "abilityPower" : numericStat?.startsWith("체력") ? "bonusHealth" : previous?.amount?.stat ?? "bonusHealth";
  if (amount !== undefined) state.amount = { value: amount, stat, count: count ?? 1 };
  else if (count && state.amount) state.amount = { ...state.amount, count };
  if (amount === undefined && /(?:체력|주문력)\s*(?:템\s*(?:으로\s*)?)?[-\d]|\d\s*(?:짜리|체력)|^-?\d/.test(text) && !/(?:레벨|초|대|발|번|스택|중첩)/.test(text)) {
    state.amount = undefined;
    state.invalidAmount = true;
  }
  if (/안\s*보이|보이지\s*않|시야.*(?:없|밖)/.test(text)) state.visibility = "unseen";
  else if (/보이는\s*(?:상태|동안)|보일\s*때|보이는데/.test(text)) state.visibility = "visible";
  const target = /미니언|몬스터|챔피언|구조물/.exec(text)?.[0];
  if (target) state.targetType = ({ 미니언: "minion", 몬스터: "monster", 챔피언: "champion", 구조물: "structure" } as const)[target as "미니언"];
  const extra = /두\s*번째|추가\s*공격|후속|두\s*(?:발|대)|둘\s*다/.test(text);
  if (/첫\s*(?:평타|공격|발)/.test(text) && /취소/.test(text)) state.firstCancelled = true;
  if (extra && /취소|안\s*쏘|쏘지\s*않|안\s*발사|발사하지\s*않/.test(text)) state.followupStatus = "cancelled";
  else if (extra && /쏘|쏠|쏜|쏴|발사|다\s*(?:맞|치)|모두/.test(text)) state.followupStatus = "fired";
  const cooldown = cooldownRemaining(text);
  if (/보호막.*(?:못\s*쓰|사용\s*불가|없)|(?:못\s*쓰|사용\s*불가).*보호막/.test(text)) state.shieldReady = "down";
  if (cooldown !== undefined) {
    state.shieldReady = cooldown ? "down" : "ready";
    state.spellReady = cooldown ? "down" : "ready";
  }
  const hits = countOf(text, "(?:대|번|발)");
  // 새 적중 횟수는 이전 추가 공격의 발사 여부와 별개의 조건이다.
  if (hits !== undefined && !extra) delete state.followupStatus;
  if (hits !== undefined) state.hitCount = previous?.hitCount !== undefined && /(?:이미|앞서|더|다음|한\s*번\s*더)/.test(text)
    ? previous.hitCount + hits : hits;
  return state;
}
