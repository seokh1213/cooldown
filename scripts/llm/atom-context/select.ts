/** 아톰은 선택 색인으로 쓰고, 출처 노트의 적용 조건과 문맥을 함께 돌려주는 비교 실험. */
import type { AtomFile, Atom } from "../build-note-atoms";
import type { AdvisorData } from "../../../src/lib/advisor/context";
import type { ChampionCard } from "../../../src/lib/knowledge/facts";
import { selectPlaybook } from "../../../src/lib/knowledge/playbookCore";
import { atomTarget } from "./target";
import { checkedMatchupText } from "../../../src/lib/advisor/matchupFactCheck";
import { labelSlots } from "../../../src/lib/advisor/slotLabels";
import type { DialogueMemory } from "../../../src/lib/advisor/dialogueState";

export interface AtomRequest {
  question: string;
  mine: ChampionCard;
  enemy: ChampionCard;
  focus?: string;
  memory: DialogueMemory;
  baseline: string;
}
interface Candidate {
  atom: Atom;
  owner: ChampionCard;
  perspective: "playing" | "against";
  key: string;
  score: number;
}
export interface AtomSelection {
  text: string;
  sources: Array<{ key: string; atoms: string[]; eligible: boolean }>;
  fallback?: "no-eligible-source";
}

function parents(data: AdvisorData, request: AtomRequest): Map<string, string> {
  const selected = selectPlaybook(data.playbooks, request.mine, request.enemy);
  const out = new Map<string, string>();
  for (const [owner, entries] of [[request.mine, selected.mine], [request.enemy, selected.vsEnemy]] as const) {
    for (const entry of entries) {
      if (entry.id) out.set(`${owner.id}:playbook:${entry.id}`, entry.text);
    }
  }
  return out;
}

function relevance(atom: Atom, request: AtomRequest, target: { slot?: string; owner?: string }, owner: ChampionCard): number {
  const topic = atom.topic === request.focus ? 5 : request.focus === "escape-window" && atom.kind === "timing" ? 3 : 0;
  const skill = target.slot && atom.skills.includes(target.slot) ? 6 : 0;
  return topic + skill + (skill && target.owner === owner.id ? 20 : 0) + (atom.kind === "action" || atom.kind === "sequence" ? 1 : 0);
}

function candidates(data: AdvisorData, files: Map<string, AtomFile>, request: AtomRequest): Candidate[] {
  const target = atomTarget(data, request);
  const rows: Candidate[] = [];
  for (const [owner, peer, perspective] of [[request.mine, request.enemy, "playing"], [request.enemy, request.mine, "against"]] as const) {
    for (const atom of files.get(owner.id)?.atoms ?? []) {
      if (!atom.source.startsWith("playbook:") || atom.perspective !== perspective && atom.perspective !== "both") continue;
      if (atom.when?.enemyIds?.length && !atom.when.enemyIds.includes(peer.id)) continue;
      rows.push({ atom, owner, perspective, key: `${owner.id}:${atom.source}`, score: relevance(atom, request, target, owner) });
    }
  }
  return rows.filter(row => !target.slot || !target.owner || row.owner.id === target.owner && row.atom.skills.includes(target.slot)).sort((a, b) => b.score - a.score);
}

/** 기존 원자의 문자 그대로 선택 / 원본의 조건으로 걸러 현재 원본 노트를 복원. 앱의 기본 경로는 바꾸지 않는다. */
export function selectAtomAnswer(data: AdvisorData, files: Map<string, AtomFile>, request: AtomRequest, mode: "detached" | "linked"): AtomSelection {
  const allowed = parents(data, request);
  const ranked = candidates(data, files, request);
  const selected = mode === "detached" ? ranked.slice(0, 3)
    : ranked.filter(row => allowed.has(row.key)).filter((row, index, rows) => rows.findIndex(other => other.key === row.key) === index).slice(0, 2);
  const sources = selected.map(row => ({ key: row.key, atoms: mode === "detached" ? [row.atom.id] : ranked.filter(other => other.key === row.key).map(other => other.atom.id), eligible: allowed.has(row.key) }));
  if (!sources.length && request.baseline) return { text: request.baseline, sources, fallback: "no-eligible-source" };
  const lines = selected.map(row => {
    const text = mode === "detached" ? row.atom.text.ko : allowed.get(row.key)!;
    const peer = row.owner.id === request.mine.id ? request.enemy : request.mine;
    return `${row.owner.name} ${row.perspective === "playing" ? "플레이" : "상대"}: ${labelSlots(checkedMatchupText(text, [row.owner, peer]), [row.owner, peer])}`;
  });
  const conditions = request.memory.conditions.map(c => `${c.owner === "enemy" ? "상대" : "내"} ${c.slot} ${c.status === "down" ? "재사용 대기 중" : "사용 가능"}`).join(" · ");
  return { text: [conditions ? `말씀하신 조건: ${conditions}.` : "", ...lines].filter(Boolean).join("\n\n"), sources };
}
