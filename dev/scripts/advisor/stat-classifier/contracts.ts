import type { DialogueMemory } from "../../../../src/features/advisor/conversation/dialogueState";
import type { ChampionStatQuery } from "../../../../src/features/advisor/understanding/statQuery";
import type { Label } from "./seeds";

export interface Example {
  id: string;
  family: string;
  split: "train" | "dev" | "test";
  category: string;
  question: string;
  memory: DialogueMemory;
  text: string;
  features: Record<string, number>;
  label: Label;
  expected: ChampionStatQuery | null;
}
export type { Channel, LinearModel } from "../../../../src/features/advisor/understanding/statClassifierTypes";
