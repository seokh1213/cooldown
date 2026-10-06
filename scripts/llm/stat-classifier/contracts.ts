import type { DialogueMemory } from "../../../src/lib/advisor/dialogueState";
import type { ChampionStatQuery } from "../../../src/lib/advisor/statQuery";
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
export type { Channel, LinearModel } from "../../../src/lib/advisor/statClassifierTypes";
