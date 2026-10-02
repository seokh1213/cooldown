/** 커뮤니티 표현을 변형한 질문을 실제 앱 흐름으로 실행한다. 정답은 사람이 정한 요청 범위다. */
import fs from "node:fs";
import { loadData, offlineFileJudge } from "./kev-agent/lib";
import { answerDialogue } from "../../src/lib/advisor/dialogueFlow";
import { answerChampionIds } from "../../src/lib/advisor/answer";
import { dehydrateTurn, reviveTurn } from "../../src/lib/advisor/history";
import { translations } from "../../src/i18n/translations";
import type { PlanContext } from "../../src/lib/advisor/planTypes";

interface Expected { q: string; pairs?: string[][]; targets?: string[]; stat?: string; kind?: string; guide?: string; contains?: string[] }
interface Case { id: string; split: string; source?: string; turns: Expected[] }
const cases = JSON.parse(fs.readFileSync("research/llm-evals/request-contract/questions.json", "utf8")) as Case[];
const data = loadData("ko_KR");
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => typeof input === "string" && input.startsWith("/data/")
  ? Promise.resolve(new Response(fs.readFileSync(`public${input}`))) : originalFetch(input, init);
const rows: object[] = [];
for (const judge of ["none", "offline"] as const) {
  const deps = { judge: offlineFileJudge(), search: async () => [] };
  for (const item of cases) {
    const ctx: PlanContext = { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [], judge,
      consented: false, canUseModel: false, retrieval: false };
    for (const [index, expected] of item.turns.entries()) {
      const { dialogue, reply } = await answerDialogue(expected.q, ctx, deps);
      const pairs = dialogue.parts.flatMap(p => p.plan.type === "matchup" ? [[p.plan.mine.id, p.plan.enemy.id]] : []);
      const targets = reply.answer ? answerChampionIds(reply.answer) : [];
      const stat = reply.answer && "statQuery" in reply.answer ? reply.answer.statQuery?.field : undefined;
      const guide = !pairs.length && !targets.length && /예:|example|예시|예를|Try|例如/.test(reply.text)
        && /줄|범위|확인|못|어느|누구|챔피언|어려/.test(reply.text);
      const pass = Boolean(reply.text) && (!expected.pairs || JSON.stringify(pairs) === JSON.stringify(expected.pairs))
        && (!expected.targets || JSON.stringify(targets) === JSON.stringify(expected.targets))
        && (!expected.stat || stat === expected.stat) && (!expected.kind || reply.answer?.kind === expected.kind)
        && (!expected.guide || guide && reply.text.length > 35) && (!expected.contains || expected.contains.every(text => reply.text.includes(text)));
      rows.push({ id: item.id, split: item.split, turn: index + 1, judge, expected, pass, pairs, targets, stat,
        plans: dialogue.parts.map(p => p.plan.type), answer: reply.text });
      const turns = [...ctx.turns, { id: index * 2, role: "user" as const, content: expected.q },
        { id: index * 2 + 1, role: "assistant" as const, content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory }];
      ctx.turns = turns.flatMap(t => {
        const restored = reviveTurn(dehydrateTurn(t as Parameters<typeof dehydrateTurn>[0]), data);
        return restored ? [restored] : [];
      });
    }
  }
}
const output = process.argv[2] ?? "research/llm-evals/request-contract/current.json";
fs.writeFileSync(output, JSON.stringify({ base: "964065cb4", cases: cases.length, rows }, null, 2) + "\n");
for (const judge of ["none", "offline"]) {
  const selected = rows as Array<{ judge: string; pass: boolean; id: string; turn: number; split: string }>;
  const subset = selected.filter(r => r.judge === judge);
  console.log(`${judge}: ${subset.filter(r => r.pass).length}/${subset.length}`);
  console.log(subset.filter(r => !r.pass).map(r => `${r.id}:${r.turn}`).join(", "));
}
