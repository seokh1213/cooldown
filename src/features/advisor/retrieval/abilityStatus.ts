/** 스킬 상태 표현의 부정과 정정을 읽는다. 마지막으로 명시한 상태만 적용한다. */
import type { ScenarioCondition } from "../conversation/memory/dialogueState";

const DOWN = /빠졌|빠진|빠지면|없(?:으면|을|이|고|어|는데|는)?|재사용\s*대기\s*중|쿨(?:타임)?(?:이|은)?\s*(?:중|돌고(?:\s*있(?:어|고|는데))?|도는)|is down|on cooldown|没了|冷却中/gi;
const READY = /살아|남아|(?:는|가)\s*있|있(?:고|으면|어)|돌아왔|준비|사용\s*가능|(?:이|가)\s*(?:오면|들어오)|is up|available|还在|有技能|可用/gi;

function negated(text: string, match: RegExpMatchArray): boolean {
  const before = text.slice(0, match.index);
  const after = text.slice((match.index ?? 0) + match[0].length);
  return /(?:안|못|not|never|n['’]t|不)\s*$/i.test(before)
    || /^\s*(?:(?:게|건|것(?:은|이)?|거(?:는)?)\s*(?:아니|아닙)|진\s*않)/.test(after);
}

export function abilityStatus(text: string): ScenarioCondition["status"] | undefined {
  const mentions = ([["down", DOWN], ["ready", READY]] as const).flatMap(([status, pattern]) =>
    [...text.matchAll(pattern)].map(match => ({ index: match.index, end: match.index + match[0].length,
      status: negated(text, match) ? (status === "down" ? "ready" : "down") as ScenarioCondition["status"] : status })));
  // '쿨이 돌고 있어' 안의 '있어'는 준비 상태가 아니라 진행 중 표현의 일부다.
  return mentions.filter(m => !mentions.some(other => other.index < m.index && other.end >= m.end))
    .sort((a, b) => b.index - a.index)[0]?.status;
}

export function mentionsAbilityState(text: string): boolean {
  return abilityStatus(text) !== undefined || /없|쿨타임|재사용\s*대기|冷却/i.test(text);
}
