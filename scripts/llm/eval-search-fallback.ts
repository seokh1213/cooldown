/**
 * 검색 폴백 품질 측정
 *
 * 개체가 안 잡힌 질문에 실제로 어떤 답이 나가는지 본다. 브라우저와 **같은 모듈**을 쓰고
 * 추론만 Ollama 로 돌린다(`gemma4:e2b` 는 브라우저에 올리는 것과 같은 가중치다).
 *
 * 재는 것은 두 가지다.
 *   닿았나  모델이 만든 검색어가 정답 문서를 상위 세 건 안에 물어 왔는가
 *   답했나  그 세 건을 주고 만든 답이 자료에 있는 말로 되어 있는가
 *
 * 사용: npm run llm:eval-search
 */
import * as fs from "fs";
import * as path from "path";
import {
  SEARCH_QUERY_SYSTEM,
  buildQueryPrompt,
  extractQuery,
  lexicalSearch,
  searchContext,
  type SearchDoc,
} from "../../src/lib/advisor/searchFallback";
import { indexRules, type RuleNotes } from "./lib/rules";
import type { MechanicsIndex } from "./lib/mechanics";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

const HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";
const MODEL = process.env.ADVISOR_EVAL_MODEL ?? "gemma4:e2b";
const MAX_ROUNDS = 2;

const patch = resolvePatchVersion();
const bundle = JSON.parse(
  fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", "advisor-knowledge.json"), "utf8"),
) as { rules?: RuleNotes[]; mechanics?: MechanicsIndex };

const ruleIndex = indexRules(bundle.rules ?? []);
const corpus: SearchDoc[] = [
  ...[...ruleIndex.values()].map((rule) => ({
    kind: "rule" as const,
    title: rule.name,
    text: (rule.notesKo?.length === rule.notes.length ? rule.notesKo! : rule.notes).join("\n"),
  })),
  ...(bundle.mechanics ?? []).map((section) => ({
    kind: "mechanics" as const,
    title: section.title,
    text: section.text,
  })),
];

const ANSWER_SYSTEM = `너는 리그 오브 레전드 질문에 답하는 도우미다. 한국어로 짧게 답한다.`;

async function ask(system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      options: { temperature: 0, num_predict: maxTokens },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const json = (await res.json()) as { message?: { content?: string }; error?: string };
  if (json.error) throw new Error(json.error);
  return (json.message?.content ?? "").trim();
}

/**
 * 답을 못 했다는 표시.
 *
 * 이걸 따로 봐야 한다. 처음에는 기대 낱말만 봤는데, 거절 문장이 질문의 낱말을 되풀이해서
 * ("포탑을 어떻게 밀어야 하는지에 대한 정보가 없습니다") 통과로 세어졌다.
 */
const REFUSAL = /없습니다|없어요|있지 않|알 수 없|확인할 수 없|찾을 수 없|명시되어/;

/**
 * 정답 문서 제목과, 답에 나와야 할 말.
 *
 * **답할 수 있는 질문으로만 잰다.** 처음에는 "cs 어떻게 늘려?", "와드 어디에 박아?" 로
 * 쟀는데 모델이 계속 거절했다. 자료를 뜯어 보니 모델이 옳았다. 위키 코퍼스는
 * 파밍이 **무엇인지**, 와드 시야가 **어떻게 도는지**를 담지, 어떻게 하면 잘하는지는
 * 담지 않는다. 없는 것을 지어내지 않은 것이므로 그 거절은 바른 동작이다.
 *
 * 그래서 재는 것은 "은어로 물어도 자료에 있는 사실에 닿는가" 하나다.
 * 전략 조언은 이 자료의 몫이 아니고, 그건 채워야 할 자료의 문제지 검색의 문제가 아니다.
 */
const CASES: Array<{ question: string; doc: string; expect: RegExp }> = [
  { question: "cs가 뭐야?", doc: "미니언", expect: /막타|파밍|미니언/ },
  { question: "막타가 뭔데?", doc: "미니언", expect: /막타|파밍|처치/ },
  { question: "와드 몇 개까지 박을 수 있어?", doc: "와드", expect: /한도|사라|설치/ },
  { question: "부쉬 안에 있으면 안 보여?", doc: "덤불", expect: /덤불|시야|보이/ },
  { question: "포탑 방패 깨면 뭐 줘?", doc: "포탑", expect: /125|골드/ },
  { question: "시야 점수는 뭐로 올라?", doc: "시야 점수", expect: /와드|시야|점/ },
];

async function main(): Promise<void> {
  console.log(`모델 ${MODEL}  문서 ${corpus.length}건  패치 ${patch}\n`);
  let reached = 0;
  let answered = 0;

  for (const testCase of CASES) {
    const tried: string[] = [];
    let hits = lexicalSearch(corpus, "");
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const raw = await ask(SEARCH_QUERY_SYSTEM, buildQueryPrompt(testCase.question, tried), 48);
      const query = extractQuery(raw);
      if (!query || tried.includes(query)) break;
      tried.push(query);
      hits = lexicalSearch(corpus, query);
      if (hits.length) break;
    }

    const titles = hits.map((hit) => hit.doc.title);
    const hit = titles.includes(testCase.doc);
    if (hit) reached += 1;

    const context = hits.length ? searchContext(hits, patch, tried[tried.length - 1] ?? "") : "";
    if (process.env.DUMP_CONTEXT) console.log(`--- 실린 자료 ${context.length}자 ---\n${context}\n---`);

    const answer = hits.length
      ? await ask(`${ANSWER_SYSTEM}\n\n${context}`, testCase.question, 220)
      : "(자료 없음)";
    const ok = !REFUSAL.test(answer) && testCase.expect.test(answer);
    if (ok) answered += 1;

    console.log(`${hit ? "✅" : "❌"} ${testCase.question}`);
    console.log(`   검색어 ${tried.map((q) => `"${q}"`).join(" → ")}`);
    console.log(`   찾음 ${titles.join(" / ") || "(없음)"}   기대 ${testCase.doc}`);
    console.log(`   ${ok ? "○" : "×"} ${answer.replace(/\s+/g, " ").slice(0, 180)}\n`);
  }

  console.log(`문서 도달 ${reached}/${CASES.length}   답변 적중 ${answered}/${CASES.length}`);

  // 견줄 것은 "예전에 이 자리에서 무엇이 나갔나" 다. 자료 없이 페르소나만 붙여 보냈다.
  // 자료를 붙여 거절하는 것이 자료 없이 지어내는 것보다 나은지 봐야 한다.
  if (process.env.COMPARE_BASELINE) {
    console.log("\n--- 자료 없이 보냈을 때 (예전 동작) ---\n");
    for (const testCase of CASES) {
      const answer = await ask(ANSWER_SYSTEM, testCase.question, 220);
      console.log(`${testCase.question}`);
      console.log(`   ${answer.replace(/\s+/g, " ").slice(0, 200)}\n`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
