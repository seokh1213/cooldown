import fs from "node:fs";
import path from "node:path";
import { readOfflineModel, answerOffline, type OfflineJudgeMeta } from "../../../../src/features/advisor/model/offlineJudge";
import { REQUEST_MODEL_FILES, REQUEST_SCOPES, REQUEST_SCOPE_INSTRUCTION } from "../../../../src/features/advisor/understanding/requests/requestIntent";
import { judgeRouteState } from "../../../../src/features/advisor/application/routeAsk";
import { resolveQuestion } from "../../../../src/features/advisor/understanding/resolvedQuestion";
import { requestScopePrompt, readRequestScope } from "../../../../src/features/advisor/model/requestScopeModel";
import { confidentChoice } from "../../../../src/features/advisor/understanding/requests/requestIntent";
import { numericChecks, numericRequest, type NumericGold } from "./numeric";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { answerEvidence } from "../../../../src/features/advisor/answers/evidence/answerEvidence";
import { buildRetrievalDocs } from "../../../../src/features/advisor/application/searchFallback";
import { current } from "../vector-search/corpus";
import { evaluationDeps, readPublic, qualityContext, type ModelRuntime } from "./dialogue";
import type { QualityStory, QualityRow, Check } from "./types";
import { ROOT, WORKFLOW } from "./bank";
import { fileHash } from "./archive";
import { ADVISOR_MODEL } from "../../../../src/features/advisor/model/config";

const makeRow = (story: QualityStory, mode: string, text: string, checks: Check[], start: number): QualityRow => ({
  id: `${story.id}:0`, suite: story.suites, mode, question: story.turns[0].q, text, checks,
  pass: checks.length ? checks.every(check => check.pass) : null, seconds: (performance.now() - start) / 1000,
});

export function benchmarkModes(story: QualityStory, model: boolean): string[] {
  if (story.suites.includes("request-scope")) return [model ? "hybrid-scope" : "fast-scope"];
  if (story.suites.includes("retrieval")) return [model ? `vector-top1-${ADVISOR_MODEL.retrieval!.threshold}` : "lexical"];
  if (story.suites.includes("item-alias")) return [model ? "model-item" : "offline-item"];
  if (!model) return [];
  if (story.suites.includes("retired-verifier-330")) return ["frozen-verifier-review"];
  if (story.suites.includes("numeric-qa")) {
    const gold = story.turns[0].expected.numericGold as NumericGold;
    return gold.conflictingSource ? ["conflicting-source"] : ["frozen-numeric", ...(gold.answerable && gold.cohort === "new" ? ["app-numeric"] : [])];
  }
  return [];
}

export async function runBenchmarks(options: { stories: QualityStory[]; runtime?: ModelRuntime; record: (row: QualityRow) => void }): Promise<void> {
  const offline = readOfflineModel(JSON.parse(new TextDecoder().decode(await readPublic(REQUEST_MODEL_FILES.meta))) as OfflineJudgeMeta,
    await readPublic(REQUEST_MODEL_FILES.weights));
  for (const story of options.stories) {
    const deps = evaluationDeps(options.runtime, story.lang);
    const start = performance.now(), entry = story.turns[0], expected = entry.expected;
    const ctx = qualityContext(story.lang, options.runtime ? "model" : "offline");
    if (story.suites.includes("retired-verifier-330") && options.runtime) {
      const context = String(expected.verifierContext);
      const text = await options.runtime.generate("Check only the supplied material. Output supported or unsupported.", `${context}\n\n${entry.q}`, 8, "grounded-summary");
      const row = makeRow(story, "frozen-verifier-review", text.trim(), [], start);
      row.evidence = context; options.record(row);
    } else if (story.suites.includes("request-scope")) {
      const resolved = resolveQuestion(entry.q, ctx.data!);
      const names = resolved.mentions.map(mention => entry.q.slice(mention.index, mention.index + mention.length));
      const [probabilities] = answerOffline(offline, judgeRouteState(entry.q, names), [{ instructions: REQUEST_SCOPE_INSTRUCTION, options: REQUEST_SCOPES.map(name => ({ name })) }]);
      const fast = confidentChoice(REQUEST_SCOPES, probabilities);
      let choice = fast?.label;
      if (options.runtime && !choice) {
        const prompt = requestScopePrompt(entry.q, story.lang);
        choice = readRequestScope(await options.runtime.generate(prompt.system, prompt.messages[0].content, prompt.maxTokens, "grounded-summary"))?.scope;
      }
      const predicted = REQUEST_SCOPES[probabilities.indexOf(Math.max(...probabilities))];
      options.record(makeRow(story, options.runtime ? "hybrid-scope" : "fast-scope", (options.runtime ? choice : predicted) ?? "ABSTAIN", [
        { label: "scope", pass: (options.runtime ? choice : predicted) === expected.scope },
      ], start));
    } else if (story.suites.includes("retrieval")) {
      const gold = expected.docIds as string[];
      const found = options.runtime ? (await options.runtime.search(entry.q, story.lang)).filter(hit => hit.score >= ADVISOR_MODEL.retrieval!.threshold)[0]?.id : current(story.lang, entry.q).id;
      options.record(makeRow(story, options.runtime ? `vector-top1-${ADVISOR_MODEL.retrieval!.threshold}` : "lexical", found ?? "NONE", [{ label: "retrieval", pass: gold.length ? Boolean(found && gold.includes(found)) : !found }], start));
    } else if (story.suites.includes("item-alias")) {
      const output = await answerDialogue(entry.q, ctx, deps), gold = expected.docIds as string[];
      const answer = output.reply.answer;
      const id = answer?.kind === "item" ? String(answer.itemId) : undefined;
      options.record(makeRow(story, options.runtime ? "model-item" : "offline-item", id ?? "NONE", [{ label: "item-id", pass: gold.length ? Boolean(id && gold.includes(id)) : !id }], start));
    } else if (story.suites.includes("numeric-qa") && options.runtime) {
      const gold = expected.numericGold as NumericGold;
      if (gold.conflictingSource) {
        const row = makeRow(story, "conflicting-source", "", [], start); row.evidence = gold.context; options.record(row); continue;
      }
      const request = numericRequest(entry.q, gold.context);
      const raw = await options.runtime.generate(request.system, request.prompt, request.maxTokens, "grounded-numeric");
      const row = makeRow(story, "frozen-numeric", raw.trim(), numericChecks(raw, gold), start);
      row.evidence = request.evidence; options.record(row);
      if (!gold.answerable || gold.cohort !== "new") continue;
      const appStart = performance.now(), output = await answerDialogue(entry.q, ctx, deps);
      const docs = buildRetrievalDocs(ctx.data!, story.lang);
      const delivered = output.dialogue.parts.length === 1 ? answerEvidence(output.dialogue.parts[0].plan, docs, story.lang) : undefined;
      const document = docs.find(doc => doc.id === delivered?.documentId);
      const appRequest = document ? numericRequest(entry.q, `${document.title}\n${document.text}`) : undefined;
      const appRaw = appRequest ? await options.runtime.generate(appRequest.system, appRequest.prompt, appRequest.maxTokens, "grounded-numeric") : "NOT_FOUND";
      const appRow = makeRow(story, "app-numeric", appRaw.trim(), [{ label: "gold-document", pass: document?.id === gold.docId },
        { label: "raw-exact-number-and-unit", pass: appRaw.trim() === gold.answer }], appStart);
      appRow.evidence = document?.text;
      appRow.numeric = "numericAttempt" in output ? output.numericAttempt : undefined;
      if (appRow.numeric?.accepted) appRow.checks.push({ label: "accepted-answer-correct", pass: appRow.numeric.raw?.trim() === gold.answer });
      appRow.pass = appRow.checks.every(check => check.pass); options.record(appRow);
    }
  }
}

export function splitAudit(stories: QualityStory[]): string[] {
  const training = JSON.parse(fs.readFileSync(path.join(ROOT, "dev/scripts/advisor/offline-classifier/request-training.json"), "utf8")) as Record<string, string[]>;
  const test = JSON.parse(fs.readFileSync(path.join(ROOT, "dev/scripts/advisor/offline-classifier/request-test.json"), "utf8")) as Record<string, string[]>;
  const used = new Set(Object.values(training).flat());
  const errors = Object.values(test).flat().filter(text => used.has(text)).map(text => `Request train/test overlap: ${text}`);
  const maskedKey = (text: string) => text.toLowerCase().replace(/\s+/g, "");
  const trained = new Set([...used].map(maskedKey));
  for (const story of stories.filter(story => story.suites.includes("request-scope"))) {
    const resolved = resolveQuestion(story.turns[0].q, qualityContext(story.lang, "none").data!);
    const masked = [...resolved.mentions].sort((a, b) => b.index - a.index).reduce((text, mention) =>
      text.slice(0, mention.index) + "◇" + text.slice(mention.index + mention.length), story.turns[0].q);
    if (trained.has(maskedKey(masked))) errors.push(`Request heldout/training overlap: ${story.sources[0].row}`);
  }
  const sft = JSON.parse(fs.readFileSync(path.join(ROOT, WORKFLOW, "datasets/qa/manifests/splits.json"), "utf8")) as Record<string, { docIds: string[]; sha256: string }>;
  for (const [name, partition] of [["natural-train.jsonl", "train"], ["natural-dev.jsonl", "dev"]]) {
    if (fileHash(`${WORKFLOW}/datasets/qa/${partition}/natural.jsonl`) !== sft[name].sha256) errors.push(`SFT ${partition} changed; update provenance and inspect document splits`);
  }
  const trainDocs = new Set(sft["natural-train.jsonl"].docIds), devDocs = new Set(sft["natural-dev.jsonl"].docIds);
  const heldoutDocs = new Set(stories.filter(story => story.suites.includes("numeric-qa"))
    .map(story => story.turns[0].expected.numericGold as NumericGold).filter(gold => gold.cohort === "new").map(gold => gold.docId));
  for (const id of trainDocs) if (devDocs.has(id) || heldoutDocs.has(id)) errors.push(`SFT document split overlap: ${id}`);
  for (const id of devDocs) if (heldoutDocs.has(id)) errors.push(`SFT dev/heldout overlap: ${id}`);
  if (!stories.length) errors.push("No evaluation cases");
  return errors;
}
