/** 숫자 예시가 오해를 유발한다는 경쟁 설명을 확인하는 동일 스키마 대조 시험. */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { loadData } from "../kev-agent/lib";
import { answerStructured } from "./adapter";
import { cases, grade } from "./cases";
import { loadReviewedRecords, ROOT } from "./fixtures";
import { generate } from "./ollama";
import { PAYLOAD_SCHEMA, QUERY_SCHEMA, auditCandidate, parseQuery } from "./schema";

const querySystem = `Extract fields from the CURRENT QUESTION only. Do not answer the question. No unstated numbers or conditions: use null.
Use conversion for health becoming attack damage; basic_attack for second shot/cancel/move speed; stack_proc for hit count/shield; recovery for healing; inherit for an omitted topic; unsupported otherwise.
For asked, choose the effect explicitly requested, otherwise inherit. Copy a health amount only if the question explicitly gives a health quantity. Percentages are not health quantities.
healthKind: bonus for item/additional health, base for initial/base health, growth for level growth.
followup: fired if the second shot was fired, cancelled if explicitly cancelled, otherwise null. hits: explicitly stated hit count. target: champion or minion only when stated.
shieldReady and visibleToEnemies must be null unless explicitly stated. Previous state is context only: do not copy its values.
Schema: ${JSON.stringify(QUERY_SCHEMA)}`;
const selected = cases.filter(item => ["a01", "a05", "a08", "p01", "p05", "p06", "p08", "n04"].includes(item.id));
const data = loadData("ko_KR");
const records = loadReviewedRecords();
const queryRows = [];
for (const item of selected) {
  const raw = await generate({ system: querySystem, content: `Current question: ${item.question}`, schema: QUERY_SCHEMA });
  const reply = await answerStructured(item.question, { data, records }, async () => parseQuery(JSON.parse(raw.text)));
  queryRows.push({ ...item, raw, ...reply, grade: grade(reply.result.text, item) });
}
const authorSystem = `Extract only mechanics supported by the supplied passive source. Omit unsupported types and do not guess.
One rule per type. capacityBonusADRatio is a fractional coefficient on bonus attack damage in the stored-health limit.
The metadata is supplied by code. Output only the rules. Schema: ${JSON.stringify(PAYLOAD_SCHEMA)}`;
const authorRows = [];
for (const record of records) {
  const raw = await generate({ system: authorSystem, content: record.source.text, schema: PAYLOAD_SCHEMA, maxTokens: 700 });
  let errors: string[];
  let value: unknown;
  try { value = JSON.parse(raw.text); errors = auditCandidate(value, record); }
  catch { errors = ["invalid JSON"]; }
  authorRows.push({ champion: record.champion, raw, value, errors });
}
writeFileSync(path.join(ROOT, "research/llm-evals/mechanic-schema/refined-results.json"), JSON.stringify({
  purpose: "same schema, simplified English prompt without numeric examples; prompt/keyword language also changed, so not an isolated numeric-example causal estimate",
  querySystem, authorSystem, queryRows, authorRows, generations: queryRows.length + authorRows.length,
}, null, 2) + "\n");
console.log(JSON.stringify({ queries: queryRows.length, passed: queryRows.filter(row => row.grade.pass).length,
  authorMatched: authorRows.filter(row => !row.errors.length).length, generations: queryRows.length + authorRows.length }));
