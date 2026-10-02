/** 스킬을 언급한 위치별로 주인과 뒤따르는 상태를 연결한다. 같은 문장에서도 서로 섞지 않는다. */
import type { ScenarioCondition } from "./dialogueState";

type Owner = ScenarioCondition["owner"];
interface Reference { index: number; end: number; slot: string; owner?: Owner }
interface ConditionHint { owner?: Owner; spells?: Array<{ owner: Owner; slot: string; name: string }> }
const DOWN = /빠졌|빠진|빠지면|없(?:으면|을|이|고|어|는데|는)|재사용\s*대기\s*중|쿨타임(?:이|은)?\s*(?:중|돌)|is down|on cooldown|没了|冷却中/gi;
const READY = /살아|남아|(?:는|가)\s*있|있(?:고|으면|어)|돌아왔|준비|사용\s*가능|(?:이|가)\s*(?:오면|들어오)|is up|available|还在|有技能|可用/gi;

function references(question: string, hint?: ConditionHint): Reference[] {
  const rows: Reference[] = [];
  for (const match of question.matchAll(/(?<![A-Za-z])([QWER])(?![A-Za-z])|궁(?:극기)?(?=\s|[?.,!이가은는을도에]|$)/gi)) {
    rows.push({ index: match.index, end: match.index + match[0].length, slot: match[1]?.toUpperCase() ?? "R" });
  }
  for (const spell of hint?.spells ?? []) {
    let index = question.indexOf(spell.name);
    while (index >= 0) {
      rows.push({ index, end: index + spell.name.length, slot: spell.slot, owner: spell.owner });
      index = question.indexOf(spell.name, index + spell.name.length);
    }
  }
  return rows.sort((a, b) => a.index - b.index || b.end - a.end).filter((row, i, all) => {
    if (all.some(other => other.index === row.index && other.owner && row.owner && other.owner !== row.owner)) return false;
    return !all.slice(0, i).some(other => other.end > row.index);
  });
}

function ownerBefore(prefix: string): Owner | undefined {
  const markers = [...prefix.matchAll(/상대|내(?=\s*$)|\bmy\b|\benemy\b|对面|我的/gi)];
  const marker = markers[markers.length - 1]?.[0];
  if (!marker) return undefined;
  return /내|my|我的/i.test(marker) ? "mine" : "enemy";
}

function statedStatus(text: string): ScenarioCondition["status"] | undefined {
  // 정규식의 lastIndex를 공유하지 않으며, 같은 스킬을 바로 정정하면 마지막 상태가 이긴다.
  const downMatches = [...text.matchAll(DOWN)];
  const readyMatches = [...text.matchAll(READY)];
  const down = downMatches[downMatches.length - 1]?.index ?? -1;
  const ready = readyMatches[readyMatches.length - 1]?.index ?? -1;
  return down < 0 && ready < 0 ? undefined : down > ready ? "down" : "ready";
}

export function scenarioConditions(question: string, previous: ScenarioCondition[], turn: number, hint?: ConditionHint): ScenarioCondition[] {
  if (/(?:조건|가정).*(?:초기화|잊어|지워|취소|없던)/.test(question)) return [];
  const conditions = [...previous];
  const refs = references(question, hint);
  let owner = hint?.owner;
  for (const [index, ref] of refs.entries()) {
    const prefix = question.slice(refs[index - 1]?.end ?? 0, ref.index);
    owner = ownerBefore(prefix) ?? ref.owner ?? owner;
    let suffix = question.slice(ref.end, refs[index + 1]?.index ?? question.length).split(/[.;]/)[0];
    // "내 E와 R이 없어"처럼 상태가 나열의 맨 뒤에만 붙으면 같은 나열 안에서 공유한다.
    let nextIndex = index + 1;
    while (!statedStatus(suffix) && /^\s*(?:(?:와|과|랑|및|and|,|·|\/)\s*(?:상대|내|enemy|my|对面|我的)?)?\s*$/i.test(suffix) && refs[nextIndex]) {
      const next = refs[nextIndex];
      suffix = question.slice(next.end, refs[nextIndex + 1]?.index ?? question.length).split(/[.;]/)[0];
      nextIndex++;
    }
    const status = statedStatus(suffix);
    if (!owner || !status) continue;
    const entry = { owner, slot: ref.slot, status, hypothetical: /면|if\b|假如|如果/i.test(suffix), turn };
    const at = conditions.findIndex(c => c.owner === owner && c.slot === ref.slot);
    if (at < 0) conditions.push(entry);
    else conditions[at] = entry;
  }
  return conditions;
}
