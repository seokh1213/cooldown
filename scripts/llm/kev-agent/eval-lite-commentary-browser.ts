/**
 * 0.8B 카드 해설(`writes: "card"`) 측정 — 앱의 워커(WebGPU)와 앱의 프롬프트·근거 검사를 그대로 쓴다.
 *
 * 해설이 붙는 카드(챔피언 소개·스킬 전체·효과를 묻는 스킬)마다 세 판을 만든다.
 *   prose   지금 0.8B 가 보이는 것. 코드가 카드 값과 노트로 조립한 글(`answerProse`)
 *   card    0.8B 해설 + 엄격 근거 검사(근거 없는 문장까지 지움) — 후보
 *   loose   0.8B 해설 + 보통 근거 검사(4B 와 같은 검사) — 참고
 *   full    4B 해설 + 보통 근거 검사 — `full: true` 일 때만(2.7GB)
 *
 * 개발 서버를 띄운 탭의 콘솔에서:
 *   const m = await import("/scripts/llm/kev-agent/eval-lite-commentary-browser.ts");
 *   await m.run();                 // 결과는 window.__liteCommentary
 */
import type { AdvisorAnswer } from "../../../src/lib/advisor/answer";
import { buildCommentaryPrompt, buildSpellAnswer } from "../../../src/lib/advisor/answer";
import { ADVISOR_MODEL, SWAPPABLE_FOR_TEST, type AdvisorModel } from "../../../src/lib/advisor/config";
import { championNotes, loadAdvisorData, type AdvisorData } from "../../../src/lib/advisor/context";
import { groundCommentary } from "../../../src/lib/advisor/grounding";
import { advisorSystemPrompt } from "../../../src/lib/advisor/persona";
import { answerProse } from "../../../src/lib/advisor/prose";
import type { AdvisorRequest, AdvisorResponse } from "../../../src/lib/advisor/protocol";
import { championCardToText } from "../lib/facts";

type Lang = "ko_KR" | "en_US" | "zh_CN";
type Case = { lang: Lang; q: string; id: string; view?: "skills"; slot?: string };

/** 앱이 해설을 붙이는 질문들. 챔피언은 역할·난이도가 고루 섞이게 골랐다. */
export const CASES: Case[] = [
  { lang: "ko_KR", q: "말파이트 어떤 챔피언이야?", id: "Malphite" },
  { lang: "ko_KR", q: "야스오 알려줘", id: "Yasuo" },
  { lang: "ko_KR", q: "아리 설명해줘", id: "Ahri" },
  { lang: "ko_KR", q: "럼블 어떻게 해?", id: "Rumble" },
  { lang: "ko_KR", q: "가렌 운영 어떻게 해", id: "Garen" },
  { lang: "ko_KR", q: "리 신 특징이 뭐야", id: "LeeSin" },
  { lang: "ko_KR", q: "징크스 알려줘", id: "Jinx" },
  { lang: "ko_KR", q: "쓰레쉬 어떤 챔피언이야", id: "Thresh" },
  { lang: "ko_KR", q: "오공 스킬 설명해줘", id: "MonkeyKing", view: "skills" },
  { lang: "ko_KR", q: "제드 스킬 알려줘", id: "Zed", view: "skills" },
  { lang: "ko_KR", q: "룰루 스킬 설명해줘", id: "Lulu", view: "skills" },
  { lang: "ko_KR", q: "다리우스 스킬 알려줘", id: "Darius", view: "skills" },
  { lang: "ko_KR", q: "말파이트 R 에어본이야?", id: "Malphite", slot: "R" },
  { lang: "ko_KR", q: "애쉬 W 둔화 있어?", id: "Ashe", slot: "W" },
  { lang: "ko_KR", q: "아무무 R 기절이야?", id: "Amumu", slot: "R" },
  { lang: "ko_KR", q: "모르가나 E 보호막 효과 뭐야", id: "Morgana", slot: "E" },
  { lang: "en_US", q: "Tell me about Malphite", id: "Malphite" },
  { lang: "en_US", q: "How do I play Yasuo?", id: "Yasuo" },
  { lang: "en_US", q: "Explain Ahri", id: "Ahri" },
  { lang: "en_US", q: "What are Zed's abilities?", id: "Zed", view: "skills" },
  { lang: "zh_CN", q: "介绍一下墨菲特", id: "Malphite" },
  { lang: "zh_CN", q: "亚索怎么玩", id: "Yasuo" },
  { lang: "zh_CN", q: "阿狸是什么英雄", id: "Ahri" },
  { lang: "zh_CN", q: "劫的技能是什么", id: "Zed", view: "skills" },
];

let worker: Worker | null = null;
let workerKey = "";
let nextId = 1;

function generate(model: AdvisorModel, system: string, user: string): Promise<{ text: string; seconds: number }> {
  const key = `${model.id}:${model.dtype}:${model.graph ?? ""}`;
  if (worker && workerKey !== key) {
    worker.terminate();
    worker = null;
  }
  workerKey = key;
  worker ??= new Worker(new URL("../../../src/workers/advisor.worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const onMessage = (event: MessageEvent<AdvisorResponse>) => {
      const m = event.data;
      if (m.type === "done" && m.id === id) {
        w.removeEventListener("message", onMessage);
        resolve({ text: m.text, seconds: m.seconds });
      } else if (m.type === "error" && (m.id === id || m.id === undefined)) {
        w.removeEventListener("message", onMessage);
        reject(new Error(m.message));
      }
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ type: "generate", id, model, system, messages: [{ role: "user", content: user }] } satisfies AdvisorRequest);
  });
}

function answerOf(data: AdvisorData, c: Case): AdvisorAnswer {
  const card = data.cardById.get(c.id);
  if (!card) throw new Error(`${c.id} 없음`);
  if (c.slot) return buildSpellAnswer(card, card.spells.find((s) => s.slot === c.slot)!, c.q, c.lang);
  return { kind: "champion", card, view: c.view, notes: championNotes(data, card, c.q) };
}

/** 채점자가 볼 자료. 어느 판이 무엇을 근거로 썼는지 빠짐없이 싣는다(카드 값 + 고른 노트). */
function materialOf(answer: AdvisorAnswer, prompt: string): string {
  const parts = [prompt];
  if (answer.kind === "champion") {
    parts.push(`[카드 전체]\n${championCardToText(answer.card, { includeSpellText: true, spellTextMax: 600 })}`);
    const notes = answer.notes;
    if (notes) parts.push(`[고른 노트]\n${[...notes.playing, ...notes.against].map((n) => `- ${n}`).join("\n")}`);
  }
  return parts.join("\n\n");
}

export async function run(options: { full?: boolean; only?: number } = {}) {
  const version = (await (await fetch("/data/version.json")).json()) as { patchVersion?: string; version?: string };
  const patch = version.patchVersion ?? version.version ?? "";
  const lite = SWAPPABLE_FOR_TEST.qwen35;
  const rows: Array<Record<string, unknown>> = [];
  const cases = options.only ? CASES.slice(0, options.only) : CASES;
  const prepared: Array<{ c: Case; answer: AdvisorAnswer; system: string; prompt: string }> = [];
  for (const c of cases) {
    const data = await loadAdvisorData(patch, c.lang);
    const answer = answerOf(data, c);
    const prompt = buildCommentaryPrompt(answer, patch, c.lang);
    if (!prompt) {
      console.log(`건너뜀(해설 없는 카드): ${c.q}`);
      continue;
    }
    prepared.push({ c, answer, system: `${advisorSystemPrompt(c.lang)}\n\n${prompt}`, prompt });
  }
  for (const [n, p] of prepared.entries()) {
    const raw = await generate(lite, p.system, p.c.q);
    const strict = groundCommentary(raw.text, p.answer, p.c.lang, true);
    const loose = groundCommentary(raw.text, p.answer, p.c.lang, false);
    rows.push({
      q: p.c.q,
      lang: p.c.lang,
      material: materialOf(p.answer, p.prompt),
      prose: answerProse(p.answer, p.c.lang),
      card: strict.text,
      loose: loose.text,
      raw: raw.text,
      dropped: strict.dropped,
      seconds: raw.seconds,
    });
    console.log(`${n + 1}/${prepared.length} ${p.c.q} ${raw.seconds.toFixed(1)}초 · 엄격 ${strict.text.length}자 · 보통 ${loose.text.length}자 · 원문 ${raw.text.length}자`);
  }
  if (options.full) {
    for (const [n, p] of prepared.entries()) {
      const raw = await generate(ADVISOR_MODEL, p.system, p.c.q);
      rows[n].full = groundCommentary(raw.text, p.answer, p.c.lang, false).text;
      rows[n].fullSeconds = raw.seconds;
      console.log(`4B ${n + 1}/${prepared.length} ${raw.seconds.toFixed(1)}초`);
    }
  }
  (window as unknown as { __liteCommentary: unknown }).__liteCommentary = { patch, rows };
  return { patch, rows };
}
