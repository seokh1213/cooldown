/** 앱에서 사용하는 이름 탐지기를 그대로 쓰는 Node 실험 진입점. 앱 기본 경로에는 연결하지 않는다. */
import type { AdvisorData } from "../../../src/lib/advisor/context";
import { detectChampionMentions } from "../../../src/lib/advisor/intent";
import { fingerprint, sourceCard } from "./fixtures";
import { evaluate } from "./engine";
import { updateMemory } from "./memory";
import { cueQuery } from "./query";
import { parseQuery } from "./schema";
import type { MechanicRecord, Memory, Query, Result } from "./types";

export interface Context { data: AdvisorData; records: MechanicRecord[]; previous?: Memory }
export type Extract = (question: string, previous?: Memory) => Promise<Query>;
export async function answerStructured(question: string, context: Context, extract?: Extract): Promise<{ result: Result; memory?: Memory; query?: Query }> {
  const mentions = detectChampionMentions(context.data, question);
  if (mentions.length > 1) return { result: { status: "clarify", text: "한 챔피언씩 패시브 조건을 물어봐 줘. 이번 실험은 단일 패시브 대화만 지원해.", rules: [] } };
  const champion = mentions[0]?.card.id ?? context.previous?.champion;
  const record = context.records.find(record => record.champion === champion);
  if (!record) return { result: { status: "unsupported", text: "이번에 구조화한 패시브 자료에서는 확인할 수 없어. 파이크나 아크샨의 패시브 조건을 물어봐 줘.", rules: [] } };
  const previous = context.previous?.champion === champion ? context.previous : undefined;
  let query: Query;
  try { query = parseQuery(extract ? await extract(question, previous) : cueQuery(question, previous)); }
  catch { return { result: { status: "clarify", text: "질문의 조건을 정확히 추출하지 못했어. 대상이나 궁금한 효과를 조금 더 알려 줘.", rules: [] }, memory: previous }; }
  const memory = updateMemory(previous, query, { champion: record.champion, patch: context.data.patch });
  const result = evaluate(record, memory, { patch: context.data.patch, sha256: fingerprint(sourceCard(record.champion)) });
  return { result, memory, query };
}
