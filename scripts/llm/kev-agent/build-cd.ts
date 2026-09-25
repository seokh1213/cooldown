/**
 * C·D — 답 품질 측정용 답 짓기. measure40 과 같은 40문항(무작위 쌍 × 무작위 갈래)을 26.19 재료로 다시 짓는다.
 *
 *   current  노트 조립(앱이 미리 쓴 답이 없을 때 내는 것, digest cue-all-general)
 *   pre      미리 쓴 상성 답(답 은행) — 비교 기준. 새로 쓰지 않는다
 *   C        kev 가 고르기: 칸마다 노트 순서를 kev-0.8B 가 질문에 비춰 다시 세운다. 조립 규칙은 그대로
 *   D        좁힌 생성 + kev 검증: 맨 앞 칸(물은 칸)의 문장을 0.8B 가 2~3문장 답으로 다시 쓴다(4개 뽑기).
 *            코드 대조(groundCommentary)로 근거 없는 문장을 걷고, kev 가 가장 나은 것을 고른다. 못 넘으면 조립 그대로
 *
 * 사용: npx tsx scripts/llm/kev-agent/build-cd.ts <measure rows.json> <out.json>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "../lib/facts";
import { matchupAnswer } from "../lib/matchupEval";
import { material } from "../precompute-matchups";
import type { AdvisorAnswer } from "../../../src/lib/advisor/answer";
import type { AdvisorData } from "../../../src/lib/advisor/context";
import { digestSections, matchupDigest, type DigestSection } from "../../../src/lib/advisor/prose";
import { precomputedDigest, type PrecomputedFile } from "../../../src/lib/advisor/precomputed";
import { groundCommentary, labelSlots } from "../../../src/lib/advisor/grounding";
import { repeatedSpan } from "../lib/matchupEval";
import { PATCH, ROOT, kev } from "./lib";

type Compare = Extract<AdvisorAnswer, { kind: "compare" }>;
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const DATA = path.join(ROOT, "public/data", PATCH);
const cards = read<{ cards: ChampionCard[] }>(path.join(DATA, "llm/champion-cards-ko_KR.json")).cards;
const data = {
  cards,
  items: read<{ items: unknown[] }>(path.join(DATA, "items-normalized-ko_KR.json")).items,
  cardById: new Map(cards.map((c) => [c.id, c])),
  playbooks: new Map(Object.entries(read<{ playbooks: Record<string, unknown> }>(path.join(DATA, "llm/advisor-knowledge.json")).playbooks)),
} as unknown as AdvisorData;

function build(me: ChampionCard, enemy: ChampionCard, q: string, focus: string): Compare {
  const answer = matchupAnswer(data, me, enemy, q) as Compare;
  answer.notes!.plan!.focus = focus;
  answer.notes!.plan!.question = q;
  return answer;
}

const render = (sections: DigestSection[], answer: Compare) =>
  sections
    .filter((s) => s.lines.length)
    .map((s) => `**${s.title}**\n${labelSlots(s.lines.join(" "), answer.cards)}`)
    .join("\n\n");

// ---- C: kev 가 칸 안의 노트 순서를 정한다 ---------------------------------------------

async function rerank(answer: Compare, q: string) {
  const plan = answer.notes!.plan!;
  const [me, enemy] = answer.cards;
  const state = `The user plays ${me.name} against ${enemy.name}.\nQuestion: ${q}`;
  for (const side of ["mine", "enemy"] as const) {
    const list = plan[side];
    const categories = [...new Set(list.map((e) => e.category))];
    const scored = new Map<(typeof list)[number], number>();
    for (const category of categories) {
      const group = list.filter((e) => e.category === category);
      if (group.length < 2) continue;
      const a = await kev(state, {
        pick: {
          type: "choice",
          instructions: side === "mine" ? `Which ${me.name} tip best answers the question?` : `Which tip for facing ${enemy.name} best answers the question?`,
          criteria: Object.fromEntries(group.map((e, i) => [`n${i + 1}`, e.text])),
        },
      });
      group.forEach((e, i) => scored.set(e, a.pick.probabilities?.[`n${i + 1}`] ?? 0));
    }
    // 같은 갈래 안에서만 순서를 바꾼다. 조립은 갈래로 거르므로 갈래 사이 순서는 뜻이 없다.
    const order = new Map(list.map((e, i) => [e, i]));
    plan[side] = [...list].sort((x, y) =>
      x.category === y.category ? (scored.get(y) ?? 0) - (scored.get(x) ?? 0) || order.get(x)! - order.get(y)! : order.get(x)! - order.get(y)!,
    );
  }
}

// ---- D: 좁힌 생성 + kev 검증 ---------------------------------------------------------

const OLLAMA = "http://127.0.0.1:11434";
async function generate(q: string, lines: string[], seed: number): Promise<string> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    body: JSON.stringify({
      model: "qwen3.5:0.8b",
      messages: [
        {
          role: "system",
          content:
            "당신은 리그 오브 레전드 코치입니다. 사용자의 질문에 '근거' 문장만 써서 답하십시오. 근거에 없는 사실·수치·스킬 이름은 쓰지 마십시오. 질문에 바로 답하는 문장으로 시작하고 합니다체 2~3문장으로 끝내십시오.",
        },
        { role: "user", content: `질문: ${q}\n근거:\n${lines.map((l) => `- ${l}`).join("\n")}` },
      ],
      stream: false,
      think: false,
      options: { temperature: 0.7, seed, num_predict: 220 },
    }),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => undefined);
  if (!res) return "";
  const body = (await res.json()) as { message?: { content?: string } };
  return (body.message?.content ?? "").trim();
}

async function narrowGenerate(answer: Compare, q: string) {
  const sections = digestSections(answer, "ko_KR");
  const lead = sections.find((s) => s.lines.length);
  if (!lead) return { text: render(sections, answer), used: false, candidates: [] as unknown[] };
  const candidates: Array<{ raw: string; kept: string; dropped: number; score: number }> = [];
  for (let seed = 1; seed <= 4; seed += 1) {
    const raw = await generate(q, lead.lines, seed);
    if (!raw || repeatedSpan(raw)) {
      candidates.push({ raw, kept: "", dropped: -1, score: 0 });
      continue;
    }
    const g = groundCommentary(raw, answer, "ko_KR");
    const kept = g.text.trim();
    if (!kept || g.dropped.length > 1) {
      candidates.push({ raw, kept, dropped: g.dropped.length, score: 0 });
      continue;
    }
    const a = await kev(`Question: ${q}\nNotes:\n${lead.lines.map((l) => `- ${l}`).join("\n")}\nAnswer: ${kept}`, {
      good: { type: "noul", instructions: "Does the answer directly answer the question, stay faithful to the notes, and read naturally without repeating itself?" },
    });
    candidates.push({ raw, kept, dropped: g.dropped.length, score: a.good.noul ?? 0 });
  }
  const best = [...candidates].sort((x, y) => y.score - x.score)[0];
  if (!best || best.score < 0.5) return { text: render(sections, answer), used: false, candidates };
  const replaced = sections.map((s) => (s === lead ? { ...s, lines: [best.kept] } : s));
  return { text: render(replaced, answer), used: true, candidates };
}

async function main() {
  const [src, out] = process.argv.slice(2);
  const rows = read<Array<{ id: string; q: string; focus: string }>>(src);
  // 이어 짓기: 이미 지은 문항은 건너뛴다
  const result: Array<{ id: string } & Record<string, unknown>> = fs.existsSync(out) ? read(out) : [];
  const done = new Set(result.map((r) => r.id));
  for (const row of rows) {
    if (done.has(row.id)) continue;
    const [a, b] = row.id.split(":");
    const me = data.cardById.get(a)!;
    const enemy = data.cardById.get(b)!;
    const current = matchupDigest(build(me, enemy, row.q, row.focus), "ko_KR");
    const pairFile = path.join(DATA, "llm/matchups", `${a}.json`);
    const pre = fs.existsSync(pairFile)
      ? precomputedDigest(read<PrecomputedFile>(pairFile).pairs[b] ?? {}, row.focus, [me, enemy])
      : undefined;
    const c = build(me, enemy, row.q, row.focus);
    await rerank(c, row.q);
    const C = matchupDigest(c, "ko_KR");
    const d = await narrowGenerate(build(me, enemy, row.q, row.focus), row.q);
    result.push({ ...row, material: material(me, enemy), current, pre, C, D: d.text, dUsed: d.used, dCandidates: d.candidates });
    fs.writeFileSync(out, JSON.stringify(result, null, 1));
    console.log(`${result.length}/${rows.length} ${row.id} D ${d.used ? "생성" : "조립 그대로"}`);
  }
  console.log(`\n${result.length} → ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) void main();
