import type { AdvisorModel } from "./config";

/** 판정·검색 gate를 보존한 그래프는 학습 당시 판정 헤드를 계속 사용한다. */
export function isJudgeCompatible(head: { id: string; dtype: string; graph?: string }, model: AdvisorModel): boolean {
  return head.id === model.id && head.dtype === model.dtype
    && (head.graph ?? "") === (model.judgeGraph ?? model.graph ?? "");
}
