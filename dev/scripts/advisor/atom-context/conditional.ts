/** 상태가 붙은 판단 단위를 현재 노트와 대조해 선택하는 실험. 앱 기본 경로에는 연결하지 않는다. */
import { createHash } from "node:crypto";
import type { AdvisorData } from "../../../../src/features/advisor/conversation/context";
import type { DialogueMemory, ScenarioCondition } from "../../../../src/features/advisor/conversation/dialogueState";
import type { PrecomputedPair, PrecomputedKey } from "../../../../src/features/advisor/retrieval/precomputed";
import { selectPlaybook } from "../../../../src/domain/knowledge/playbookCore";
import { atomTarget } from "./target";
import { asksReason } from "../../../../src/features/advisor/understanding/askWords";
import { topicFromWords } from "../../../../src/features/advisor/model/topicJudge";
import { adviceUnit, actionEligible, type ActionRequirement } from "../../../../src/features/advisor/application/adviceActions";
import { conditionMatchupText } from "../../../../src/features/advisor/application/conditionedMatchup";
import { checkMatchupFacts } from "../../../../src/features/advisor/answers/matchupFactCheck";

type Condition = Pick<ScenarioCondition, "owner" | "slot" | "status">;
type Source = { kind: "bank"; key: PrecomputedKey }
  | { kind: "playbook"; owner: string; side: "playing" | "against"; key: string };
interface EvidenceSeed { source: Source; quote: string }
export interface DecisionSeed {
  id: string;
  mine: string;
  enemy: string;
  /** 기존 피오라 시드의 기본 대상은 상대 W다. 확장 실험은 대상을 명시한다. */
  target?: { owner: "mine" | "enemy"; slot: string };
  requires: Condition[];
  excludes: Condition[];
  reason: EvidenceSeed[];
  action: EvidenceSeed[];
}
interface Evidence extends EvidenceSeed { patch: string; sourceHash: string; verifiedPatch?: string }
export interface DecisionAtom extends Omit<DecisionSeed, "reason" | "action"> {
  reason: Evidence[];
  action: Evidence[];
  /** 이전 실험 파일은 없을 수 있다. 그때도 현재 카드로 같은 조건을 복원한다. */
  actionRequirements?: ActionRequirement[];
}
export interface DecisionRequest {
  question: string;
  mine: string;
  enemy: string;
  memory: DialogueMemory;
  baseline: string;
  pair: PrecomputedPair;
  focus?: string;
  continuation?: "explain" | "advance";
}
export interface DecisionResult { text: string; atom?: string; fallback?: "scope" | "condition" | "source-drift" | "source-claim"; rejected?: number; alternatives?: number; abstained?: boolean }

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

function decisionRequirements(atom: Pick<DecisionSeed, "mine" | "enemy" | "reason" | "action">, data: AdvisorData): ActionRequirement[] {
  const subjects = { mine: data.cardById.get(atom.mine)!, enemy: data.cardById.get(atom.enemy)! };
  return [...atom.reason, ...atom.action].flatMap(e => adviceUnit(e.quote, {
    ...subjects, defaultOwner: e.source.kind === "playbook" ? e.source.side === "against" ? "enemy" : "mine"
      : e.source.key === "watch" ? "enemy" : "mine",
  }).requirements);
}

function sourceText(data: AdvisorData, request: Pick<DecisionRequest, "mine" | "enemy" | "pair">, source: Source): { text: string; verifiedPatch?: string } | undefined {
  if (source.kind === "bank") {
    const text = request.pair[source.key];
    return text ? { text } : undefined;
  }
  const mine = data.cardById.get(request.mine);
  const enemy = data.cardById.get(request.enemy);
  if (!mine || !enemy) return undefined;
  const selected = selectPlaybook(data.playbooks, mine, enemy);
  const entries = source.side === "playing" && source.owner === request.mine ? selected.mine
    : source.side === "against" && source.owner === request.enemy ? selected.vsEnemy : [];
  const entry = entries.find(item => item.id === source.key);
  return entry ? { text: entry.text, verifiedPatch: entry.verifiedPatch } : undefined;
}

/** 인용이 현재 출처에 그대로 있는지 검사하고 전체 출처 지문을 고정한다. */
export function compileDecisionAtoms(data: AdvisorData, seeds: DecisionSeed[], pairFor: (mine: string, enemy: string) => PrecomputedPair): DecisionAtom[] {
  const seen = new Set<string>();
  return seeds.map(seed => {
    if (seen.has(seed.id) || !seed.reason.length || !seed.action.length) throw new Error(`잘못된 판단 단위: ${seed.id}`);
    seen.add(seed.id);
    const request = { mine: seed.mine, enemy: seed.enemy, pair: pairFor(seed.mine, seed.enemy) };
    const bind = (evidence: EvidenceSeed): Evidence => {
      const source = sourceText(data, request, evidence.source);
      if (!source?.text.includes(evidence.quote)) throw new Error(`현재 출처에서 인용을 찾지 못함: ${seed.id}`);
      return { ...evidence, patch: data.patch, sourceHash: hash(source.text), verifiedPatch: source.verifiedPatch };
    };
    const reason = seed.reason.map(bind);
    const action = seed.action.map(bind);
    const actionRequirements = decisionRequirements({ ...seed, reason, action }, data);
    return { ...seed, reason, action, actionRequirements };
  });
}

function state(memory: DialogueMemory, condition: Condition): boolean {
  return memory.conditions.some(item => item.owner === condition.owner && item.slot === condition.slot && item.status === condition.status);
}

function applies(atom: DecisionAtom, memory: DialogueMemory, explicit: boolean, data: AdvisorData): boolean {
  if (!actionEligible({ text: "", requirements: atom.actionRequirements ?? decisionRequirements(atom, data) }, memory.conditions)) return false;
  if (atom.excludes.some(condition => state(memory, condition))) return false;
  return atom.requires.every(condition => state(memory, condition)
    || explicit && condition.owner === (atom.target?.owner ?? "enemy") && condition.slot === (atom.target?.slot ?? "W") && condition.status === "ready"
      && !memory.conditions.some(item => item.owner === condition.owner && item.slot === condition.slot));
}

function evidenceIsCurrent(data: AdvisorData, request: DecisionRequest, evidence: Evidence): boolean {
  const source = sourceText(data, request, evidence.source);
  return evidence.patch === data.patch && !!source && hash(source.text) === evidence.sourceHash && source.text.includes(evidence.quote);
}

/** 주제·스킬 주인·상태가 맞는 단위만 쓴다. 복귀 답도 실행 조건 검사로 검증한다. */
export function selectDecisionAnswer(data: AdvisorData, atoms: DecisionAtom[], request: DecisionRequest): DecisionResult {
  const fallback = (why: DecisionResult["fallback"]): DecisionResult => {
    const checked = conditionMatchupText(data, "ko_KR", { ...request, conditions: request.memory.conditions,
      mine: data.cardById.get(request.mine)!, enemy: data.cardById.get(request.enemy)! }, request.baseline);
    return checked.rejected ? { text: checked.text, fallback: why, rejected: checked.rejected,
      alternatives: checked.alternatives, abstained: checked.abstained } : { text: request.baseline, fallback: why };
  };
  const focus = request.focus ?? topicFromWords(request.question);
  if (request.continuation === "advance" || focus && !["skill", "general", "escape-window", "combo"].includes(focus)) return fallback("scope");
  const mine = data.cardById.get(request.mine)!;
  const enemy = data.cardById.get(request.enemy)!;
  const target = atomTarget(data, { ...request, mine, enemy });
  const followUp = /교환|들어|붙|어떻게|왜|조심|싸|콤보|빠졌|빠진|빠지면|기절/i.test(request.question);
  if (!target.explicit && !followUp) return fallback("scope");
  const scoped = atoms.filter(atom => {
    if (atom.mine !== request.mine || atom.enemy !== request.enemy) return false;
    const subject = atom.target ?? { owner: "enemy", slot: "W" };
    const owner = subject.owner === "mine" ? request.mine : request.enemy;
    if (subject.slot === target.slot && (!target.owner || owner === target.owner)) return true;
    if (asksReason(request.question) && (!target.owner || target.owner === request.mine)
      && [...atom.reason, ...atom.action].some(e => new RegExp(`(?:^|[^A-Za-z])${target.slot}(?![A-Za-z])`).test(e.quote))) return true;
    const relative = target.owner === request.mine ? "mine" : target.owner === request.enemy ? "enemy" : undefined;
    return /빠|없|쿨|정정|어떻게|왜/.test(request.question)
      && atom.requires.some(c => c.owner === relative && c.slot === target.slot && state(request.memory, c));
  });
  const exact = (item: DecisionAtom) => {
    const subject = item.target ?? { owner: "enemy", slot: "W" };
    return subject.slot === target.slot && (!target.owner || target.owner === (subject.owner === "mine" ? request.mine : request.enemy));
  };
  const atom = [...scoped.filter(exact), ...scoped.filter(item => !exact(item))].find(item => applies(item, request.memory, target.explicit, data));
  if (!atom) return fallback("condition");
  if (![...atom.reason, ...atom.action].every(evidence => evidenceIsCurrent(data, request, evidence))) {
    return fallback("source-drift");
  }
  if ([...atom.reason, ...atom.action].some(e => checkMatchupFacts(e.quote, [mine, enemy]).length)) return fallback("source-claim");
  const conditions = request.memory.conditions.map(c => `${c.owner === "enemy" ? "상대" : "내"} ${c.slot} ${c.status === "down" ? "재사용 대기 중" : "사용 가능"}`).join(" · ");
  const caption = conditions ? `말씀하신 조건: ${conditions}.\n\n` : "";
  const reason = atom.reason.map(item => item.quote).join(" ");
  const action = atom.action.map(item => item.quote).join(" ");
  return { text: `${caption}${reason}\n\n${action}`, atom: atom.id };
}
