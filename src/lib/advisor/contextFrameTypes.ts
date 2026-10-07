import type { DialogueMemory } from "./dialogueState";

export const CONTEXT_POLICIES = ["legacy", "lifo", "typed", "guarded", "learned"] as const;
export type ContextPolicy = typeof CONTEXT_POLICIES[number];
export const MAX_CONTEXT_FRAMES = 32;
export const CONTEXT_LIMITS = [2, 4, 6, 8, 12, 16, 24, 32] as const;
export const DEFAULT_CONTEXT_POLICY: ContextPolicy = "guarded";
export const DEFAULT_CONTEXT_LIMIT = 12;
export const CONTEXT_BUCKETS = ["champion", "stat", "item", "compare", "matchup", "rule", "spell",
  "spell:P", "spell:Q", "spell:W", "spell:E", "spell:R"] as const;
export type ContextBucket = typeof CONTEXT_BUCKETS[number];

export type FrameState = Pick<DialogueMemory, "active" | "champion" | "spell" | "stat" | "compared" | "item"
  | "matchup" | "matchups" | "matchupGroup" | "matchupScope" | "conditions" | "numeric" | "mechanic" | "control" | "combo">
  & { rule?: Omit<NonNullable<DialogueMemory["rule"]>, "text"> };

export interface ContextFrame {
  key: string;
  patch: string;
  kind: NonNullable<DialogueMemory["active"]>;
  turn: number;
  state: FrameState;
}

export interface ContextDecision {
  policy: ContextPolicy;
  action: "keep" | "resume" | "clarify";
  candidates: string[];
  selected?: string;
  reason?: "evicted";
  scores?: Array<{ key: string; probability: number }>;
}
