/**
 * 답변 평가 기록.
 *
 * 지금은 평가 케이스 10건으로 내가 재는 게 전부다. 실제로 어떤 질문이 어떤 답을 받았고
 * 사용자가 어떻게 봤는지는 알 방법이 없다. 기기 안에만 쌓고 서버로 보내지 않는다.
 */
import type { DialogueMemory } from "./dialogueState";
import type { DialogueTrace } from "./requestContract";

export interface AdvisorFeedback {
  at: string;
  question: string;
  answer: string;
  rating: "up" | "down";
  patch: string;
  /**
   * 대화 흐름을 다시 재기 위한 맥락. "틀렸거나 부족해요" 를 누른 이어 묻기가 무엇이었는지 알아야 판정기
   * 시험 세트(`scripts/llm/kev-agent/feedback-to-tests.ts`)로 옮길 수 있다. 기기 밖으로는 사용자가 내보낼 때만 나간다.
   */
  lang?: string;
  previousQuestion?: string;
  /** 이 답을 내기 전에 이어 가던 상성(내 챔피언·상대 id) */
  previousMatchup?: { mine: string; enemy: string };
  /** 이 답이 무엇이었나(상성·챔피언·규칙 …)와 다룬 챔피언 id */
  answerKind?: string;
  champions?: string[];
  previousMemory?: DialogueMemory;
  memory?: DialogueMemory;
  trace?: DialogueTrace;
}

const FEEDBACK_KEY = "cooldown.advisor.feedback.v1";
const FEEDBACK_LIMIT = 200;

/** 평가 기록을 파일로 내려받는다. 사용자가 누를 때만 기기 밖으로 나간다. */
export function exportFeedback(): number {
  const log = readFeedback();
  if (!log.length) return 0;
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), feedback: log }, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cooldown-advisor-feedback-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return log.length;
}

export function readFeedback(): AdvisorFeedback[] {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? "[]") as AdvisorFeedback[];
  } catch {
    return [];
  }
}

export function appendFeedback(entry: AdvisorFeedback): void {
  const log = readFeedback();
  log.push(entry);
  localStorage.setItem(
    FEEDBACK_KEY,
    JSON.stringify(log.slice(-FEEDBACK_LIMIT)),
  );
}
