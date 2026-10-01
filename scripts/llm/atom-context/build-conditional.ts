/** 인용문과 상성 조건을 검사하고 현재 자료의 지문을 넣은 실험용 판단 단위를 만든다. */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadData } from "../kev-agent/lib";
import type { PrecomputedPair, PrecomputedFile } from "../../../src/lib/advisor/precomputed";
import { compileDecisionAtoms, type DecisionSeed } from "./conditional";

export const directory = "research/llm-evals/atoms/conditional-fiora";

export function currentPair(mine: string, enemy: string): PrecomputedPair {
  const bank = JSON.parse(readFileSync(`public/data/26.19/llm/matchups/${mine}.json`, "utf8")) as PrecomputedFile;
  if (!bank.pairs[enemy]) throw new Error(`상성 답 은행 없음: ${mine}/${enemy}`);
  return bank.pairs[enemy];
}

export function buildConditional() {
  const data = loadData("ko_KR");
  const seeds = JSON.parse(readFileSync(`${directory}/atoms.seed.json`, "utf8")) as DecisionSeed[];
  const atoms = compileDecisionAtoms(data, seeds, currentPair);
  return { patch: data.patch, atoms };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = buildConditional();
  writeFileSync(`${directory}/atoms.lock.json`, JSON.stringify(result, null, 2) + "\n");
  console.log(`${result.patch}: ${result.atoms.length}개 판단 단위의 출처와 지문 확인`);
}
