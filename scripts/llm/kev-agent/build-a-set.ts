/**
 * A(대화 상태) 시험 세트 — 있는 문항만 이어 붙인다. 새 문장은 쓰지 않는다.
 *
 *   첫 턴   route-large 의 상성 문항(세 언어 74)
 *   이어 묻기 F  topicCases 의 손으로 쓴 문항에서 챔피언 이름(과 붙은 조사·전치사)만 지운 것.
 *              정답: 앞 턴의 두 챔피언 그대로 + 그 문항의 주제
 *   새 질문 R    route-large 의 다른 문항 그대로. 정답: 그 문항의 갈래·챔피언(상태를 갈아 끼움)
 *   바꿔 묻기 P  topicCases 의 "상대" 관점 문항을 이름째로. 정답: 내 챔피언은 그대로, 상대만 바뀜.
 *              정답이 해석에 기대므로 따로 센다.
 *
 * 사용: npx tsx scripts/llm/kev-agent/build-a-set.ts > research/llm-evals/kev-agent/a-set.jsonl
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { TOPIC_TEST, type TopicCase } from "../lib/topicCases";
import { strip } from "./strip";

const ROOT = path.resolve(import.meta.dirname, "../../..");
interface RouteCase { lang: string; question: string; kind: string; champions: string[]; mine?: string }
const route = (JSON.parse(fs.readFileSync(path.join(ROOT, "research/llm-evals/kev-agent/route-large.json"), "utf8")) as { cases: RouteCase[] }).cases;

/** 결정적 섞기(시드 고정) */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * 이름을 지우면 주어가 빠져 문장이 깨지는 것들. 고쳐 쓰지 않고 뺀다(새 문장을 만들지 않는다).
 * "어떤 챔피언이야" 는 상성 뒤에 오면 누구를 묻는지 정답이 없다.
 */
const BROKEN = new Set([
  "Is Wukong good late game?",
  "When does Nasus get strong?",
  "Where should Lux stand in fights?",
  "Tell me about Wukong",
  "How do I deal with Ahri in teamfights?",
  "Garen keeps bullying me early in lane",
  "What's Yasuo's combo?",
  "오공 어떤 챔피언이야",
  "齐天大圣是什么样的英雄",
]);

const out: unknown[] = [];
const langs = ["ko_KR", "en_US", "zh_CN"] as const;
let dialog = 0;
for (const lang of langs) {
  const firsts = route.filter((c) => c.lang === lang && c.kind === "matchup");
  // 스킬 갈래는 "W 어떻게 빼" 처럼 누구의 W 인지가 이름에 달려 있어 이어 묻기로 쓰지 않는다.
  const follows = shuffled(TOPIC_TEST.filter((c) => c.lang === lang && c.topic !== "skill" && !BROKEN.has(c.question)), 7)
    .map((c) => ({ c, text: strip(c) }))
    .filter((x): x is { c: TopicCase; text: string } => !!x.text);
  const fresh = shuffled(route.filter((c) => c.lang === lang && c.kind !== "matchup"), 11);
  const swaps = TOPIC_TEST.filter((c) => c.lang === lang && c.perspective === "against" && c.champions.length === 1 && c.topic !== "skill");
  firsts.forEach((first, i) => {
    const [mine, enemy] = first.mine === first.champions[0] ? first.champions : [first.champions[1], first.champions[0]];
    const f1 = follows[i % follows.length];
    const f2 = follows[(i + 5) % follows.length];
    const turns: unknown[] = [
      { type: "T1", text: first.question, gold: { kind: "matchup", champions: first.champions, mine, enemy } },
      { type: "F", text: f1.text, source: f1.c.question, gold: { kind: "matchup", champions: first.champions, mine, enemy, topic: f1.c.topic } },
    ];
    if (i % 2 === 0) {
      turns.push({ type: "F", text: f2.text, source: f2.c.question, gold: { kind: "matchup", champions: first.champions, mine, enemy, topic: f2.c.topic } });
    } else {
      const r = fresh[Math.floor(i / 2) % fresh.length];
      turns.push({ type: "R", text: r.question, gold: { kind: r.kind, champions: r.champions } });
    }
    out.push({ id: `d${String(dialog++).padStart(3, "0")}`, lang, turns });
    const swap = swaps[i % swaps.length];
    if (i < swaps.length && swap.champions[0] !== mine && swap.champions[0] !== enemy) {
      out.push({
        id: `p${String(dialog++).padStart(3, "0")}`,
        lang,
        turns: [
          { type: "T1", text: first.question, gold: { kind: "matchup", champions: first.champions, mine, enemy } },
          { type: "P", text: swap.question, gold: { kind: "matchup", champions: [mine, swap.champions[0]], mine, enemy: swap.champions[0], topic: swap.topic } },
        ],
      });
    }
  });
}
for (const d of out) console.log(JSON.stringify(d));
