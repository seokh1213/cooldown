/** 칸 나눠 쓰기 — 자리만 잡아 둔다 */
import type { AdvisorAnswer } from "./answer";
import type { Language } from "@/i18n";

export interface SectionPlan {
  key: string;
  heading: string;
  prompt: string;
  maxTokens: number;
}

export function matchupSections(_answer: AdvisorAnswer, _patch: string, _lang: Language): SectionPlan[] | undefined {
  return undefined;
}

export function joinSection(part: SectionPlan, body: string): string {
  return `**${part.heading}**\n${body.trim()}\n\n`;
}
