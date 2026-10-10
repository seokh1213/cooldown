/** 같은 앱 진입점과 저장 복원을 사용해 기준선과 승인 규칙 검색을 비교한다. 네트워크·생성 모델 없음. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData, offlineFileJudge } from "../kev-agent/lib";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../../../src/features/advisor/storage/history";
import { translations } from "../../../../src/shared/i18n/translations";
import type { Language } from "../../../../src/shared/i18n";
import type { PlanContext, PlanDeps } from "../../../../src/features/advisor/contracts/planTypes";
import { answerReviewed, type RetrievalMemory } from "./answerReviewed";
import { reviewedAbilities } from "./retrieval";
import { ROOT } from "./prepare";
import { digest } from "./sources";
import { qualityFailures, type QualityReference } from "./qualityGate";
import { reviewedRubric, MECHANICS_QUESTIONS, type MechanicsStory } from "./reviewedRubric";
import type { ReviewedContract } from "../quality/reviewedContracts";

export interface ExpectedTurn { q: string; require?: string[]; must?: string[]; forbid?: string[]; sameAsBaseline?: boolean; lang?: Language }
export function gradeAnswer(expected: ExpectedTurn, text: string): string[] {
  return [...[...new Set([...(expected.require ?? []), ...(expected.must ?? [])])].filter(pattern => !new RegExp(pattern, "i").test(text)).map(pattern => `missing:${pattern}`),
    ...(expected.forbid ?? []).filter(pattern => new RegExp(pattern, "i").test(text)).map(pattern => `forbidden:${pattern}`), ...(!text.trim() ? ["empty"] : [])];
}
const lexicalDeps: PlanDeps = { judge: async () => { throw new Error("This experiment uses the existing lexical app route, without a model judge"); }, search: async () => [] };
function context(lang: Language, judge: "none" | "offline"): PlanContext {
  return { data: { ...loadData(lang), abilityRules: undefined }, lang, copy: translations[lang].advisor, turns: [], championIds: [],
    judge, consented: false, canUseModel: false, retrieval: false };
}
function storeReply(ctx: PlanContext, question: string, reply: Awaited<ReturnType<typeof answerDialogue>>["reply"]): void {
  const turns = [...ctx.turns, { id: ctx.turns.length, role: "user" as const, content: question },
    { id: ctx.turns.length + 1, role: "assistant" as const, content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory }];
  ctx.turns = turns.flatMap(turn => {
    const saved = JSON.parse(JSON.stringify(dehydrateTurn(turn as Parameters<typeof dehydrateTurn>[0])));
    const restored = reviveTurn(saved, ctx.data!);
    return restored ? [restored] : [];
  });
}
export async function evaluateAnswers(options: { output: string; mode?: "baseline" | "comparison"; judge?: "none" | "offline" }) {
  const output = options.output, baselineOnly = options.mode === "baseline", judge = options.judge ?? "none";
  const deps = judge === "offline" ? { ...lexicalDeps, judge: offlineFileJudge() } : lexicalDeps;
  const file = path.join(ROOT, MECHANICS_QUESTIONS);
  const contracts = (await readFile(path.join(ROOT, "dev/research/llm-evals/workflow/datasets/regression/reviewed-contracts.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as ReviewedContract);
  const stories = reviewedRubric(JSON.parse(await readFile(file, "utf8")) as MechanicsStory[], contracts);
  const index = await reviewedAbilities();
  const rows = [];
  for (const story of stories) {
    const lang = story.turns[0].lang ?? "ko_KR", baseCtx = context(lang, judge), variantCtx = context(lang, judge);
    let memory: RetrievalMemory | undefined;
    for (const [turn, expected] of story.turns.entries()) {
      const start = performance.now(), baseline = await answerDialogue(expected.q, baseCtx, deps);
      const baselineMs = performance.now() - start;
      const afterStart = performance.now();
      const variant = baselineOnly ? { ...baseline, source: "baseline", retrievalMemory: undefined, abilityId: undefined }
        : await answerReviewed(expected.q, { ctx: variantCtx, deps, index, memory });
      const baselineFailures = gradeAnswer(expected, baseline.reply.text), variantFailures = gradeAnswer(expected, variant.reply.text);
      if (expected.sameAsBaseline && variant.reply.text !== baseline.reply.text) variantFailures.push("changed_protected_answer");
      rows.push({ id: story.id, area: story.area, turn: turn + 1, question: expected.q, expected,
        baseline: { text: baseline.reply.text, pass: !baselineFailures.length, failures: baselineFailures, ms: Number(baselineMs.toFixed(2)) },
        variant: { text: variant.reply.text, pass: !variantFailures.length, failures: variantFailures, source: variant.source,
          ms: Number((performance.now() - afterStart).toFixed(2)), abilityId: variant.abilityId,
          sourceHash: variant.abilityId ? index.get(variant.abilityId)!.job.sourceHash : undefined,
          candidateHash: variant.abilityId ? digest(index.get(variant.abilityId)!.draft) : undefined },
        improved: baselineFailures.length > 0 && !variantFailures.length, regressed: !baselineFailures.length && variantFailures.length > 0 });
      storeReply(baseCtx, expected.q, baseline.reply);
      storeReply(variantCtx, expected.q, variant.reply);
      memory = variant.retrievalMemory;
    }
  }
  const summary = { stories: stories.length, turns: rows.length, reviewedSlots: index.size, judge, questionHash: digest(stories),
    baselinePass: rows.filter(row => row.baseline.pass).length, variantPass: rows.filter(row => row.variant.pass).length,
    improved: rows.filter(row => row.improved).length, regressed: rows.filter(row => row.regressed).length,
    replaced: rows.filter(row => row.variant.source === "reviewed").length,
    scope: "App dialogue entrypoint with the selected judge and no generation; purpose-built fixed questions, not an overall user quality estimate. Shared production dialogue path." };
  const reference = await readFile(path.join(ROOT, "dev/research/llm-evals/champion-mechanics-v2/quality-reference.json"), "utf8")
    .then(text => JSON.parse(text) as QualityReference).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
  const lostApprovedSuccess = reference && !baselineOnly ? qualityFailures({ questionHash: summary.questionHash, index, reference, rows }) : [];
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify({ summary, lostApprovedSuccess, rows }, null, 2)}\n`);
  return { summary, lostApprovedSuccess, hasReference: Boolean(reference),
    failures: rows.filter(row => !row.variant.pass || row.regressed).map(row => ({ id: row.id, turn: row.turn, failures: row.variant.failures, regressed: row.regressed })) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // 앱이 브라우저에서 요청하는 정적 파일을 동일한 public/data에서 제공한다.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => typeof input === "string" && input.startsWith("/data/")
    ? new Response(await readFile(path.join(ROOT, "public", input.slice(1)))) : originalFetch(input, init);
  const judge = process.argv.find(arg => arg.startsWith("--judge="))?.slice(8) ?? "none";
  if (judge !== "none" && judge !== "offline") throw new Error("Use --judge=none or --judge=offline");
  const result = await evaluateAnswers({ output: path.resolve(process.argv[2] ?? "dev/research/llm-evals/champion-mechanics-v2/comparison.json"),
    mode: process.argv.includes("--baseline-only") ? "baseline" : "comparison", judge });
  globalThis.fetch = originalFetch;
  console.log(JSON.stringify(result));
  if (process.argv.includes("--check") && (result.summary.regressed || result.lostApprovedSuccess.length || !result.hasReference)) process.exitCode = 1;
}
