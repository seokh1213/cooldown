/**
 * 해설(M3-A) 품질 측정
 *
 * 카드가 수치를 그리고 모델은 "왜 중요한가" 두세 문장만 쓴다. 잴 것은 둘이다.
 *   숫자를 안 썼나   수치는 카드에 있으니 해설이 숫자를 되풀이하면 지시를 어긴 것이고,
 *                   숫자를 지어내면 더 나쁘다. 해설에 숫자가 있는지 센다.
 *   재료 안에서 말했나  자료에 없는 아이템·룬·스킬 이름을 꺼냈는지 본다.
 *
 * 브라우저와 같은 프롬프트(`buildCommentaryPrompt`)를 쓰고 추론만 Ollama 로 돈다.
 * 사용: npm run llm:eval-commentary
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import { indexRules, type RuleNotes } from "./lib/rules";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import {
  buildCommentaryPrompt,
  buildRuleAnswer,
  buildSpellAnswer,
  type AdvisorAnswer,
} from "../../src/lib/advisor/answer";

const HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const MODEL = process.env.ADVISOR_EVAL_MODEL ?? "gemma4:e2b";

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;
const rules = indexRules(
  (JSON.parse(fs.readFileSync(path.join(llmDir, "advisor-knowledge.json"), "utf8")) as { rules?: RuleNotes[] }).rules ?? [],
);

/** 브라우저 페르소나의 핵심만. 전체 페르소나는 src/lib/advisor/persona.ts */
const SYSTEM = `당신은 이 앱에 들어 있는 리그 오브 레전드 지식 도우미입니다.
한국어 합니다체로, 짧고 단정하게 답합니다. 인사말은 붙이지 않습니다.
자료가 주어지면 그 안의 사실만 근거로 삼습니다.`;

async function ask(system: string, user: string): Promise<{ text: string; seconds: number }> {
  const started = Date.now();
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: 200 },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const json = (await res.json()) as { message?: { content?: string }; error?: string };
  if (json.error) throw new Error(json.error);
  return { text: (json.message?.content ?? "").trim(), seconds: (Date.now() - started) / 1000 };
}

const card = (id: string): ChampionCard => {
  const found = cards.find((c) => c.id === id);
  if (!found) throw new Error(`${id} 카드 없음`);
  return found;
};

const CASES: Array<{ question: string; answer: AdvisorAnswer; mustMention?: RegExp }> = [
  {
    question: "럼블 설명해줘",
    answer: { kind: "champion", card: card("Rumble") },
    mustMention: /마법 저항|마저/,
  },
  {
    question: "말파이트 설명해줘",
    answer: { kind: "champion", card: card("Malphite") },
    mustMention: /방어력|마법/,
  },
  {
    question: "럼블 E 마저 몇 깎여?",
    answer: buildSpellAnswer(card("Rumble"), card("Rumble").spells.find((s) => s.slot === "E")!, "럼블 E 마저 몇 깎여?"),
    mustMention: /마법 저항|둔화|두 번|두번/,
  },
];

// 규칙 답에는 해설 재료가 없어야 한다. 배지와 문장이 곧 답이다.
if (buildCommentaryPrompt(buildRuleAnswer(rules.get("점화")!, ["정복자", "점화"]), patch) !== undefined) {
  throw new Error("규칙 답에 해설 재료가 붙었다");
}

/** 숫자. 퍼센트·범위·소수 모두 잡는다. 슬롯 글자(Q/W/E/R)는 숫자가 아니라 세지 않는다. */
const NUMBER = /\d+(?:[./~-]\d+)*%?/g;

async function main(): Promise<void> {
  console.log(`모델 ${MODEL} · 패치 ${patch}\n`);
  let clean = 0;
  for (const testCase of CASES) {
    const prompt = buildCommentaryPrompt(testCase.answer, patch);
    if (!prompt) {
      console.log(`— ${testCase.question}: 해설 재료 없음`);
      continue;
    }
    const { text, seconds } = await ask(`${SYSTEM}\n\n${prompt}`, testCase.question);
    const numbers = text.match(NUMBER) ?? [];
    const onTopic = testCase.mustMention ? testCase.mustMention.test(text) : true;
    const ok = numbers.length === 0 && onTopic;
    if (ok) clean += 1;
    console.log(`${ok ? "✅" : "❌"} ${testCase.question}  (${seconds.toFixed(1)}초, ${text.length}자)`);
    console.log(`   ${text.replace(/\s+/g, " ").slice(0, 260)}`);
    if (numbers.length) console.log(`   ✖ 숫자 사용: ${numbers.join(", ")}`);
    if (!onTopic) console.log(`   ✖ 핵심 재료 미언급 (${testCase.mustMention})`);
    console.log();
  }
  console.log(`숫자 없이 재료 안에서 말한 해설 ${clean}/${CASES.length}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
