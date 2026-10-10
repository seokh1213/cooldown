/** Execute frozen app routing and retrieval before either generation variant. */
import * as fs from "node:fs";
import * as path from "node:path";
import { translations } from "../../../../src/shared/i18n/translations";
import { planAnswer, type PlanContext, type PlanDeps } from "../../../../src/features/advisor/application/plan";
import { buildRetrievalDocs } from "../../../../src/features/advisor/application/searchFallback";
import { ROOT, appJudge, loadData, planFlags, saveJudgeCache } from "../kev-agent/lib";
import { evaluationSearch } from "../kev-agent/retrieval_eval";
import { answerEvidence as evidenceOf } from "../../../../src/features/advisor/answers/evidence/answerEvidence";

interface Question {
  id: string; question: string; docId: string; answer: string; answerable: boolean;
  conflictingSource: boolean; cohort: string;
}
interface Evidence {
  id: string; plan: string; text: string; documentId?: string; context?: string;
  goldDocumentReached: boolean; appTextContainsGold: boolean; milliseconds: number;
}

async function main() {
  const [input, output] = process.argv.slice(2);
  const data = loadData("ko_KR"); const documents = buildRetrievalDocs(data, "ko_KR");
  const context: PlanContext = { data, lang: "ko_KR", copy: translations.ko_KR.advisor,
    championIds: [], turns: [], ...planFlags(true) };
  const deps: PlanDeps = { judge: appJudge, search: evaluationSearch(ROOT) };
  const questions = fs.readFileSync(input, "utf8").trim().split("\n")
    .map((line) => JSON.parse(line) as Question)
    .filter((row) => row.answerable && !row.conflictingSource && row.cohort === "new");
  const rows: Evidence[] = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, "utf8")) as Evidence[] : [];
  const completed = new Set(rows.map((row) => row.id));
  for (const row of questions) {
    if (completed.has(row.id)) continue;
    const started = performance.now();
    const plan = await planAnswer(row.question, context, deps);
    const evidence = evidenceOf(plan, documents);
    const document = documents.find((doc) => doc.id === evidence.documentId);
    rows.push({ id: row.id, plan: plan.type, ...evidence,
      context: document ? `${document.title}\n${document.text}` : undefined,
      goldDocumentReached: evidence.documentId === row.docId,
      appTextContainsGold: evidence.text.includes(row.answer), milliseconds: performance.now() - started });
    const temporary = output + ".pending";
    fs.writeFileSync(temporary, JSON.stringify(rows, null, 1)); fs.renameSync(temporary, output);
    saveJudgeCache();
    if (rows.length % 20 === 0) console.log(JSON.stringify({ appEvidence: rows.length, total: questions.length }));
  }
  console.log(JSON.stringify({ completed: rows.length, exactGoldDocument: rows.filter((row) => row.goldDocumentReached).length,
    appTextContainsGold: rows.filter((row) => row.appTextContainsGold).length,
    scope: "Actual planAnswer and hybridSearch, isolated single turns; source reach/text containment are not exact-answer scores" }));
  fs.writeFileSync(path.join(path.dirname(output), "app-evidence-scope.json"), JSON.stringify({
    app: "Frozen snapshot from the five-candidate experiment", turnContext: "Empty history/champion selection",
    exclusion: "Conflicting source amounts and provided-context negatives excluded from retrieval scoring",
  }, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "App evidence evaluation failed"); process.exitCode = 1;
});
