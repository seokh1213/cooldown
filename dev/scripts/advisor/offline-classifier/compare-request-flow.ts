/** 실험 헤드를 실제 대화 계획·답변·저장 복원에 주입한다. 배포 코드에는 연결하지 않는다. */
import fs from "node:fs/promises";
import path from "node:path";
import { env, pipeline } from "@huggingface/transformers";
import { createHash } from "node:crypto";
import { loadData, offlineFileJudge } from "../kev-agent/lib";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { dehydrateTurn, reviveTurn } from "../../../../src/features/advisor/storage/history";
import { normalizeMessage } from "../../../../src/features/advisor/model/offlineJudge";
import { confidentChoice, requestClassifier, type RequestIntent, type RequestScope } from "../../../../src/features/advisor/understanding/requestIntent";
import { statFields } from "../../../../src/features/advisor/understanding/statQuery";
import { translations } from "../../../../src/shared/i18n/translations";
import type { Language } from "../../../../src/shared/i18n";
import type { ResolvedQuestion } from "../../../../src/features/advisor/understanding/resolvedQuestion";
import type { PlanContext } from "../../../../src/features/advisor/contracts/planTypes";
import type { AdvisorAnswer } from "../../../../src/features/advisor/answers/answer";

const dir = "dev/research/llm-evals/request-classifier/comparison";
const read = async (file: string) => {
  const buffer = await fs.readFile(`public/${file}`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
};
const base = requestClassifier(read);
const challenge = JSON.parse(await fs.readFile("dev/scripts/advisor/offline-classifier/request-challenge.json", "utf8")) as Record<Language, Record<RequestScope, string[]>>;

interface SemanticHead {
  embedding: { model: string; prefix: string; revision?: string };
  labels: RequestScope[]; dimensions: number; biasOffset: number; weights: string; weightsSha256: string;
}

interface FlowRow {
  mode: string; lang: Language; scenario: string; question: string; expected: string; correct: boolean;
  answer?: AdvisorAnswer["kind"]; view?: string; matchup?: boolean; text: string; intent?: RequestIntent;
}

function probabilities(head: SemanticHead, weights: DataView, vector: number[]) {
  const scale = Math.hypot(...vector);
  if (vector.length !== head.dimensions || !Number.isFinite(scale) || scale === 0) throw new Error("Semantic vector mismatch");
  const logits = head.labels.map((_, index) => {
    let value = weights.getFloat32(head.biasOffset + index * 4, true);
    for (let dim = 0; dim < head.dimensions; dim++) value += weights.getFloat32((index * head.dimensions + dim) * 4, true) * vector[dim] / scale;
    return value;
  });
  const values = logits.map(value => Math.exp(value - Math.max(...logits)));
  const total = values.reduce((a, b) => a + b, 0);
  return values.map(value => value / total);
}

async function semanticClassifier(name: "arctic-head" | "e5-small-head") {
  const head = JSON.parse(await fs.readFile(`${dir}/${name}.json`, "utf8")) as SemanticHead;
  const binary = await fs.readFile(`${dir}/${head.weights}`);
  if (createHash("sha256").update(binary).digest("hex") !== head.weightsSha256) throw new Error("Semantic weights mismatch");
  const weights = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const cacheFile = name === "arctic-head" ? "arctic-v2.json" : "e5-small-q8.json";
  const cache = JSON.parse(await fs.readFile(`dev/research/.cache/request-comparison/${cacheFile}`, "utf8")) as { vectors: Record<string, number[]> };
  env.cacheDir = path.resolve("dev/research/.cache/request-comparison/transformers");
  const extractor = name === "e5-small-head" ? await pipeline("feature-extraction", head.embedding.model,
    { revision: head.embedding.revision, dtype: "q8", device: "cpu" }) : undefined;
  const classify = async (resolved: ResolvedQuestion) => {
    const names = resolved.mentions.map(mention => resolved.text.slice(mention.index, mention.index + mention.length));
    const normalized = normalizeMessage(resolved.text, names);
    let vector = cache.vectors[normalized];
    if (!vector) {
      if (extractor) vector = (await extractor(head.embedding.prefix + normalized, { pooling: "mean", normalize: true })).tolist()[0] as number[];
      else {
        const response = await fetch("http://127.0.0.1:11434/api/embed", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: head.embedding.model, input: head.embedding.prefix + normalized, truncate: false, keep_alive: "5m" }) });
        if (!response.ok) throw new Error(`Semantic embedding ${response.status}`);
        vector = ((await response.json()) as { embeddings: number[][] }).embeddings[0];
      }
      cache.vectors[normalized] = vector;
    }
    const choice = confidentChoice(head.labels, probabilities(head, weights, vector));
    return choice ? { scope: choice.label, confidence: choice.confidence, topic: (await base(resolved))?.topic } : undefined;
  };
  return { classify, dispose: () => extractor?.dispose() };
}

function scenarios(lang: Language) {
  const texts = challenge[lang];
  const { cardById } = loadData(lang);
  const name = cardById.get("MonkeyKing")!.name;
  const fiora = cardById.get("Fiora")!.name;
  const word = (scope: RequestScope, index: number, champion = name) => texts[scope][index].replaceAll("◇", champion);
  return [
    { id: "scope-switch", turns: [
      { question: word("overview", 0), expected: "overview" }, { question: word("statsAll", 0), expected: "statsAll" },
      { question: word("ability", 0), expected: "R" }, { question: word("skills", 2), expected: "skills" },
      { question: word("overview", 1), expected: "overview" },
    ] },
    { id: "spell-switch", turns: ["Q", "W", "E", "R"].map(slot => ({ expected: slot,
      question: lang === "ko_KR" ? `${name} ${slot} 스킬정보 알려줘` : lang === "en_US" ? `${name} ${slot} skill information please` : `${name}${slot}技能信息说下`,
    })) },
    { id: "advice", turns: [{ question: word("combo", 0), expected: "combo" }, { question: word("counterplay", 2, fiora), expected: "against" }] },
  ];
}

function matches(answer: AdvisorAnswer | undefined, expected: string) {
  if (expected === "overview" || expected === "skills") return answer?.kind === "champion" && answer.view === expected;
  if (expected === "statsAll") return answer?.kind === "compare" && answer.statQuery && statFields(answer.statQuery).length === 7;
  if (expected === "combo") return answer?.kind === "champion" && answer.notes?.topic === "combo";
  if (expected === "against") return answer?.kind === "champion" && answer.notes?.perspective === "against"
    || answer?.kind === "compare" && answer.matchup && answer.cards[1]?.id === "Fiora";
  return answer?.kind === "spell" && answer.spell.slot === expected;
}

const rows: FlowRow[] = [];
for (const mode of ["current", "arctic", "e5-small"] as const) {
  const semantic = mode === "current" ? undefined : await semanticClassifier(mode === "arctic" ? "arctic-head" : "e5-small-head");
  for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) for (const scenario of scenarios(lang)) {
    const ctx: PlanContext = { data: loadData(lang), lang, copy: translations[lang].advisor, turns: [],
      championIds: [], consented: false, canUseModel: false, retrieval: false, judge: "offline" };
    for (const { question, expected } of scenario.turns) {
      let intent: RequestIntent | undefined;
      const classifyRequest = async (resolved: ResolvedQuestion) => {
        intent = await (semantic?.classify ?? base)(resolved);
        return intent;
      };
      const { reply } = await answerDialogue(question, ctx, { judge: offlineFileJudge(), search: async () => [], classifyRequest });
      rows.push({ mode, lang, scenario: scenario.id, question, expected, correct: Boolean(matches(reply.answer, expected)),
        answer: reply.answer?.kind, view: reply.answer?.kind === "champion" ? reply.answer.view : undefined,
        matchup: reply.answer?.kind === "compare" ? reply.answer.matchup : undefined, text: reply.text, intent });
      const stored = dehydrateTurn({ id: ctx.turns.length + 1, role: "assistant", content: reply.text, answer: reply.answer, memory: reply.memory, byCode: true });
      ctx.turns = [...ctx.turns, { role: "user", content: question }, reviveTurn(JSON.parse(JSON.stringify(stored)), ctx.data!)!];
    }
  }
  await semantic?.dispose();
}
const summary = Object.fromEntries(["current", "arctic", "e5-small"].map(mode => {
  const selected = rows.filter(row => row.mode === mode);
  return [mode, { correct: selected.filter(row => row.correct).length, total: selected.length,
    perLanguage: Object.fromEntries(["ko_KR", "en_US", "zh_CN"].map(lang => [lang, { correct: selected.filter(row => row.lang === lang && row.correct).length, total: selected.filter(row => row.lang === lang).length }])) }];
}));
const sources = Object.fromEntries(await Promise.all(["dev/scripts/advisor/offline-classifier/compare-request-flow.ts",
  `${dir}/arctic-head.json`, `${dir}/e5-small-head.json`, "public/models/offline/request-v1.json"].map(async file =>
  [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")])));
await fs.writeFile(`${dir}/flows.json`, `${JSON.stringify({ summary, rows, sources,
  limits: "실제 앱 계획·답변·저장 복원 코드에 실험 분류기를 주입한 Node 시험. 요청 범위·선택 주제·상성 대상을 검사하며 답변 내용 전체의 품질 점수가 아님. 임베딩은 배포에 미적용." }, null, 2)}\n`);
console.log(JSON.stringify({ summary }, null, 2));
