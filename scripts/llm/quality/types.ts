import type { Language } from "../../../src/i18n";

export interface SourceRef { file: string; row: string }
export interface QualityTurn {
  q: string;
  expected: Record<string, unknown>;
}
export interface QualityStory {
  id: string;
  suites: string[];
  lang: Language;
  turns: QualityTurn[];
  sources: SourceRef[];
  split: string;
  memory?: Record<string, unknown>;
  manual?: boolean;
}
export interface Check { label: string; pass: boolean }
export interface QualityRow {
  id: string;
  suite: string[];
  mode: string;
  question: string;
  text: string;
  checks: Check[];
  pass: boolean | null;
  seconds: number;
  evidence?: string;
  observed?: Record<string, unknown>;
  plans?: Record<string, unknown>[];
  memory?: Record<string, unknown>;
  numeric?: { accepted: boolean; reason: string; raw?: string };
  preserve?: boolean;
}
export interface QualityReport {
  schema: 1;
  profile: string;
  caseHash: string;
  dataHash: string;
  sourceHash: string;
  scorerHash: string;
  graphHash?: string;
  numericPurpose?: "qa" | "base";
  backend?: string;
  model?: string;
  created: string;
  rows: QualityRow[];
  checks: Array<{ name: string; pass: boolean; log: string }>;
}
