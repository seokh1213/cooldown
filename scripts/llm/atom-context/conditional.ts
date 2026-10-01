/** 상태가 붙은 판단 단위를 현재 노트와 대조해 선택하는 실험. 앱 기본 경로에는 연결하지 않는다. */
import { createHash } from "node:crypto";
import type { AdvisorData } from "../../../src/lib/advisor/context";
import type { DialogueMemory, ScenarioCondition } from "../../../src/lib/advisor/dialogueState";
import type { PrecomputedPair, PrecomputedKey } from "../../../src/lib/advisor/precomputed";
import { selectPlaybook } from "../../../src/lib/knowledge/playbookCore";

type Condition = Pick<ScenarioCondition, "owner" | "slot" | "status">;
type Source = { kind: "bank"; key: PrecomputedKey }
  | { kind: "playbook"; owner: string; side: "playing" | "against"; key: string };
interface EvidenceSeed { source: Source; quote: string }
export interface DecisionSeed {
  id: string;
  mine: string;
  enemy: string;
  requires: Condition[];
  excludes: Condition[];
  reason: EvidenceSeed[];
  action: EvidenceSeed[];
}
interface Evidence extends EvidenceSeed { patch: string; sourceHash: string; verifiedPatch?: string }
export interface DecisionAtom extends Omit<DecisionSeed, "reason" | "action"> {
  reason: Evidence[];
  action: Evidence[];
}
export interface DecisionRequest {
  question: string;
  mine: string;
  enemy: string;
  memory: DialogueMemory;
  baseline: string;
  pair: PrecomputedPair;
}
export interface DecisionResult { text: string; atom?: string; fallback?: "scope" | "condition" | "source-drift" }

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

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
    return { ...seed, reason: seed.reason.map(bind), action: seed.action.map(bind) };
  });
}

function state(memory: DialogueMemory, condition: Condition): boolean {
  return memory.conditions.some(item => item.owner === condition.owner && item.slot === condition.slot && item.status === condition.status);
}

function applies(atom: DecisionAtom, memory: DialogueMemory, explicitW: boolean): boolean {
  if (atom.excludes.some(condition => state(memory, condition))) return false;
  return atom.requires.every(condition => state(memory, condition)
    || explicitW && condition.owner === "enemy" && condition.slot === "W" && condition.status === "ready"
      && !memory.conditions.some(item => item.owner === "enemy" && item.slot === "W"));
}

function evidenceIsCurrent(data: AdvisorData, request: DecisionRequest, evidence: Evidence): boolean {
  const source = sourceText(data, request, evidence.source);
  return evidence.patch === data.patch && !!source && hash(source.text) === evidence.sourceHash && source.text.includes(evidence.quote);
}

/** W 질문에만 좁게 적용한다. 다른 상대·스킬·상태에서는 이번 턴의 기존 답변을 돌려준다. */
export function selectDecisionAnswer(data: AdvisorData, atoms: DecisionAtom[], request: DecisionRequest): DecisionResult {
  const explicitW = /응수|(?:^|[^A-Za-z])W(?![A-Za-z])/i.test(request.question);
  const rememberedW = request.memory.conditions.some(c => c.owner === "enemy" && c.slot === "W");
  const followUp = /교환|들어|붙|어떻게|왜|조심|싸|콤보|빠졌|빠진|빠지면|기절/i.test(request.question);
  if (!explicitW && !(rememberedW && followUp)) return { text: request.baseline, fallback: "scope" };
  const scoped = atoms.filter(atom => atom.mine === request.mine && atom.enemy === request.enemy);
  const atom = scoped.find(item => applies(item, request.memory, explicitW));
  if (!atom) return { text: request.baseline, fallback: "condition" };
  if (![...atom.reason, ...atom.action].every(evidence => evidenceIsCurrent(data, request, evidence))) {
    return { text: request.baseline, fallback: "source-drift" };
  }
  const conditions = request.memory.conditions.map(c => `${c.owner === "enemy" ? "상대" : "내"} ${c.slot} ${c.status === "down" ? "재사용 대기 중" : "사용 가능"}`).join(" · ");
  const caption = conditions ? `말씀하신 조건: ${conditions}.\n\n` : "";
  const reason = atom.reason.map(item => item.quote).join(" ");
  const action = atom.action.map(item => item.quote).join(" ");
  return { text: `${caption}${reason}\n\n${action}`, atom: atom.id };
}
