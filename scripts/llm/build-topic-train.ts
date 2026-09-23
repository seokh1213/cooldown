/**
 * 주제 판정 헤드 학습 자료를 짓는다
 *
 * 틀 문장에 이름을 끼워 넣는 합성이다(`build-route-train.ts` 와 같은 방식). 평가를 속이지
 * 않도록 시험 문항(`topicCases.ts`)에 나온 챔피언은 쓰지 않고, 시험 문장과 글자까지 같은
 * 문장은 버린다.
 *
 * 관점은 틀이 정한다. "X로 …" 는 내가 X, "X 상대로 …" 는 X 를 상대함, 이름만 있으면 모름.
 * 챔피언이 둘인 상성 문장은 주제만 묻는다.
 *
 * 사용: npx tsx scripts/llm/build-topic-train.ts --n 2000 --out research/llm-evals/kev/topic-train.jsonl
 *       npx tsx scripts/llm/build-topic-train.ts --test research/llm-evals/kev/topic-test.jsonl
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { HELD_TOPIC_CHAMPIONS, TOPIC_TEST, type TopicLang } from "./lib/topicCases";
import { judgeRouteState } from "../../src/lib/advisor/routeAsk";
import {
  PERSPECTIVE_CRITERIA,
  PERSPECTIVE_INSTRUCTIONS,
  TOPIC_CRITERIA,
  TOPIC_INSTRUCTIONS,
  TOPIC_LABELS,
  type TopicLabel,
} from "../../src/lib/advisor/topicJudge";
import type { NotePerspective } from "../../src/lib/advisor/noteSelect";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

let seed = 20260924;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];

/** 틀. {C} 는 챔피언, {T} 는 주제 말. 관점마다 다르다. */
const FRAMES: Record<TopicLang, Record<NotePerspective, string[]>> = {
  ko_KR: {
    playing: ["{C}로 {T}", "{C} 할 때 {T}", "내가 {C}인데 {T}", "{C}로는 {T}", "{C} 잡으면 {T}"],
    against: ["{C} 상대로 {T}", "{C}한테 {T}", "{C} 만나면 {T}", "상대가 {C}인데 {T}", "{C} 상대할 때 {T}"],
    both: ["{C} {T}", "{C}는 {T}", "{C} 얘기인데 {T}"],
  },
  en_US: {
    playing: ["How do I {T} as {C}?", "Playing {C}, how do I {T}?", "{C} main here, how do I {T}?", "As {C}, how should I {T}?"],
    against: ["How do I {T} against {C}?", "How to {T} vs {C}?", "Facing {C}, how do I {T}?", "The enemy is {C}, how do I {T}?"],
    both: ["{C} {N}", "{C}: {N}?", "Question about {C} {N}"],
  },
  zh_CN: {
    playing: ["我玩{C}{T}", "用{C}{T}", "我是{C}，{T}", "{C}玩家{T}"],
    against: ["对线{C}{T}", "打{C}{T}", "对面是{C}，{T}", "遇到{C}{T}"],
    both: ["{C}{N}", "{C}的{N}", "关于{C}，{N}"],
  },
};

/**
 * 주제 말. 한국어·중국어는 서술 하나로 두 쓰임을 다 한다. 영어는 동사구(T)와 명사구(N)를 따로 둔다.
 * 스킬은 관점에 따라 말이 다르다 — 내 스킬은 "쓰는 법", 상대 스킬은 "피하는 법".
 */
type Phrases = { T: string[]; N?: string[]; againstT?: string[] };
const PHRASES: Record<TopicLang, Record<TopicLabel, Phrases>> = {
  ko_KR: {
    combo: { T: ["콤보 어떻게 넣어", "스킬 순서 알려줘", "딜교 어떻게 해", "연계 순서 뭐야", "풀콤 어떻게 해"] },
    laning: { T: ["라인전 어떻게 해", "초반 라인 어떻게 서", "견제 어떻게 해", "cs 어떻게 먹어", "1렙 싸움 어때", "라인 어떻게 버텨"] },
    teamfight: { T: ["한타 때 뭐 해", "한타에서 어떻게 해", "교전 때 어디 서", "5대5 때 어떻게 해", "한타 포지션 알려줘"] },
    phase: { T: ["후반에 어때", "언제 강해져", "중반 운영 어떻게 해", "스케일 어때", "오브젝트 싸움 어떻게 해", "몇 렙이 강해"] },
    "situational-item": { T: ["아이템 뭐 가", "빌드 추천해줘", "뭐 사야 돼", "마법 저항력 올려야 해?", "방어력 사야 돼?", "룬 뭐 들어", "템트리 알려줘"] },
    "escape-window": { T: ["언제 들어가", "언제 물어야 해", "진입 타이밍 알려줘", "점멸 빠지면 들어가도 돼?", "도망 못 가게 하려면", "언제 킬각이야"] },
    skill: {
      T: ["Q 어떻게 써", "궁 어떻게 써", "패시브 어떻게 써", "E 쓰는 법", "W 언제 써", "R 활용법"],
      againstT: ["Q 피하는 법", "궁 어떻게 피해", "E 맞으면 어떻게 해", "W 어떻게 대처해", "R 어떻게 피해"],
    },
    general: { T: ["팁 좀", "어떻게 해", "알려줘", "공략 좀", "요령 있어?", "너무 어려워"] },
  },
  en_US: {
    combo: { T: ["combo", "trade", "sequence my abilities", "do the full combo"], N: ["combo", "ability order", "trading pattern", "full combo"] },
    laning: { T: ["lane", "survive the laning phase", "trade in lane", "farm under pressure", "win level 1"], N: ["laning tips", "early game lane", "laning phase"] },
    teamfight: { T: ["teamfight", "play teamfights", "position in fights", "play 5v5 fights"], N: ["teamfight role", "teamfighting", "positioning in fights"] },
    phase: { T: ["scale", "play the mid game", "play for objectives", "play the late game"], N: ["power spikes", "late game", "scaling", "mid game macro"] },
    "situational-item": { T: ["build", "itemize", "pick runes", "choose items"], N: ["build", "items", "runes", "which resist to buy", "item path"] },
    "escape-window": { T: ["engage", "know when to all-in", "catch them out", "time my engage"], N: ["engage timing", "when to go in", "kill window"] },
    skill: {
      T: ["use Q", "use my ult", "use E", "use W", "use the passive"],
      N: ["Q usage", "ultimate", "passive", "E usage"],
      againstT: ["dodge Q", "play around the ult", "avoid getting hit by E", "deal with W"],
    },
    general: { T: ["play", "win", "handle this"], N: ["tips", "guide", "overview", "advice"] },
  },
  zh_CN: {
    combo: { T: ["连招怎么打", "技能顺序是什么", "怎么换血", "全套连招怎么放"], N: ["连招", "技能顺序"] },
    laning: { T: ["怎么对线", "前期怎么打", "怎么补刀", "一级怎么打", "线上怎么压"], N: ["对线技巧", "前期对线"] },
    teamfight: { T: ["团战怎么打", "团战站哪", "团战该干什么", "五打五怎么打"], N: ["团战思路", "团战站位"] },
    phase: { T: ["后期怎么样", "什么时候强", "中期怎么运营", "怎么打资源"], N: ["强势期", "后期", "运营思路"] },
    "situational-item": { T: ["出什么装备", "怎么出装", "带什么符文", "要不要出魔抗", "要不要出护甲"], N: ["出装", "符文", "装备"] },
    "escape-window": { T: ["什么时候进场", "什么时候能开", "闪现没了能不能打", "什么时候切"], N: ["进场时机", "开团时机"] },
    skill: {
      T: ["Q怎么用", "大招怎么放", "被动怎么用", "E怎么用"],
      N: ["技能用法", "大招用法"],
      againstT: ["怎么躲Q", "怎么躲大招", "E怎么躲"],
    },
    general: { T: ["有什么技巧", "怎么玩", "怎么打"], N: ["攻略", "技巧", "玩法"] },
  },
};

/** 상성 틀. A 가 내 챔피언, B 가 상대. 주제만 묻는다. */
const MATCHUP: Record<TopicLang, string[]> = {
  ko_KR: ["{A}로 {B} 상대 {T}", "{A}인데 {B} 만나면 {T}", "{A} 대 {B} {T}"],
  en_US: ["{A} into {B}, how do I {T}?", "Playing {A} vs {B}, how do I {T}?"],
  zh_CN: ["我用{A}打{B}{T}", "{A}对线{B}{T}"],
};

const patch = resolvePatchVersion();
const names = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", "champion-names.json"), "utf8")) as { names: Record<string, string[]> }).names;
const LANG_INDEX: Record<TopicLang, number> = { ko_KR: 0, en_US: 1, zh_CN: 2 };
const pool = Object.keys(names).filter((id) => !HELD_TOPIC_CHAMPIONS.has(id));

function record(question: string, champs: string[], topic: TopicLabel, perspective?: NotePerspective) {
  const questions: Record<string, unknown> = {
    topic: { type: "choice", instructions: TOPIC_INSTRUCTIONS, criteria: TOPIC_CRITERIA, label: topic },
  };
  if (champs.length === 1 && perspective) {
    questions.perspective = { type: "choice", instructions: PERSPECTIVE_INSTRUCTIONS, criteria: PERSPECTIVE_CRITERIA, label: perspective };
  }
  return { state: judgeRouteState(question, champs), questions };
}

function synth(n: number) {
  const tests = new Set(TOPIC_TEST.map((c) => c.question));
  const out: string[] = [];
  const langs: TopicLang[] = ["ko_KR", "en_US", "zh_CN"];
  while (out.length < n) {
    const lang = pick(langs);
    const topic = pick(TOPIC_LABELS);
    const phrases = PHRASES[lang][topic];
    const name = (id: string) => names[id][LANG_INDEX[lang]];
    let question: string;
    let rec;
    if (rand() < 0.2) {
      const [a, b] = [pick(pool), pick(pool)];
      if (a === b) continue;
      question = pick(MATCHUP[lang]).replace("{A}", name(a)).replace("{B}", name(b)).replace("{T}", pick(phrases.T));
      rec = record(question, [name(a), name(b)], topic);
    } else {
      const perspective = pick<NotePerspective>(["playing", "against", "both"]);
      const frame = pick(FRAMES[lang][perspective]);
      const verb = perspective === "against" && phrases.againstT ? pick(phrases.againstT) : pick(phrases.T);
      const noun = pick(phrases.N ?? phrases.T);
      const id = pick(pool);
      question = frame.replace("{C}", name(id)).replace("{T}", verb).replace("{N}", noun);
      rec = record(question, [name(id)], topic, perspective);
    }
    if (tests.has(question)) continue;
    out.push(JSON.stringify(rec));
  }
  return out;
}

const testOut = arg("test");
if (testOut) {
  const lines = TOPIC_TEST.map((c) => {
    const champs = c.champions.map((id) => names[id][LANG_INDEX[c.lang]]);
    return JSON.stringify({ ...record(c.question, champs, c.topic, c.perspective), lang: c.lang });
  });
  fs.writeFileSync(testOut, `${lines.join("\n")}\n`);
  console.log(`시험 ${lines.length}건 → ${testOut}`);
} else {
  const n = Number(arg("n") ?? 2000);
  const out = arg("out") ?? "research/llm-evals/kev/topic-train.jsonl";
  const lines = synth(n);
  fs.writeFileSync(out, `${lines.join("\n")}\n`);
  console.log(`학습 ${lines.length}건 → ${out} (챔피언 ${pool.length}명, 시험 챔피언 ${HELD_TOPIC_CHAMPIONS.size}명 제외)`);
}
