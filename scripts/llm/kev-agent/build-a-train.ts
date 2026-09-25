/**
 * A 의 "이어 묻기인가" 판정 헤드 학습 자료 — 있는 route-train(1,449)만 쓴다. 새 문장을 쓰지 않는다.
 *
 *   이어 묻기(followup)  route-train 의 상성·공략 문항에서 이름만 지운 것
 *   새 질문(new)         route-train 의 "그 밖" 문항 중 챔피언 이름이 없는 것(룬·오브젝트·잡담 …)
 * 앞 대화의 상성 쌍은 route-train 상성 문항의 쌍을 섞어 붙인다. 시험 세트(route-large·topicCases)와 문항이 겹치지 않는다.
 *
 * 사용: npx tsx scripts/llm/kev-agent/build-a-train.ts <route-train-v1v2.jsonl> <out-prefix>
 *   → <out-prefix>_train.jsonl · <out-prefix>_dev.jsonl (kev 요청 꼴, 질문마다 label)
 */
import * as fs from "node:fs";
import { idByName, strip } from "./strip";

export const FOLLOW_INSTRUCTIONS = "What is the new message?";
export const followCriteria = (mine: string, enemy: string) => ({
  followup: `A follow-up that asks more about playing ${mine} against ${enemy}`,
  new: "A new question about something else: an item, a game rule, a different champion or small talk",
});
export const followState = (mine: string, enemy: string, question: string) =>
  `Earlier in this chat the user asked how to play ${mine} against ${enemy}.\nNew message: ${question}`;

interface Row { state: string; lang?: string; questions: { kind: { label: string } } }

function langOf(text: string): string {
  if (/[가-힣]/.test(text)) return "ko_KR";
  if (/[一-鿿]/.test(text)) return "zh_CN";
  return "en_US";
}

function main() {
  const [src, prefix] = process.argv.slice(2);
  const rows = fs.readFileSync(src, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Row);
  const parsed = rows.map((r) => {
    const question = /Question: (.*)/.exec(r.state)?.[1] ?? "";
    const named = (/Champions named: (.*)/.exec(r.state)?.[1] ?? "").split(", ").filter(Boolean);
    return { lang: r.lang ?? langOf(question), question, named, kind: r.questions.kind.label };
  });
  const pairs = parsed.filter((p) => p.kind === "matchup" && p.named.length === 2);
  let seed = 3;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const out: Array<{ lang: string; state: string; questions: unknown }> = [];
  for (const p of parsed) {
    let text: string | undefined;
    let label: "followup" | "new";
    if ((p.kind === "matchup" || p.kind === "guide") && p.named.length) {
      const ids = p.named.map((n) => idByName.get(n));
      if (ids.some((id) => !id)) continue;
      text = strip({ lang: p.lang, question: p.question, champions: ids as string[] });
      label = "followup";
    } else if (p.kind === "other" && p.named.length === 0) {
      text = p.question;
      label = "new";
    } else continue;
    if (!text) continue;
    const sameLang = pairs.filter((q) => q.lang === p.lang && !q.named.some((n) => p.named.includes(n)));
    const ctx = sameLang[rand(sameLang.length)];
    const [mine, enemy] = rand(2) ? ctx.named : [ctx.named[1], ctx.named[0]];
    out.push({
      lang: p.lang,
      state: followState(mine, enemy, text),
      questions: { act: { type: "choice", instructions: FOLLOW_INSTRUCTIONS, criteria: followCriteria(mine, enemy), label } },
    });
  }
  const dev = out.filter((_, i) => i % 7 === 0);
  const train = out.filter((_, i) => i % 7 !== 0);
  fs.writeFileSync(`${prefix}_train.jsonl`, train.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.writeFileSync(`${prefix}_dev.jsonl`, dev.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const count = (rs: typeof out, l: string) => rs.filter((r) => (r.questions as { act: { label: string } }).act.label === l).length;
  console.log(`train ${train.length} (followup ${count(train, "followup")} · new ${count(train, "new")}) · dev ${dev.length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
