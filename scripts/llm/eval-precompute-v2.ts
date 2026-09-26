/**
 * 미리 쓴 답 v2 측정 — 배포 은행(Codex) · Claude v1 · Claude v2 를 같은 문항에서 견준다
 *
 *   rows    measure40 40문항(규칙을 만들 때 본 문항) + 새 무작위 40문항(홀드아웃, 같은 포지션 쌍 × 무작위 주제)
 *   dump    생성 에이전트에게 줄 프롬프트 파일(<dir>/<판>/<nn>.txt)
 *   ingest  에이전트가 쓴 JSON(<dir>/<판>/<nn>.json)을 코드 규칙(groundCommentary)으로 거르고 앱과 같게 보인다
 *
 * 사용:
 *   npx tsx scripts/llm/eval-precompute-v2.ts rows <measure40 rows.json> <out rows.json>
 *   npx tsx scripts/llm/eval-precompute-v2.ts dump <rows.json> <dir>
 *   npx tsx scripts/llm/eval-precompute-v2.ts ingest <rows.json> <dir>
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import { matchupAnswer } from "./lib/matchupEval";
import { material, prompt, SECTION_KEYS, stripNumericAsides, type PrecomputedPair, type PromptVersion } from "./precompute-matchups";
import { josa } from "./lib/text";
import type { AdvisorAnswer } from "../../src/lib/advisor/answer";
import type { AdvisorData } from "../../src/lib/advisor/context";
import { precomputedDigest, type PrecomputedFile } from "../../src/lib/advisor/precomputed";
import { groundCommentary } from "../../src/lib/advisor/grounding";

const DATA = path.resolve("public/data/26.19");
const read = <T>(f: string): T => JSON.parse(fs.readFileSync(f, "utf8")) as T;
const cards = read<{ cards: ChampionCard[] }>(path.join(DATA, "llm/champion-cards-ko_KR.json")).cards;
const byId = new Map(cards.map((c) => [c.id, c]));
const data = {
  cards,
  items: read<{ items: unknown[] }>(path.join(DATA, "items-normalized-ko_KR.json")).items,
  cardById: byId,
  playbooks: new Map(Object.entries(read<{ playbooks: Record<string, unknown> }>(path.join(DATA, "llm/advisor-knowledge.json")).playbooks)),
} as unknown as AdvisorData;

interface Row {
  id: string;
  q: string;
  focus: string;
  set: "measure40" | "holdout";
  material: string;
  bank?: string;
  v1?: string;
  v2?: string;
  dropped?: Record<string, number>;
}

const TEMPLATES: Record<string, (me: string, enemy: string) => string> = {
  general: (me, e) => `${josa(me, "로/으로")} ${e} 상대 팁 좀 줘`,
  "situational-item": (me, e) => `${josa(me, "로/으로")} ${e} 상대할 때 템 뭐 가?`,
  "escape-window": (me, e) => `${josa(me, "로/으로")} ${e} 상대할 때 언제 들어가?`,
  combo: (me, e) => `${josa(me, "로/으로")} ${e} 상대 콤보 어떻게 넣어?`,
  teamfight: (me, e) => `${josa(me, "로/으로")} ${e} 있는 한타 어떻게 해?`,
  laning: (me, e) => `${josa(me, "로/으로")} ${e} 라인전 어떻게 해?`,
  phase: (me, e) => `${josa(me, "로/으로")} ${e} 상대하면 후반 어때?`,
};
const FOCI = ["general", "general", "situational-item", "escape-window", "combo", "teamfight", "teamfight", "laning", "phase"];

function bankAnswer(a: string, b: string, focus: string): string | undefined {
  const file = path.join(DATA, "llm/matchups", `${a}.json`);
  if (!fs.existsSync(file)) return undefined;
  const pair = read<PrecomputedFile>(file).pairs[b];
  return pair ? precomputedDigest(pair, focus, [byId.get(a)!, byId.get(b)!]) : undefined;
}

function makeRows(measurePath: string, out: string) {
  const measure = read<Array<{ id: string; q: string; focus: string }>>(measurePath);
  const rows: Row[] = measure.map((r) => {
    const [a, b] = r.id.split(":");
    return { id: r.id, q: r.q, focus: r.focus, set: "measure40", material: material(byId.get(a)!, byId.get(b)!), bank: bankAnswer(a, b, r.focus) };
  });
  // 홀드아웃: 은행에 있는 같은 포지션 쌍 중 measure40 과 겹치지 않게 무작위 40
  let s = 20260927;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const positions = new Map(cards.map((c) => [c.id, new Set(c.wiki?.positions ?? [])]));
  const pool = cards.flatMap((a) => cards.filter((b) => b.id !== a.id && [...positions.get(a.id)!].some((p) => positions.get(b.id)!.has(p))).map((b) => [a.id, b.id]));
  const used = new Set(rows.map((r) => r.id));
  while (rows.length < measure.length + 40) {
    const [a, b] = pool[Math.floor(rand() * pool.length)];
    const focus = FOCI[Math.floor(rand() * FOCI.length)];
    const bank = bankAnswer(a, b, focus);
    if (used.has(`${a}:${b}`) || !bank) continue;
    used.add(`${a}:${b}`);
    rows.push({ id: `${a}:${b}`, q: TEMPLATES[focus](byId.get(a)!.name, byId.get(b)!.name), focus, set: "holdout", material: material(byId.get(a)!, byId.get(b)!), bank });
  }
  fs.writeFileSync(out, JSON.stringify(rows, null, 1));
  console.log(`${rows.length}문항 (measure40 ${measure.length}, 홀드아웃 ${rows.length - measure.length}) → ${out}; 은행 답 없음 ${rows.filter((r) => !r.bank).length}`);
}

function dump(rowsPath: string, dir: string) {
  const rows = read<Row[]>(rowsPath);
  for (const v of ["v1", "v2"] as PromptVersion[]) {
    fs.mkdirSync(path.join(dir, v), { recursive: true });
    rows.forEach((r, i) => {
      const [a, b] = r.id.split(":");
      fs.writeFileSync(path.join(dir, v, `${String(i).padStart(2, "0")}.txt`), prompt(byId.get(a)!, byId.get(b)!, v));
    });
  }
  console.log(`프롬프트 ${rows.length * 2}개 → ${dir}`);
}

function ingest(rowsPath: string, dir: string) {
  const rows = read<Row[]>(rowsPath);
  const arms = (process.env.ARMS ?? "v1,v2").split(",");
  for (const v of arms) {
    rows.forEach((r, i) => {
      const file = path.join(dir, v, `${String(i).padStart(2, "0")}.json`);
      if (!fs.existsSync(file)) return;
      const raw = fs.readFileSync(file, "utf8");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
      } catch {
        return console.log(`JSON 아님 ${v}/${i}`);
      }
      const [a, b] = r.id.split(":");
      const me = byId.get(a)!;
      const enemy = byId.get(b)!;
      const answer = matchupAnswer(data, me, enemy, "상성") as Extract<AdvisorAnswer, { kind: "compare" }>;
      const pair: PrecomputedPair = {};
      let dropped = 0;
      for (const key of SECTION_KEYS) {
        const raw0 = typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "";
        const value = process.env.STRIP === "1" ? stripNumericAsides(raw0) : raw0;
        if (!value) continue;
        const g = groundCommentary(value, answer, "ko_KR");
        dropped += g.dropped.length;
        if (g.text.trim()) pair[key] = g.text;
      }
      (r as unknown as Record<string, string>)[v] = precomputedDigest(pair, r.focus, [me, enemy]) ?? "(물은 칸이 비어 미리 쓴 답 없음)";
      (r.dropped ??= {})[v] = dropped;
    });
  }
  fs.writeFileSync(rowsPath, JSON.stringify(rows, null, 1));
  const sum = (v: string) => rows.reduce((n, r) => n + (r.dropped?.[v] ?? 0), 0);
  const empty = (v: string) => rows.filter((r) => (r as unknown as Record<string, string>)[v]?.startsWith("(물은")).length;
  console.log(`들임 — ${arms.map((v) => `${v}: 버린 문장 ${sum(v)} · 물은 칸 빔 ${empty(v)}`).join(" / ")}`);
}

const [mode, a, b] = process.argv.slice(2);
if (mode === "rows") makeRows(a, b);
else if (mode === "dump") dump(a, b);
else if (mode === "ingest") ingest(a, b);
