/** 기존 산문을 스킬 사용 조건이 붙은 단위로 옮긴다. 문단을 쪼개서 콤보의 일부만 권하지 않는다. */
import type { ChampionCard } from "@/domain/knowledge/facts";
import { HARD_CC } from "@/domain/knowledge/playbookCore";
import { evidenceSentences } from "../answers/matchupFactCheck";
import type { ScenarioCondition } from "../conversation/dialogueState";
import { DIGEST_HEADINGS } from "../answers/prose";

type Owner = ScenarioCondition["owner"];
export interface ActionRequirement { owner: Owner; anyOf: string[] }
export interface AdviceUnit {
  text: string;
  /** 한 요구 항목 안에서는 하나만 사용 가능하면 된다. 항목 사이는 모두 충족해야 한다. */
  requirements: ActionRequirement[];
}
export interface AdviceSubjects { mine: ChampionCard; enemy: ChampionCard; defaultOwner?: Owner }
interface Reference { start: number; end: number; slot: string; owner?: Owner }
const SLOT = /(?<![A-Za-z])([QWER])(?![A-Za-z])/gi;
const FUTURE = /^(?:\s|[이가은는도])*.*?(?:돌아오면(?!서)|돌아올\s*때|돌아온\s*(?:뒤|후)|다시\s*사용\s*가능해지면|사용\s*가능할\s*때|준비되면|ready again|comes back|冷却结束)/i;
const NON_USE = /^(?:\s|[이가은는도])*?(?:없|빠지|빠졌|빠진|쿨타임|재사용\s*대기)|쓰지\s*않|쓰지\s*마|사용하지\s*않|낭비하지\s*않|아끼|남겨|남깁|不要使用|do not use|don't use/i;
const USE = /맞히|맞혀|맞힙|쓰|써|사용|던지|던집|넣|접근|진입|들어|파고|피합|피하|켜|터뜨리|끊|옮기|돌진|구르/;
const CONTROL_ACTION = /군중\s*제어를\s*(?:걸|넣|사용)|CC로\s*(?:끊|막)|(?:apply|use) crowd control|用.*控制|施加.*控制/i;

function spellReferences(sentence: string, subjects: AdviceSubjects): Reference[] {
  const refs: Reference[] = [...sentence.matchAll(SLOT)].map(m => ({ start: m.index, end: m.index + 1, slot: m[1].toUpperCase() }));
  for (const match of sentence.matchAll(/(?<![A-Za-z])([QWER]{2,6})(?![A-Za-z])/g)) {
    for (const [offset, slot] of [...match[1]].entries()) refs.push({ start: match.index + offset, end: match.index + offset + 1, slot });
  }
  for (const owner of ["mine", "enemy"] as const) {
    for (const spell of subjects[owner].spells.filter(s => s.slot !== "P")) {
      for (const name of new Set(spell.name.split(/\s*[/|]\s*/))) {
        if (name.length < 2) continue;
        let at = sentence.indexOf(name);
        while (at >= 0) {
          const generic = name.length <= 2 && /^(?:\s*(?:타이밍|기회|각|대응)|된|당|할)/.test(sentence.slice(at + name.length));
          if (!generic) refs.push({ start: at, end: at + name.length, slot: spell.slot, owner });
          at = sentence.indexOf(name, at + name.length);
        }
      }
    }
  }
  const sorted = refs.sort((a, b) => a.start - b.start || b.end - a.end);
  return sorted.filter((ref, i) => !sorted.slice(0, i).some(before => before.end > ref.start));
}

function namedOwner(prefix: string, subjects: AdviceSubjects): Owner | undefined {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markers = (["mine", "enemy"] as const).flatMap(owner => [subjects[owner].name, subjects[owner].id]
    .flatMap(name => [...prefix.matchAll(new RegExp(`${escape(name)}(?:의)?\\s*$`, "g"))].map(m => ({ owner, index: m.index }))));
  const relative = [...prefix.matchAll(/상대(?:의)?\s*$|내\s*$|\bmy\s*$|\benemy\s*$|对面\s*$|我的\s*$/gi)].pop();
  if (relative) markers.push({ owner: /내|my|我的/i.test(relative[0]) ? "mine" : "enemy", index: relative.index });
  return markers.sort((a, b) => b.index - a.index)[0]?.owner;
}

function sentenceRequirements(sentence: string, subjects: AdviceSubjects, later: Set<string>): ActionRequirement[] {
  const refs = spellReferences(sentence, subjects);
  const needs: ActionRequirement[] = [];
  let owner = subjects.defaultOwner ?? "mine";
  for (const [i, ref] of refs.entries()) {
    const prefix = sentence.slice(refs[i - 1]?.end ?? 0, ref.start);
    owner = ref.owner ?? namedOwner(prefix, subjects) ?? owner;
    const next = refs[i + 1];
    const suffix = sentence.slice(ref.end, next?.start ?? sentence.length);
    // Q 현혹의 구슬처럼 슬롯과 이름이 연달아 있으면 이름 참조에서 한 번만 처리한다.
    if (!ref.owner && next?.owner && next.slot === ref.slot && /^\s*$/.test(suffix)) continue;
    const key = `${owner}:${ref.slot}`;
    if (FUTURE.test(suffix.split(/[,.;]/)[0])) later.add(key);
    const nonUse = NON_USE.exec(suffix);
    const needsNow = !nonUse || USE.test(suffix.slice(0, nonUse.index));
    if (owner === "mine" && !later.has(key) && needsNow) needs.push({ owner, anyOf: [ref.slot] });
  }
  // 상대 노트가 내 군중 제어·이동 수단으로 대응하라고 하면 카드의 실제 스킬로 연결한다.
  for (const [pattern, effects] of [
    [CONTROL_ACTION, HARD_CC],
    [/이동기(?:로|나).*?(?:빠져|나갑|피합|피하)|(?:use|with) (?:a |an |your )?(?:dash|mobility|movement ability).*?(?:escape|leave|range)|(?:使用|用)位移.*(?:离开|脱离|逃|范围)/i, ["이동기"]],
  ] as const) {
    if (!pattern.test(sentence)) continue;
    const anyOf = subjects.mine.spells.filter(s => s.slot !== "P" && s.effects.some(effect => effects.some(expected => expected === effect))).map(s => s.slot);
    needs.push({ owner: "mine", anyOf });
  }
  return needs;
}

/** 출처의 관점을 함께 받아 이름 없이 적힌 Q도 내 Q/상대 Q로 구분한다. */
export function adviceUnit(text: string, subjects: AdviceSubjects): AdviceUnit {
  const later = new Set<string>();
  const requirements = evidenceSentences(text).flatMap(sentence => sentenceRequirements(sentence, subjects, later));
  const unique = new Map(requirements.map(r => [`${r.owner}:${r.anyOf.join(",")}`, r]));
  return { text, requirements: [...unique.values()] };
}

/** 현재 확인된 부재가 있는 스킬을 요구하는 행동은 제외한다. 미확인 스킬은 실시간 사용 가능으로 확정하지 않는다. */
export function actionEligible(unit: AdviceUnit, conditions: readonly ScenarioCondition[]): boolean {
  return unit.requirements.every(requirement => requirement.anyOf.some(slot =>
    !conditions.some(c => c.owner === requirement.owner && c.slot === slot && c.status === "down")));
}

/** 추상적 군중 제어 조언을 현재 카드의 수단으로 설명한다. 원문의 행동·선행 조건은 보존한다. */
export function controlLabels(unit: AdviceUnit, subjects: AdviceSubjects, conditions: readonly ScenarioCondition[]): string[] {
  if (!CONTROL_ACTION.test(unit.text)) return [];
  return subjects.mine.spells.filter(s => s.slot !== "P" && s.effects.some(e => HARD_CC.includes(e))
    && !conditions.some(c => c.owner === "mine" && c.slot === s.slot && c.status === "down"))
    .map(s => `${subjects.mine.name} ${s.slot} ${s.name}`);
}

/** 슬롯만 적힌 원문도 스킬 주인을 확인한다. 내 Q를 상대 Q 질문의 근거로 삼지 않는다. */
export function mentionsAbility(text: string, subjects: AdviceSubjects, target: { owner: Owner; slot: string }): boolean {
  for (const sentence of evidenceSentences(text)) {
    const refs = spellReferences(sentence, subjects);
    let owner = subjects.defaultOwner ?? "mine";
    for (const [i, ref] of refs.entries()) {
      const prefix = sentence.slice(refs[i - 1]?.end ?? 0, ref.start);
      owner = ref.owner ?? namedOwner(prefix, subjects) ?? owner;
      if (owner === target.owner && ref.slot === target.slot) return true;
    }
  }
  return false;
}

export interface AdviceTextSelection { text: string; rejected: number; keptBlocks: number[] }

/** 독립적인 아군 역할 조건으로 시작한 가지들만 나눈다. 같은 콤보의 이유·후속 행동은 함께 둔다. */
function roleBranches(body: string): string[] {
  const sentences = evidenceSentences(body);
  const starts = (sentence: string) => /^아군(?:이|가)[^.]{0,60}(?:면|때(?:에는|는))/.test(sentence);
  if (!starts(sentences[0] ?? "") || sentences.filter(starts).length < 2) return [body];
  const branches: string[] = [];
  for (const sentence of sentences) {
    if (starts(sentence)) branches.push(sentence);
    else branches[branches.length - 1] += ` ${sentence}`;
  }
  return branches;
}

/** 표시된 문단은 조건·이유·행동을 함께 버리거나 보존한다. 머리말만 남기지 않는다. */
export function selectExecutableText(text: string, subjects: AdviceSubjects, conditions: readonly ScenarioCondition[]): AdviceTextSelection {
  const blocks = text.split(/\n\s*\n/);
  const keptBlocks: number[] = [];
  let rejected = 0;
  const kept = blocks.flatMap((block, index) => {
    const enemyHeading = [`**${subjects.enemy.name}**`, ...Object.values(DIGEST_HEADINGS).map(h => `**${h.watch}**`)];
    const defaultOwner = enemyHeading.some(h => block.startsWith(h)) ? "enemy" : subjects.defaultOwner;
    const heading = /^\*\*[^\n]+\*\*\n/.exec(block)?.[0] ?? "";
    const branches = roleBranches(block.slice(heading.length));
    const selected = branches.filter(branch => actionEligible(adviceUnit(branch, { ...subjects, defaultOwner }), conditions));
    rejected += branches.length - selected.length;
    if (!selected.length) return [];
    keptBlocks.push(index);
    return [heading + selected.join(" ")];
  });
  return { text: kept.join("\n\n"), rejected, keptBlocks };
}
