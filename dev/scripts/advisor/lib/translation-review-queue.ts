import { createHash } from "node:crypto";

export interface ReviewDecision {
  lang: string;
  me: string;
  enemy: string;
  slot: string;
  sourceSha256: string;
  candidateSha256: string;
  status: "approved" | "approved_with_edit" | "held";
  text?: string;
  needsPrimaryReview?: boolean;
}

export interface ReviewSection {
  lang: string;
  me: string;
  enemy: string;
  slot: string;
  ko: string;
  text: string;
  newCandidate: boolean;
}

export const fingerprint = (text: string): string => createHash("sha256").update(text).digest("hex");

export const reviewKey = (section: Pick<ReviewSection, "lang" | "me" | "enemy" | "slot">): string =>
  [section.lang, section.me, section.enemy, section.slot].join("/");

/** Corrections remain reviewed whether staging holds the original or the approved final text. */
export function reviewStatus(section: ReviewSection, decision?: ReviewDecision): "pending" | "approved" | "held" {
  if (!decision || decision.needsPrimaryReview || decision.sourceSha256 !== fingerprint(section.ko)) return "pending";
  const candidateHash = fingerprint(section.text);
  const originalMatches = decision.candidateSha256 === candidateHash;
  if (decision.status === "held") return originalMatches ? "held" : "pending";
  if (!decision.text) return "pending";
  return originalMatches || fingerprint(decision.text) === candidateHash ? "approved" : "pending";
}

export function prioritizeSections(sections: ReviewSection[]): ReviewSection[] {
  return sections.sort((left, right) => Number(right.newCandidate) - Number(left.newCandidate) || reviewKey(left).localeCompare(reviewKey(right)));
}

export function batchReady(pending: number, threshold: number, generatorRunning: boolean): boolean {
  return pending >= threshold || (pending > 0 && !generatorRunning);
}

export function finalAuditReady(state: { pending: number; generatorRunning: boolean; auditExists: boolean }): boolean {
  return state.pending === 0 && !state.generatorRunning && !state.auditExists;
}
