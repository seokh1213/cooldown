/** 실제 대화 진입점과 기존 오프라인 판정기를 사용하고 저장 형식으로 기억을 복원한다. */
import { loadData, offlineFileJudge, type Lang } from "../kev-agent/lib";
import { translations } from "../../../../src/shared/i18n/translations";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../../../src/features/advisor/storage/history";
import type { DialogueMemory } from "../../../../src/features/advisor/conversation/memory/dialogueState";
import type { PlanContext, PlanDeps } from "../../../../src/features/advisor/contracts/planTypes";
import { statQueryFromAnswer, type ChampionStatQuery } from "../../../../src/features/advisor/understanding/stats/statQuery";
import { isDeepStrictEqual } from "node:util";

export function appChat(options: { lang?: Lang; inferStatQuery?: PlanDeps["inferStatQuery"]; memory?: DialogueMemory }) {
  const lang = options.lang ?? "ko_KR";
  const data = loadData(lang);
  const ctx: PlanContext = { data, lang, copy: translations[lang].advisor, judge: "offline", consented: false,
    canUseModel: false, retrieval: false, championIds: [], turns: options.memory ? [{ role: "assistant", memory: options.memory }] : [] };
  const deps: PlanDeps = { judge: offlineFileJudge(), search: async () => [], inferStatQuery: options.inferStatQuery };
  return { data, async ask(question: string, expected: ChampionStatQuery | null) {
    const start = performance.now();
    const { dialogue, reply } = await answerDialogue(question, ctx, deps);
    const query = reply.answer ? statQueryFromAnswer(reply.answer) ?? null : null;
    const exact = isDeepStrictEqual(query, expected);
    // 둘 다 보여주는 비교는 열 순서가 달라도 같은 대상과 항목의 정답이다.
    const normalized = (value: ChampionStatQuery | null) => value && { ...value, champions: [...value.champions].sort() };
    const semanticCorrect = isDeepStrictEqual(normalized(query), normalized(expected));
    const text = reply.respond ? reply.respond.plan.withoutConsent : reply.text;
    const valueKey = expected && `lv${expected.level}` as "lv1" | "lv6" | "lv11" | "lv18";
    const expectedValues = expected && valueKey && query ? query.champions.map(id => String(data.cardById.get(id)?.stats[expected.field]?.[valueKey] ?? "")) : [];
    const shownValues = reply.answer?.kind === "compare" ? reply.answer.rows.find(row => row.hit)?.values
      : reply.answer?.kind === "champion" ? [reply.answer.headline?.value ?? ""] : undefined;
    const valuesCorrect = !expected || semanticCorrect && isDeepStrictEqual(shownValues, expectedValues) && expectedValues.every(value => value && text.includes(value));
    const regenUnitCorrect = expected?.field !== "healthRegen" || /5초당|per 5s|每5秒/.test(text);
    const rows = [...ctx.turns, { role: "user" as const, content: question }, { role: "assistant" as const, content: text, answer: reply.answer, memory: reply.memory }];
    ctx.turns = rows.map((turn, i) => reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn({ ...turn, id: i + 1, content: turn.content ?? "" }))), data)!).filter(Boolean);
    return { question, expected, query, exact, semanticCorrect, valuesCorrect, regenUnitCorrect, text, answerKind: reply.answer?.kind,
      memory: reply.memory, serializedMemory: ctx.turns.at(-1)?.memory, planTypes: dialogue.parts.map(part => part.plan.type),
      milliseconds: performance.now() - start, respond: Boolean(reply.respond) };
  } };
}
