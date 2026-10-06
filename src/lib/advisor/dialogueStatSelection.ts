/** 능력치 대화의 대상 교체·추가·제외를 적용한다. 레벨과 항목은 이 선택과 독립적이다. */
import type { ChampionCard } from "@/lib/knowledge/facts";
import type { ResolvedQuestion } from "./resolvedQuestion";
import type { DialogueMemory } from "./dialogueState";
import type { PlanContext } from "./planTypes";
import { addsSelection, excludesMention } from "./selectionWords";

const GROUP = /둘|모두|전부|양쪽|비교|\b(?:both|all|compare)\b|两个|全部|比较/i;

export function statTargets(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): ChampionCard[] {
  const from = (ids: readonly string[]) => ids.map(id => ctx.data!.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
  const prior = memory.active === "stat" ? memory.stat?.champions
    : memory.active === "champion" && memory.champion ? [memory.champion]
      : memory.active === "compare" ? memory.compared
        : memory.active === "spell" ? memory.compared ?? (memory.spell ? [memory.spell.champion] : [])
          : memory.active === "matchup" && memory.matchup ? [memory.matchup.mine, memory.matchup.enemy] : undefined;
  const excluded = resolved.mentions.filter(m => excludesMention(resolved.text, m.index + m.length)).map(m => m.card.id);
  const named = resolved.champions.filter(card => !excluded.includes(card.id));
  if (named.length) {
    const ids = named.map(card => card.id);
    const additive = addsSelection(resolved.text) || ids.length === 1 && GROUP.test(resolved.text);
    return from((additive && prior ? [...new Set([...prior, ...ids])] : ids).filter(id => !excluded.includes(id)));
  }
  if (excluded.length) return from((prior ?? []).filter(id => !excluded.includes(id)));
  if (memory.matchup && /상대|\benemy\b|对面/i.test(resolved.text)) return from([memory.matchup.enemy]);
  if (memory.matchup && /내\s*(?:스탯|능력치|체력|방어력|공격력|마저|마방|공속|이속|체젠|깡공)|\bmy\b|我的/i.test(resolved.text)) return from([memory.matchup.mine]);
  const baseStat = /기본|\bbase\b|基础/i.test(resolved.text);
  return from(prior?.length ? prior : baseStat && memory.stat ? memory.stat.champions : ctx.championIds);
}
