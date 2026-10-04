/** 원문 수동 검토 판정과 재현 가능한 집계를 함께 남긴다. 독립 맹검 점수가 아니다. */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./fixtures";
import { MEMORY_SCHEMA, parsePayload, parseQuery } from "./schema";
import type { Case } from "./cases";
import type { Query } from "./types";

const output = path.join(ROOT, "research/llm-evals/mechanic-schema");
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(output, file), "utf8"));
interface Row extends Case {
  baseline: { text: string; seconds: number };
  cue: { result: { text: string }; seconds: number };
  model: { result: { text: string }; query?: Query; raw?: { text: string; seconds: number } };
}
const rows = read<{ rows: Row[] }>("query-results.json").rows;
const baselinePassed = ["a01", "a02", "a03", "a04", "a05", "a06", "a07", "a08", "p01", "p02", "p03", "p04", "p07", "d01-1", "d02-1", "d02-2", "c02", "n05-3"];
const modelPassed = ["a01", "a02", "a04", "p02", "p05", "d01-1", "d02-1", "n02", "n07"];
const rangeIds = ["c01", "n08"];
const facts = rows.filter(row => !rangeIds.includes(row.id));
const median = (values: number[]): number => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
function schemaPass(text: string, parse: (value: unknown) => unknown): boolean {
  try { parse(JSON.parse(text)); return true; } catch { return false; }
}
const authors = read<{ rows: Array<{ generated: { text: string }; errors: string[] }> }>("author-results.json").rows;
const refined = read<{ queryRows: Array<{ raw: { text: string }; grade: { pass: boolean } }>; authorRows: Array<{ raw: { text: string }; errors: string[] }> }>("refined-results.json");
const audit = {
  criterion: "현재 질문의 효과·대상·발동 조건·부정·기본/추가 구분·요청한 계산을 충족해야 한다. 질문에 없는 가정이나 숫자를 조건으로 넣은 답은 통과하지 않는다. 기존 원문에서 조건이 명확하게 설명되면 직접 부정 표현 없이도 인정한다.",
  reviewer: "작업 assistant 원문 검토; 작성자 선정 소규모 탐색 표본; 독립 맹검 아님. 문자열 자동 채점은 보조이며 아래 수동 판정이 최종 지표.",
  scope: "26 earlier + 12 new = 38 turns; 36 fact turns and 2 separate range-guidance checks. No browser/q4 or general champion accuracy claim.",
  factTurns: facts.length,
  passSets: { baseline: baselinePassed, cue: facts.map(row => row.id), model: modelPassed },
  passed: { baseline: baselinePassed.length, cue: facts.length, model: modelPassed.length },
  querySchema: { passed: facts.filter(row => row.model.raw && schemaPass(row.model.raw.text, parseQuery)).length, total: facts.length },
  rangeGuidance: rows.filter(row => rangeIds.includes(row.id)).map(row => ({ id: row.id, cue: row.cue.result.text, model: row.model.result.text })),
  medianSeconds: { baseline: median(facts.map(row => row.baseline.seconds)), cue: median(facts.map(row => row.cue.seconds)),
    modelExtraction: median(facts.map(row => row.model.raw!.seconds)) },
  authorAudit: { candidates: authors.length + refined.authorRows.length,
    schemaPassed: authors.filter(row => schemaPass(row.generated.text, parsePayload)).length + refined.authorRows.filter(row => schemaPass(row.raw.text, parsePayload)).length,
    sourceMatched: [...authors, ...refined.authorRows].filter(row => !row.errors.length).length },
  refined: { factQueries: refined.queryRows.length, schemaPassed: refined.queryRows.filter(row => schemaPass(row.raw.text, parseQuery)).length,
    contentPassed: refined.queryRows.filter(row => row.grade.pass).length },
  totalGenerations: facts.length + authors.length + refined.queryRows.length + refined.authorRows.length,
  manualReasons: {
    "baseline:p05": "14당 1이라는 비율만 제시하고 요청한 140/14=10 계산을 하지 않음.",
    "baseline:d01-2,d01-3,d01-4": "후속 질문에 챔피언 소개 또는 미니언 규칙으로 주제가 바뀜.",
    "baseline:n02": "성장 체력도 전환되는지 묻는데 추가 체력 전환 문장만 제공해 예외 답변이 없음.",
    "model:p01,p03,p04,d02-2": "질문에 체력 800이라는 양이 없는데 800으로 계산한 결과를 답함. 조건 추출 실패로 탈락.",
    "model:a01,a02": "불필요한 필드는 topic 범위 필터에서 지워져 취소 조건을 포함한 최종 답은 맞음. 추출 모든 필드가 정확하다는 뜻은 아님.",
    "range:n08": "여러 챔피언에 관한 기존 앱의 기능 우열은 평가하지 않음. 연구 어댑터의 한 챔피언 범위 안내만 확인.",
  },
};
writeFileSync(path.join(output, "audit.json"), JSON.stringify(audit, null, 2) + "\n");
writeFileSync(path.join(output, "memory.schema.json"), JSON.stringify(MEMORY_SCHEMA, null, 2) + "\n");
console.log(JSON.stringify({ turns: rows.length, scored: audit.factTurns, passed: audit.passed, querySchema: audit.querySchema,
  authorAudit: audit.authorAudit, seconds: audit.medianSeconds, generations: audit.totalGenerations }));
