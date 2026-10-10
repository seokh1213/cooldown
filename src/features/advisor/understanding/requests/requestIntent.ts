/** 질문의 의미와 답변 범위를 학습된 로지스틱 회귀로 판정한다. 단어 규칙으로 보정하지 않는다. */
import { offlineJudge } from "../../model/offlineJudge";
import { judgeRouteState } from "../../application/routeAsk";
import { TOPIC_LABELS, TOPIC_INSTRUCTIONS, type TopicLabel } from "../../model/topicJudge";
import type { ResolvedQuestion } from "../resolvedQuestion";

export const REQUEST_SCOPES = ["overview", "statsAll", "stats", "skills", "combo", "counterplay", "advice", "ability", "chat", "identity", "other"] as const;
export type RequestScope = typeof REQUEST_SCOPES[number];
export interface RequestIntent { scope: RequestScope; confidence: number; topic?: TopicLabel }
export const REQUEST_MODEL_FILES = { meta: "models/offline/request-v1.json", weights: "models/offline/request-v1.bin" };
export const REQUEST_SCOPE_INSTRUCTION = "Which response scope does this request need?";

/** 낮은 확신과 동률은 기각한다. 다른 모델의 미학습 헤드를 쓰거나 낱말로 확신을 올리지 않는다. */
export function confidentChoice<T extends string>(labels: readonly T[], probabilities: number[]): { label: T; confidence: number } | undefined {
  if (probabilities.length !== labels.length || probabilities.some(value => !Number.isFinite(value) || value < 0)) return undefined;
  const sorted = probabilities.map((confidence, index) => ({ label: labels[index], confidence })).sort((a, b) => b.confidence - a.confidence);
  const [first, second] = sorted;
  return first.confidence >= 0.6 && first.confidence - second.confidence >= 0.2 ? first : undefined;
}

export function requestClassifier(read: (path: string) => Promise<ArrayBuffer>) {
  const judge = offlineJudge(read, REQUEST_MODEL_FILES);
  return async (resolved: ResolvedQuestion): Promise<RequestIntent | undefined> => {
    // 표시 언어의 이름 대신 실제 질문에 등장한 이름·별명을 마스킹한다.
    const names = resolved.mentions.map(mention => resolved.text.slice(mention.index, mention.index + mention.length));
    const [scopeProbabilities, topicProbabilities] = await judge("request-v1", judgeRouteState(resolved.text, names), [
      { instructions: REQUEST_SCOPE_INSTRUCTION, options: REQUEST_SCOPES.map(name => ({ name })) },
      { instructions: TOPIC_INSTRUCTIONS, options: TOPIC_LABELS.map(name => ({ name })) },
    ]);
    const scope = confidentChoice(REQUEST_SCOPES, scopeProbabilities);
    if (!scope) return undefined;
    return { scope: scope.label, confidence: scope.confidence, topic: confidentChoice(TOPIC_LABELS, topicProbabilities)?.label };
  };
}
