/** 경로와 사전 등록된 핵심 내용만 자동 검사한다. 자연성/전투 조언의 의미 평가는 별도 검토한다. */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Result } from "./browser";

type Target = Record<string, unknown>;
interface ContentCheck { label: string; test: (text: string) => boolean }
const includes = (label: string, pattern: RegExp): ContentCheck => ({ label, test: text => pattern.test(text) });

export function matchesTarget(actual: Target, want: Target): boolean {
  if (want.kind === "multi") {
    const parts = actual.parts as Target[] | undefined;
    return actual.kind === "multi" && (want.parts as Target[]).every(target => parts?.some(part => matchesTarget(part, target)));
  }
  const kind = want.kind === "rule" && ["code", "text", "rule"].includes(String(actual.kind)) ? "rule" : actual.kind;
  if (kind !== want.kind) return false;
  return Object.entries(want).every(([key, value]) => {
    if (key === "kind") return true;
    if (Array.isArray(value)) return JSON.stringify([...(actual[key] as string[] ?? [])].sort()) === JSON.stringify([...value].sort());
    return actual[key] === value;
  });
}

/** 질문의 checks를 값/주제 검사로 옮긴 것. 이 점수는 정답률 전체나 사실성 평점이 아니다. */
export function checksFor(id: string, turn: number): ContentCheck[] {
  const key = `${id}:${turn}`;
  const checks: Record<string, ContentCheck[]> = {
    "s06:0": [includes("가속 100은 50% 감소", /50\s*%|절반/)],
    "s07:0": [includes("12초와 가속 50의 결과는 8초", /8\s*초/)],
    "s08:0": [includes("점멸 기본 300초", /300\s*초/)],
    "s09:0": [includes("점화 시전과 정복자 2중첩", /정복자.*(?:2|두).*중첩/)],
    "s10:0": [includes("치유 감소율 비중첩", /중첩.{0,15}(?:않|안|불가)|(?:않|안).{0,15}중첩/)],
    "s11:0": [includes("고정량/퍼센트 구분", /고정/), includes("퍼센트 관통", /퍼센트|비율|%/)],
    "s12:0": [includes("관통 순서", /관통|방어력/), includes("수치 예시 결과 60", /60/)],
    "s13:0": [includes("치유 감소와 보호막 구분", /보호막(?:은|을|도|에는?)?\s*(?:줄|감소|깎).{0,10}(?:않|안)|(?:적용|영향).{0,8}(?:않|없).*보호막|회복.{0,30}보호막.{0,20}별개/)],
    "s15:0": [includes("프리징 자료 범위 고지 또는 직접 설명", /(?:프리징|라인|웨이브).{0,40}(?:없|부족|모르|정리되어 있지)|(?:없|부족).{0,40}(?:프리징|라인|웨이브)|프리징.{0,100}(?:밀|정글|웨이브)/)],
    "s24:0": [includes("가렌 Q 8초", /8\s*초/), includes("정복자 판정 포함", /정복자.*(?:2|두).*중첩/)],
    "d01:2": [includes("가렌 W 쿨타임", /22\/19\.5\/17\/14\.5\/12/)],
    "d01:3": [includes("가속 100은 50% 감소", /50\s*%|절반/)],
    "d04:2": [includes("럼블의 열 사용 설명", /열/)],
    "d05:1": [includes("물리 기본 공격에 관통 적용", /물리|물리 피해/), includes("관통 관계 직답", /적용/)],
    "d05:2": [includes("가렌 R은 고정 피해/관통 무효", /고정/), includes("관통 무효", /늘어나지|적용.{0,8}(?:않|안)|효과.{0,8}(?:없|않)/)],
    "d05:3": [includes("가렌 Q는 물리 관통 적용", /물리.*관통.*적용/)],
    "d06:3": [includes("치유 감소율 비중첩", /중첩.{0,15}(?:않|안|불가)|(?:않|안).{0,15}중첩/)],
    "d07:1": [includes("1랭크 R 130초", /130\s*초/)],
    "d07:2": [includes("가속 50 적용 86.67초", /86\.67\s*초/)],
    "d07:3": [includes("가속 100 정정 65초", /65\s*초/)],
    "d07:4": [includes("같은 조건 말파이트 65초", /65\s*초/), includes("같은 조건 아무무 75초", /75\s*초/)],
    "d09:4": [includes("W 랭크별 차이 표시", /랭크|22\/19\.5\/17\/14\.5\/12/)],
    "d10:3": [includes("가렌 Q 가속 50이면 5.33초", /5\.33\s*초/)],
    "d10:4": [includes("럼블 E 재충전 가속 50이면 4초", /4\s*초/)],
  };
  return checks[key] ?? [];
}

export function memoryChecks(record: Result): Array<{ label: string; pass: boolean }> {
  const key = `${record.id}:${record.turn}`;
  const memory = record.memory;
  const condition = (slot: string, status: string) => memory?.conditions.some(c => c.owner === "enemy" && c.slot === slot && c.status === status) ?? false;
  if (key === "d03:1") return [{ label: "상대 W 부재 저장", pass: condition("W", "down") }];
  if (key === "d03:2" || key === "d03:3") return [{ label: "정정 후 W 존재/Q 부재", pass: condition("W", "ready") && condition("Q", "down") && !condition("W", "down") }];
  if (key === "d07:3" || key === "d07:4") return [{ label: "궁 1랭크/가속 100", pass: memory?.numeric?.rank === 1 && memory.numeric.haste === 100 }];
  if (key === "d10:4") return [{ label: "조회 대상 교체 후 가속 50 유지", pass: memory?.spell?.champion === "Rumble" && memory.spell.slot === "E" && memory.numeric?.haste === 50 }];
  return [];
}

export function evaluate(records: Result[]) {
  const rows = records.map(record => {
    const content = checksFor(record.id, record.turn).map(check => ({ label: check.label, pass: check.test(record.text) }));
    const route = record.want.kind === "supported-or-abstain" ? content.every(c => c.pass) : matchesTarget(record.plan, record.want);
    return { id: record.id, turn: record.turn, question: record.question, route, content, memory: memoryChecks(record), seconds: record.seconds };
  });
  const group = (selected: typeof rows) => ({ pass: selected.filter(r => r.route).length, total: selected.length });
  const content = rows.flatMap(r => r.content);
  const state = rows.flatMap(r => r.memory);
  const times = records.map(r => r.seconds).sort((a, b) => a - b);
  return {
    route: group(rows), single: group(rows.filter(r => r.id.startsWith("s"))),
    followup: group(rows.filter(r => r.id.startsWith("d") && r.turn > 0)),
    holdout: group(rows.filter(r => ["d08", "d09", "d10"].includes(r.id))),
    content: { pass: content.filter(c => c.pass).length, total: content.length },
    memory: { pass: state.filter(c => c.pass).length, total: state.length },
    latency: { median: times[Math.floor(times.length / 2)], p95: times[Math.ceil(times.length * .95) - 1], max: times[times.length - 1] },
    calls: { total: records.flatMap(r => r.calls).length, cached: records.flatMap(r => r.calls).filter(c => c.cached).length, fallback: records.flatMap(r => r.calls).filter(c => c.fallback).length },
    rows,
  };
}

function main() {
  const directory = "research/llm-evals/conversational-advisor";
  const files = process.argv.slice(2);
  const reports = Object.fromEntries(files.map(name => {
    const input = JSON.parse(readFileSync(`${directory}/${name}.json`, "utf8")) as { results: Result[] };
    return [name, evaluate(input.results)];
  }));
  writeFileSync(`${directory}/scores.json`, JSON.stringify(reports, null, 2) + "\n");
  for (const [name, { rows: _rows, ...summary }] of Object.entries(reports)) console.log(name, JSON.stringify(summary));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
