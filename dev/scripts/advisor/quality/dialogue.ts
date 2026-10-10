import fs from "node:fs";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { translations } from "../../../../src/shared/i18n/translations";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../../../src/features/advisor/storage/history";
import { requestClassifier } from "../../../../src/features/advisor/understanding/requests/requestIntent";
import { withRequestModel, readRequestScope, requestScopePrompt } from "../../../../src/features/advisor/model/requestScopeModel";
import { questionLanguage } from "../../../../src/features/advisor/understanding/questionLanguage";
import { answerEvidence } from "../../../../src/features/advisor/answers/evidence/answerEvidence";
import { buildRetrievalDocs } from "../../../../src/features/advisor/application/searchFallback";
import type { PlanContext, PlanDeps } from "../../../../src/features/advisor/contracts/planTypes";
import type { Language } from "../../../../src/shared/i18n";
import { loadData, offlineFileJudge } from "../kev-agent/lib";
import { ROOT } from "./bank";
import { gradeTurn, routeCheck, observedAnswer, describe } from "./checks";
import type { QualityStory, QualityRow } from "./types";

export async function readPublic(file: string): Promise<ArrayBuffer> {
  const buffer = await fs.promises.readFile(path.join(ROOT, "public", file));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}
export function localFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    if (typeof input !== "string" || !input.startsWith("/data/")) return original(input, init);
    const file = path.join(ROOT, "public", input);
    return Promise.resolve(fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response("", { status: 404 }));
  };
  return () => { globalThis.fetch = original; };
}
export interface ModelRuntime {
  judge: NonNullable<PlanDeps["judge"]>;
  search: NonNullable<PlanDeps["search"]>;
  generate: (system: string, prompt: string, maxTokens: number, purpose?: "grounded-summary" | "grounded-numeric") => Promise<string>;
}
export function evaluationDeps(runtime?: ModelRuntime, lang: Language = "ko_KR"): PlanDeps {
  const fast = requestClassifier(readPublic);
  return { judge: runtime?.judge ?? offlineFileJudge(), search: runtime?.search ?? (async () => []),
    classifyRequest: runtime ? withRequestModel(fast, async text => {
      const request = requestScopePrompt(text, questionLanguage(text) ?? lang);
      return readRequestScope(await runtime.generate(request.system, request.messages[0].content, request.maxTokens, "grounded-summary"));
    }) : fast,
    generateNumeric: runtime ? async request => runtime.generate(request.system, request.prompt, request.maxTokens, request.purpose) : undefined };
}
export function qualityContext(lang: Language, mode: "none" | "offline" | "model"): PlanContext {
  return { data: loadData(lang), lang, copy: translations[lang].advisor, turns: [], championIds: [], judge: mode,
    consented: mode === "model", canUseModel: mode === "model", retrieval: mode === "model" };
}
export function restoreReply(ctx: PlanContext, question: string, reply: Awaited<ReturnType<typeof answerDialogue>>["reply"]): void {
  const turns = [...ctx.turns, { id: ctx.turns.length, role: "user" as const, content: question },
    { id: ctx.turns.length + 1, role: "assistant" as const, content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory }];
  ctx.turns = turns.flatMap((turn, index) => {
    // A fixture may seed memory without an actual message; the next reply carries it forward.
    if (index < ctx.turns.length && !turn.content) return [];
    const revived = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn as Parameters<typeof dehydrateTurn>[0]))), ctx.data!);
    if (!revived) throw new Error("History restoration failed");
    return [revived];
  });
}

export async function runDialogue(options: { stories: QualityStory[]; mode: "none" | "offline" | "model"; deps: PlanDeps | ((lang: Language) => PlanDeps);
  record: (row: QualityRow) => void }): Promise<void> {
  let measured = 0;
  for (const story of options.stories) {
    const ctx = qualityContext(story.lang, options.mode);
    const deps = typeof options.deps === "function" ? options.deps(story.lang) : options.deps;
    if (story.memory) {
      const memory = story.memoryPatch === "current" ? { ...story.memory, patch: ctx.data!.patch } : story.memory;
      ctx.turns = [{ role: "assistant", memory: memory as unknown as NonNullable<PlanContext["turns"][number]["memory"]> }];
    }
    for (const [turn, entry] of story.turns.entries()) {
      const start = performance.now();
      const output = await answerDialogue(entry.q, ctx, deps);
      const checks = gradeTurn({ story, turn, output, ctx });
      if (entry.expected.routeGold) checks.push(...routeCheck({ output, ctx, expected: entry.expected }));
      const first = output.dialogue.parts[0]?.plan;
      if (entry.expected.mine) checks.push({ label: "route-mine", pass: first?.type === "matchup" && first.mine.id === entry.expected.mine });
      const evidence = output.dialogue.parts.map(part => answerEvidence(part.plan, buildRetrievalDocs(ctx.data!, ctx.lang), ctx.lang).text).filter(Boolean).join("\n\n");
      options.record({ id: `${story.id}:${turn}`, suite: story.suites, mode: options.mode, question: entry.q,
        text: output.reply.text, checks, pass: checks.length && !story.manual ? checks.every(check => check.pass) : null,
        seconds: (performance.now() - start) / 1000, evidence, observed: observedAnswer(output.reply.answer),
        plans: output.dialogue.parts.map(part => describe(part.plan)), memory: output.reply.memory,
        preserve: entry.expected.sameAsBaseline === true,
        numeric: "numericAttempt" in output ? output.numericAttempt : undefined });
      restoreReply(ctx, entry.q, output.reply);
      // CPU 조회도 저장 주기마다 신호 처리를 허용해야 중단 후 다음 체크포인트로 넘어가지 않는다.
      if (++measured % 25 === 0) await setImmediate();
    }
  }
}
