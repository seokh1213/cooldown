/** 실행 시에도 사용하는 동일한 사실 검사를 전체 답변 은행에 적용한다. */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadData } from "./kev-agent/lib";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { checkMatchupFacts, checkedMatchupPair } from "../../../src/features/advisor/answers/matchupFactCheck";
import type { PrecomputedFile } from "../../../src/features/advisor/retrieval/precomputed";

const patch = resolvePatchVersion();
const directory = join(PUBLIC_DATA_ROOT, patch, "llm/matchups");
const findings: Array<{ language: string; mine: string; enemy: string; section: string; sentence: string; reason: string }> = [];
let sections = 0;
let remainingAfterFilter = 0;
for (const language of ["ko_KR", "en_US", "zh_CN"] as const) {
  const data = loadData(language);
  const suffix = language === "ko_KR" ? ".json" : `.${language}.json`;
  const files = readdirSync(directory).filter(file => language === "ko_KR" ? /^[A-Za-z]+\.json$/.test(file) : file.endsWith(suffix));
  for (const file of files) {
    const mine = file.slice(0, -suffix.length);
    const bank = JSON.parse(readFileSync(join(directory, file), "utf8")) as PrecomputedFile;
    for (const [enemy, pair] of Object.entries(bank.pairs)) {
      const cards = [mine, enemy].map(id => data.cardById.get(id)).filter(card => card !== undefined);
      for (const text of Object.values(checkedMatchupPair(pair, cards))) if (text) remainingAfterFilter += checkMatchupFacts(text, cards).length;
      for (const [section, text] of Object.entries(pair)) {
        sections++;
        for (const issue of checkMatchupFacts(text!, cards)) findings.push({ language, mine, enemy, section, ...issue });
      }
    }
  }
}
const report = { patch, sections, remainingAfterFilter, findings };
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
console.log(JSON.stringify({ patch, sections, flaggedSentences: findings.length, remainingAfterFilter, reasons: Object.fromEntries([...new Set(findings.map(f => f.reason))].map(reason => [reason, findings.filter(f => f.reason === reason).length])), examples: findings.slice(0, 8) }, null, 2));
