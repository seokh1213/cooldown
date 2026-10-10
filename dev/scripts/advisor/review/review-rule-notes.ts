import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RuleNotes } from "../../../../src/domain/knowledge/notes/rules";
import { resolvePatchVersion } from "../lib/data";

export interface RuleCorrection {
  page: string;
  original: string;
  text: Record<"ko_KR" | "en_US" | "zh_CN", string>;
  sources: string[];
  reviewedAt: string;
}

export function reviewRuleNotes<T extends Pick<RuleNotes, "page" | "notes" | "notesKo" | "notesZh">>(
  rules: T[], corrections: RuleCorrection[],
): T[] {
  const keys = new Set<string>();
  for (const correction of corrections) {
    const key = JSON.stringify([correction.page, correction.original]);
    if (keys.has(key) || !correction.original || !correction.sources.length || !Number.isFinite(Date.parse(correction.reviewedAt))
      || Object.values(correction.text).length !== 3 || ["ko_KR", "en_US", "zh_CN"].some(lang => !correction.text[lang as keyof RuleCorrection["text"]]?.trim())) {
      throw new Error(`Invalid rule correction: ${correction.page}`);
    }
    keys.add(key);
  }
  return rules.map(rule => {
    const replacements = rule.notes.map(note => corrections.find(correction => correction.page === rule.page && correction.original === note));
    if (!replacements.some(Boolean)) return rule;
    if ([rule.notesKo, rule.notesZh].some(notes => notes && notes.length !== rule.notes.length)) {
      throw new Error(`Rule translation alignment differs: ${rule.page}`);
    }
    return { ...rule, notes: rule.notes.map((note, index) => replacements[index]?.text.en_US ?? note),
      ...(rule.notesKo && { notesKo: rule.notesKo.map((note, index) => replacements[index]?.text.ko_KR ?? note) }),
      ...(rule.notesZh && { notesZh: rule.notesZh.map((note, index) => replacements[index]?.text.zh_CN ?? note) }),
    };
  });
}

function main() {
  const file = path.resolve(`public/data/${resolvePatchVersion()}/llm/rule-notes.json`);
  const original = fs.readFileSync(file, "utf8");
  const data = JSON.parse(original) as { rules: RuleNotes[] };
  const corrections = JSON.parse(fs.readFileSync("dev/data/knowledge/rule-corrections.json", "utf8")) as { corrections: RuleCorrection[] };
  const reviewed = { ...data, rules: reviewRuleNotes(data.rules, corrections.corrections) };
  if (JSON.stringify(data) !== JSON.stringify(reviewed)) fs.writeFileSync(file, JSON.stringify(reviewed, null, 2) + "\n");
  console.log(`규칙 검수: ${corrections.corrections.length}건, 원문이 일치하는 항목만 교정`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
