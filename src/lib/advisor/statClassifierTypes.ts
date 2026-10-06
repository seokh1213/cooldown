import type { StatName } from "@/lib/knowledge/facts";

export type StatLabel = StatName | "inherit" | "other";
export interface Channel { kind: "char" | "jamo" | "context"; vocabulary: Record<string, number>; idf?: number[] }
export interface LinearModel {
  name: string;
  labels: StatLabel[];
  channels: Channel[];
  weights: number[][];
  bias: number[];
  confidence: number;
  margin: number;
}
