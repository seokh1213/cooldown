/** 다른 스킬의 조건·이유·행동을 현재 원문에서 묶는 확장 실험. 새 게임 문장은 만들지 않는다. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadData } from "../kev-agent/lib";
import { currentPair } from "./build-conditional";
import { compileDecisionAtoms, type DecisionSeed } from "./conditional";

export const broadDirectory = "dev/research/llm-evals/atoms/broad-replay";
type Part = { key: string; sentences: number[]; owner?: string; side?: "playing" | "against" };
type State = "ready" | "down";
interface Template {
  id: string; mine: string; enemy: string; slot: string; status: State;
  also?: Array<["mine" | "enemy", string, State]>; blocked?: string[];
  reason: Part[]; action: Part[];
}
const bank = (key: string, ...sentences: number[]): Part => ({ key, sentences });
const note = (owner: string, side: "playing" | "against", key: string, ...sentences: number[]): Part => ({ key, sentences, owner, side });

// 작성 단위는 문장 개수가 아니라 행동의 선행 조건까지 포함하는 원문 범위다.
const templates: Template[] = [
  { id: "teemo-ready", mine: "Jax", enemy: "Teemo", slot: "Q", status: "ready", reason: [bank("watch", 0)], action: [note("Teemo", "against", "vs-teemo-q", 1, 2)] },
  { id: "teemo-down-e-down", mine: "Jax", enemy: "Teemo", slot: "Q", status: "down", also: [["mine", "E", "down"]], reason: [bank("escape", 0)], action: [bank("laning", 2)] },
  { id: "teemo-down", mine: "Jax", enemy: "Teemo", slot: "Q", status: "down", blocked: ["E", "Q", "W"], reason: [bank("escape", 0)], action: [bank("combo", 0, 1)] },
  { id: "blitz-ready", mine: "Lux", enemy: "Blitzcrank", slot: "Q", status: "ready", reason: [note("Blitzcrank", "against", "vs-blitz-minion", 0)], action: [note("Blitzcrank", "against", "vs-blitz-minion", 1)] },
  { id: "blitz-down-e-down", mine: "Lux", enemy: "Blitzcrank", slot: "Q", status: "down", also: [["mine", "E", "down"]], reason: [bank("escape", 0)], action: [bank("laning", 1)] },
  { id: "blitz-down", mine: "Lux", enemy: "Blitzcrank", slot: "Q", status: "down", blocked: ["E"], reason: [bank("escape", 0)], action: [bank("fight", 0)] },
  { id: "lux-ready", mine: "Ahri", enemy: "Lux", slot: "Q", status: "ready", reason: [note("Lux", "against", "vs-lux-q-line", 0)], action: [bank("watch", 0, 1)] },
  { id: "lux-down-r-down", mine: "Ahri", enemy: "Lux", slot: "Q", status: "down", also: [["mine", "R", "down"]], blocked: ["Q"], reason: [bank("escape", 0)], action: [note("Ahri", "playing", "ahri-laning", 1, 2)] },
  { id: "lux-down", mine: "Ahri", enemy: "Lux", slot: "Q", status: "down", blocked: ["R", "E"], reason: [bank("escape", 0)], action: [bank("escape", 1, 2)] },
  { id: "yasuo-ready", mine: "Lux", enemy: "Yasuo", slot: "W", status: "ready", reason: [note("Yasuo", "against", "vs-yasuo-wall", 0)], action: [note("Yasuo", "against", "vs-yasuo-wall", 1)] },
  { id: "yasuo-down-q-down", mine: "Lux", enemy: "Yasuo", slot: "W", status: "down", also: [["mine", "Q", "down"]], reason: [note("Yasuo", "against", "vs-yasuo-wall", 0)], action: [bank("laning", 0)] },
  { id: "yasuo-down", mine: "Lux", enemy: "Yasuo", slot: "W", status: "down", blocked: ["Q", "E", "R"], reason: [bank("combo", 0)], action: [bank("combo", 1)] },
  { id: "darius-ready-w-down", mine: "Fiora", enemy: "Darius", slot: "E", status: "ready", also: [["mine", "W", "down"]], reason: [note("Darius", "against", "vs-darius-e", 0)], action: [note("Fiora", "playing", "fiora-laning-vs-physical", 1)] },
  { id: "darius-ready", mine: "Fiora", enemy: "Darius", slot: "E", status: "ready", blocked: ["W"], reason: [bank("watch", 0)], action: [note("Fiora", "playing", "fiora-laning", 0, 1)] },
  { id: "darius-down", mine: "Fiora", enemy: "Darius", slot: "E", status: "down", reason: [bank("fight", 0)], action: [bank("fight", 2)] },
  { id: "zed-w-down-r-ready", mine: "Ahri", enemy: "Zed", slot: "W", status: "down", also: [["enemy", "R", "ready"]], reason: [bank("escape", 0)], action: [note("Zed", "against", "vs-zed-w", 1)] },
  { id: "zed-w-r-down", mine: "Ahri", enemy: "Zed", slot: "W", status: "down", also: [["enemy", "R", "down"]], blocked: ["R", "E"], reason: [bank("escape", 0)], action: [bank("escape", 1, 2)] },
  { id: "zed-r-ready", mine: "Ahri", enemy: "Zed", slot: "R", status: "ready", blocked: ["E"], reason: [note("Zed", "against", "vs-zed-r-track", 0)], action: [bank("watch", 1)] },
  { id: "zed-r-down", mine: "Ahri", enemy: "Zed", slot: "R", status: "down", also: [["enemy", "W", "down"]], blocked: ["R", "E"], reason: [bank("escape", 0)], action: [bank("escape", 1, 2)] },
  { id: "morgana-ready", mine: "Thresh", enemy: "Morgana", slot: "E", status: "ready", reason: [note("Morgana", "against", "vs-morgana-e", 0)], action: [bank("fight", 1)] },
  { id: "morgana-down", mine: "Thresh", enemy: "Morgana", slot: "E", status: "down", blocked: ["Q", "E"], reason: [bank("escape", 0)], action: [bank("combo", 0, 2), bank("escape", 2)] },
  { id: "jax-ready", mine: "Garen", enemy: "Jax", slot: "E", status: "ready", blocked: ["E"], reason: [bank("watch", 0)], action: [bank("combo", 1)] },
  { id: "jax-down", mine: "Garen", enemy: "Jax", slot: "E", status: "down", blocked: ["Q", "E"], reason: [bank("laning", 1)], action: [bank("combo", 0)] },
  { id: "rumble-ready", mine: "Darius", enemy: "Rumble", slot: "E", status: "ready", reason: [bank("watch", 0)], action: [bank("watch", 1)] },
  { id: "rumble-down", mine: "Darius", enemy: "Rumble", slot: "E", status: "down", also: [["enemy", "W", "down"]], blocked: ["E", "W"], reason: [bank("watch", 0)], action: [bank("escape", 0, 1)] },
];

function evidence(template: Template, part: Part): DecisionSeed["reason"] {
  const source = part.owner ? { kind: "playbook" as const, owner: part.owner, side: part.side!, key: part.key }
    : { kind: "bank" as const, key: part.key as "watch" };
  const book = part.owner ? JSON.parse(readFileSync(`dev/data/knowledge/playbooks/${part.owner}.json`, "utf8")) : undefined;
  const text: string | undefined = book ? book[part.side!].find((entry: { id: string }) => entry.id === part.key)?.text
    : currentPair(template.mine, template.enemy, loadData("ko_KR").patch)[part.key as "watch"];
  const sentences = text?.split(/(?<=[.!?])\s+/);
  return part.sentences.map(index => {
    const quote = sentences?.[index];
    if (!quote) throw new Error(`출처 문장 없음: ${template.id}/${part.key}/${index}`);
    return { source, quote };
  });
}

export function buildBroadAtoms() {
  const data = loadData("ko_KR");
  const previous = JSON.parse(readFileSync("dev/research/llm-evals/atoms/conditional-fiora/atoms.seed.json", "utf8")) as DecisionSeed[];
  const seeds: DecisionSeed[] = [...previous, ...templates.map(t => ({
    id: t.id, mine: t.mine, enemy: t.enemy, target: { owner: "enemy" as const, slot: t.slot },
    requires: [{ owner: "enemy" as const, slot: t.slot, status: t.status }, ...(t.also ?? []).map(([owner, slot, status]) => ({ owner, slot, status }))],
    excludes: (t.blocked ?? []).map(slot => ({ owner: "mine" as const, slot, status: "down" as const })),
    reason: t.reason.flatMap(p => evidence(t, p)), action: t.action.flatMap(p => evidence(t, p)),
  }))];
  const atoms = compileDecisionAtoms(data, seeds, (mine, enemy) => currentPair(mine, enemy, data.patch));
  return { patch: data.patch, seeds, atoms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { patch, seeds, atoms } = buildBroadAtoms();
  mkdirSync(broadDirectory, { recursive: true });
  writeFileSync(`${broadDirectory}/atoms.seed.json`, JSON.stringify(seeds, null, 2) + "\n");
  writeFileSync(`${broadDirectory}/atoms.lock.json`, JSON.stringify({ patch, atoms }, null, 2) + "\n");
  console.log(`${patch}: ${atoms.length}개 단위 · ${new Set(atoms.map(a => `${a.mine}:${a.enemy}`)).size}개 상성`);
}
