/** 고정한 여러 턴 질문에서 현재 답변과 조건부 판단 단위를 나란히 기록한다. */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadData } from "../kev-agent/lib";
import type { DecisionAtom, DecisionResult } from "./conditional";
import { selectDecisionAnswer } from "./conditional";
import { currentPair, directory } from "./build-conditional";
import { replayAtoms } from "./replay";

const questions = `${directory}/questions.json`;
const data = loadData("ko_KR");
const locked = JSON.parse(readFileSync(`${directory}/atoms.lock.json`, "utf8")) as { patch: string; atoms: DecisionAtom[] };

function issues(text: string, mine: string, conditions: Array<{ owner: string; slot: string; status: string }>): string[] {
  const has = (slot: string, status: string) => conditions.some(c => c.owner === "enemy" && c.slot === slot && c.status === status);
  const out: string[] = [];
  if (has("W", "down") && /응수를 빼낸 뒤|응수가 살아 있는 동안|응수가 살아 있을 때|W 응수가 남아 있다면/.test(text)) out.push("이미 빠진 W를 다시 경계하거나 빼라고 함");
  if (has("W", "ready") && /W 응수가 빠진 뒤.*(?:들어|연계|기절)/.test(text)) out.push("W가 있는데 빠진 뒤 행동을 바로 권함");
  if (has("Q", "down") && /Q 찌르기가 들어올 수/.test(text)) out.push("빠진 Q의 즉시 사용을 경계함");
  if (conditions.some(c => c.owner === "mine" && c.slot === "E" && c.status === "down") && /잭스 E 반격을 (?:켜|쓰)/.test(text)) out.push("내 E가 빠졌는데 사용을 권함");
  if (mine === "Aatrox" && has("W", "down") && /아트록스 E 파멸의 돌진으로 접근/.test(text) && !/피오라 Q 찌르기를 쓰게 만든 직후/.test(text)) out.push("아트록스 진입 전 피오라 Q 사용 조건을 빠뜨림");
  return out;
}

function summary(rows: Array<{ selected: DecisionResult; currentIssues: string[]; selectedIssues: string[]; current: string }>) {
  const used = rows.filter(row => row.selected.atom);
  return {
    matchupTurns: rows.length,
    atomTurns: used.length,
    fallbackReasons: Object.fromEntries([...new Set(rows.map(row => row.selected.fallback).filter(Boolean))].map(reason => [reason, rows.filter(row => row.selected.fallback === reason).length])),
    currentStateIssues: rows.reduce((total, row) => total + row.currentIssues.length, 0),
    selectedStateIssues: rows.reduce((total, row) => total + row.selectedIssues.length, 0),
    medianCurrentCharacters: median(rows.map(row => row.current.length)),
    medianAtomCharacters: median(used.map(row => row.selected.text.length)),
  };
}
function median(values: number[]) { const sorted = values.sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; }

export async function replayConditional(questionsPath = questions) {
  const replay = await replayAtoms(questionsPath);
  const rows = replay.rows.map(row => {
    const selected = selectDecisionAnswer(data, locked.atoms, {
      question: row.question, mine: row.plan.mine, enemy: row.plan.enemy,
      memory: row.memory, baseline: row.current, pair: currentPair(row.plan.mine, row.plan.enemy),
    });
    return { id: row.id, turn: row.turn, question: row.question, plan: row.plan, conditions: row.memory.conditions,
      current: row.current, selected, currentIssues: issues(row.current, row.plan.mine, row.memory.conditions), selectedIssues: issues(selected.text, row.plan.mine, row.memory.conditions) };
  });
  return { patch: data.patch, atomPatch: locked.patch, inference: "none", summary: summary(rows), skipped: replay.skipped, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  replayConditional(process.argv[2] ?? questions).then(result => {
    writeFileSync(process.argv[3] ?? `${directory}/results.json`, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result.summary));
  });
}
