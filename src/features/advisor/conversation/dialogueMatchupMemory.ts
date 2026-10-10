/** 저장한 상성별 조건과 현재 선택 범위를 구분한다. 한 상대 선택이 다른 상대의 기억을 지우지 않는다. */
import { asksGenericAdvice, asksGuide, asksScenarioAdvice } from "../understanding/askWords";
import { sideOfNewName } from "./conversation";
import type { DialogueMemory, MatchupContext } from "./dialogueState";
import type { ResolvedQuestion } from "../understanding/resolvedQuestion";

export function priorMatchup(resolved: ResolvedQuestion, memory: DialogueMemory): MatchupContext | undefined {
  if (resolved.matchup) return memory.matchups?.find(pair => pair.mine === resolved.matchup!.mine.id && pair.enemy === resolved.matchup!.enemy.id);
  if (resolved.champions.length !== 1 || !(asksScenarioAdvice(resolved.text) || asksGenericAdvice(resolved.text) || asksGuide(resolved.text))) return undefined;
  const named = resolved.champions[0];
  const mention = resolved.mentions[0];
  if (mention && sideOfNewName(resolved.text, [resolved.text.slice(mention.index, mention.index + mention.length)]) === "mine") return undefined;
  return memory.matchups?.find(pair => pair.mine === memory.matchup?.mine && pair.enemy === named.id);
}

export function rememberMatchupSelection(memory: DialogueMemory, selected: MatchupContext[]): void {
  if (!selected.length) return;
  const catalog = new Map((memory.matchups ?? []).map(pair => [`${pair.mine}:${pair.enemy}`, pair]));
  selected.forEach(pair => catalog.set(`${pair.mine}:${pair.enemy}`, structuredClone(pair)));
  const next = selected[0];
  const group = memory.matchupGroup;
  // 기존 상대 중 한 명을 둔 채 내 챔피언을 바꾸면, '둘 다'의 관점도 함께 바뀐다.
  if (selected.length === 1 && group?.length && group.every(pair => pair.mine !== next.mine)
    && group.some(pair => pair.enemy === next.enemy)) {
    memory.matchupGroup = group.map(({ enemy }) => ({ mine: next.mine, enemy }));
    memory.matchupGroup.forEach(pair => {
      const key = `${pair.mine}:${pair.enemy}`;
      if (!catalog.has(key)) catalog.set(key, { ...pair, conditions: [] });
    });
  }
  memory.matchups = [...catalog.values()];
  memory.matchupScope = selected.length > 1 ? "group" : "single";
  if (selected.length > 1) memory.matchupGroup = selected.map(({ mine, enemy }) => ({ mine, enemy }));
}

export function matchupGroup(memory: DialogueMemory): MatchupContext[] {
  if (!memory.matchupGroup) return memory.matchups ?? [];
  return memory.matchupGroup.flatMap(({ mine, enemy }) => {
    const pair = memory.matchups?.find(pair => pair.mine === mine && pair.enemy === enemy);
    return pair ? [pair] : [];
  });
}
