/** 실제 대화·저장 복원을 평가한다. 숫자와 요청 누락 검사는 지식 품질 점수와 구분한다. */
import fs from "node:fs";
import type { StatName } from "../../../../src/domain/knowledge/cards/contracts";
import type { AdvisorAnswer } from "../../../../src/features/advisor/answers/answer";
import { translateStat } from "../../../../src/features/advisor/answers/presentation/promptLocale";
import type { PlanContext } from "../../../../src/features/advisor/contracts/planTypes";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { dehydrateTurn,reviveTurn } from "../../../../src/features/advisor/storage/history";
import { translations } from "../../../../src/shared/i18n/translations";
import { loadData,offlineFileJudge } from "../kev-agent/lib";

interface Expected {
  q: string; stats?: Array<{ fields: StatName[]; targets: string[]; level: 1 | 6 | 11 | 18 }>;
  spells?: string[][]; pairs?: string[][]; conditions?: string[][]; parts?: number;
  contains?: string[]; avoid?: string[]; guidance?: boolean;
}
interface Story { id: string; area: string; turns: Expected[] }
const directory = "dev/research/llm-evals/dialogue-coverage";
const cases = JSON.parse(fs.readFileSync(process.argv[3] ?? `${directory}/questions.json`, "utf8")) as Story[];
const data = loadData("ko_KR");
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => typeof input === "string" && input.startsWith("/data/")
  ? Promise.resolve(new Response(fs.readFileSync(`public${input}`))) : originalFetch(input, init);

function statsCovered(expected: NonNullable<Expected["stats"]>, answers: AdvisorAnswer[], text: string): boolean {
  return expected.every(request => answers.some(answer => {
    if (!("statQuery" in answer) || !answer.statQuery) return false;
    const query = answer.statQuery as typeof answer.statQuery & { fields?: StatName[] };
    const fields = query.fields ?? [query.field];
    if (JSON.stringify(query.champions) !== JSON.stringify(request.targets) || query.level !== request.level
      || JSON.stringify(fields) !== JSON.stringify(request.fields)) return false;
    const headlines = answer.kind === "compare" ? answer.headlines ?? (answer.headline ? [answer.headline] : [])
      : answer.kind === "champion" && answer.headline ? [answer.headline] : [];
    return request.fields.every(field => headlines.some(fact => fact.label.includes(translateStat(field, "ko_KR"))
      && text.includes(fact.label) && text.includes(fact.value)) && request.targets.every(id => {
      const value = String(data.cardById.get(id)!.stats[field][`lv${request.level}`]);
      return text.includes(value) && (answer.kind !== "compare" || answer.rows.some(row => row.hit
        && row.label === (field === "healthRegen" ? `${translateStat(field, "ko_KR")} (5초당)` : translateStat(field, "ko_KR"))
        && row.values[request.targets.indexOf(id)] === value));
    }));
  }));
}

const rows = [];
for (const judge of ["none", "offline"] as const) {
  for (const story of cases) {
    const ctx: PlanContext = { data, lang: "ko_KR", copy: translations.ko_KR.advisor, turns: [], championIds: [], judge,
      consented: false, canUseModel: false, retrieval: false };
    for (const [index, expected] of story.turns.entries()) {
      const { dialogue, reply } = await answerDialogue(expected.q, ctx, { judge: offlineFileJudge(), search: async () => [] });
      const answers = reply.answers ?? (reply.answer ? [reply.answer] : []);
      const pairs = dialogue.parts.flatMap(p => p.matchup ? [[p.matchup.mine, p.matchup.enemy]] : []);
      const failures: string[] = [];
      if (expected.stats && !statsCovered(expected.stats, answers, reply.text)) failures.push("stats/facts");
      if (expected.pairs && JSON.stringify(pairs) !== JSON.stringify(expected.pairs)) failures.push("pairs");
      if (expected.parts && dialogue.parts.length !== expected.parts) failures.push("clauses");
      if (expected.spells?.some(([id, slot, focus]) => !answers.some(a => a.kind === "spell"
        && a.championId === id && a.spell.slot === slot && a.focus === focus && Boolean(a.headline)
        && reply.text.includes(a.headline!.value) && a.headline!.value.includes(focus === "range"
          ? String(Array.isArray(a.spell.range) ? a.spell.range.join("/") : a.spell.range)
          : a.spell.recharge ?? a.spell.cooldown ?? "missing")))) failures.push("spells/facts");
      if (expected.conditions?.some(([mine, enemy, owner, slot, status]) => !dialogue.parts.some(p => p.matchup?.mine === mine
        && p.matchup.enemy === enemy && p.matchup.conditions.some(c => c.owner === owner && c.slot === slot && c.status === status)))) failures.push("conditions");
      if (expected.contains?.some(text => !reply.text.includes(text))) failures.push("required text");
      if (expected.avoid?.some(text => reply.text.includes(text))) failures.push("forbidden advice/repetition");
      if (expected.guidance && !/예:/.test(reply.text)) failures.push("guidance");
      if (!reply.text.trim()) failures.push("empty");
      rows.push({ id: story.id, area: story.area, turn: index + 1, judge, expected, pass: !failures.length, failures,
        pairs, queries: answers.flatMap(a => "statQuery" in a && a.statQuery ? [a.statQuery] : []),
        spells: answers.flatMap(a => a.kind === "spell" ? [[a.championId, a.spell.slot, a.focus]] : []),
        conditions: dialogue.parts.flatMap(p => p.matchup ? [p.matchup] : []), text: reply.text });
      const turns = [...ctx.turns, { id: index * 2, role: "user" as const, content: expected.q },
        { id: index * 2 + 1, role: "assistant" as const, content: reply.text, answer: reply.answer, answers: reply.answers, memory: reply.memory }];
      ctx.turns = turns.flatMap(turn => {
        const restored = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn as Parameters<typeof dehydrateTurn>[0]))), data);
        return restored ? [restored] : [];
      });
    }
  }
}
fs.writeFileSync(process.argv[2] ?? `${directory}/after.json`, JSON.stringify({ baseline: process.argv[4] ?? "00f286fa6", cases: cases.length, rows }, null, 2) + "\n");
for (const judge of ["none", "offline"]) {
  const subset = rows.filter(r => r.judge === judge);
  console.log(`${judge}: ${subset.filter(r => r.pass).length}/${subset.length}`);
  console.log(subset.filter(r => !r.pass).map(r => `${r.id}:${r.turn} (${r.failures.join(", ")})`).join("\n"));
}
