/**
 * 상성 해설 측정의 공통부
 *
 * 생성만 바꿔 끼운다. Node 는 Ollama 로(`eval-matchup.ts`), 브라우저는 앱의 워커로
 * (`eval-matchup-browser.ts`) 돈다. 재료를 짓고 화면에 나갈 글을 만들고 채점하는
 * 일은 여기 하나로 둔다 — 재는 쪽이 둘로 갈리면 두 결과를 견줄 수 없다.
 *
 * 잴 것
 *   고리      원문에 같은 구간(24자)이 세 번 이상 나왔나. 차단 장치와 무관하게 원문을 본다.
 *   상한      생성이 토큰 상한까지 갔나. 반복을 못 끊었다는 뜻이다.
 *   차단      반복 차단이 끊었나.
 *   슬롯      화면에 나간 글에서 스킬 이름 앞에 P/Q/W/E/R 이 붙은 비율.
 *   틀 베끼기 재료의 고정 문구("1레벨 기준 전체 챔피언 중")를 옮겨 적은 횟수.
 */
import type { ChampionCard } from "./facts";
import { buildCompareAnswer, buildCommentaryPrompt, type AdvisorAnswer } from "../../../src/lib/advisor/answer";
import { matchupNotes, type AdvisorData } from "../../../src/lib/advisor/context";
import { groundCommentary } from "../../../src/lib/advisor/grounding";
import { advisorSystemPrompt } from "../../../src/lib/advisor/persona";
import { MAX_NEW_TOKENS } from "../../../src/lib/advisor/config";
import { createLoopGuard } from "../../../src/lib/advisor/loopGuard";

/** 첫 줄이 실제로 화면에서 무한 반복을 낸 질문이다. */
export const PAIRS: Array<[string, string, string]> = [
  ["MonkeyKing", "Rumble", "오공으로 럼블이 너무어려운데 팁이 없나?"],
  ["Yasuo", "Malphite", "야스오로 말파이트 상대 어떻게 해?"],
  ["Garen", "Darius", "가렌으로 다리우스 상대하는 법 알려줘"],
  ["Zed", "Lux", "제드로 럭스 상대 팁"],
  ["Ahri", "Zed", "아리로 제드 어떻게 이겨?"],
  ["Fiora", "Aatrox", "피오라로 아트록스 상대 어떻게 해?"],
  ["Malphite", "Rumble", "말파이트로 럼블 상대 팁 알려줘"],
  ["Teemo", "Nasus", "티모로 나서스 상대 어떻게 해?"],
  ["Darius", "Teemo", "다리우스로 티모 너무 힘든데 팁 좀"],
  ["Jax", "Fiora", "잭스로 피오라 상대법"],
  ["Vayne", "Caitlyn", "베인으로 케이틀린 상대 어떻게 해?"],
  ["Thresh", "Blitzcrank", "쓰레쉬로 블리츠크랭크 상대 팁"],
  ["LeeSin", "Graves", "리신으로 그레이브즈 상대 어떻게 해?"],
  ["Sett", "Mordekaiser", "세트로 모데카이저 상대하는 법"],
];

export interface Generated {
  text: string;
  tokens: number;
  seconds: number;
  /** 생성하는 쪽이 반복 차단으로 끊었다고 알려 온 경우 */
  looped?: boolean;
  /** 끊기 전 원문. 끊은 판단이 옳았는지 사람이 보려고 남긴다. */
  untrimmed?: string;
}

export type Generate = (system: string, user: string, maxTokens: number) => Promise<Generated>;

export type Mode = "single" | "sections";

export interface Row {
  question: string;
  mode: Mode;
  promptChars: number;
  raw: string;
  tokens: number;
  seconds: number;
  loopRaw?: string;
  cut: boolean;
  capped: boolean;
  shown: string;
  shownChars: number;
  dropped: number;
  named: number;
  slotted: number;
  wrongSlot: number;
  templateCopies: number;
  /** 화면에 나간 문장 수(머리말 제외) */
  sentences: number;
  /** 그중 노트를 거의 그대로 옮긴 문장 수. 근거 검사의 "note" 판정과 같은 문턱(0.7)이다. */
  noteCopies: number;
}

/** 원문에 같은 24자 구간이 세 번 이상 나왔나. 공백은 접어서 본다. */
export function repeatedSpan(text: string, width = 24): string | undefined {
  const flat = text.replace(/\s+/g, " ");
  const seen = new Map<string, number[]>();
  for (let i = 0; i + width <= flat.length; i += 1) {
    const span = flat.slice(i, i + width);
    const at = seen.get(span) ?? [];
    // 겹치는 위치는 한 번으로 친다
    if (at.length && i - at[at.length - 1] < width) continue;
    at.push(i);
    seen.set(span, at);
    if (at.length >= 3) return span;
  }
  return undefined;
}

/**
 * 화면에 나간 글에서 스킬 이름을 짚은 횟수, 그중 맞는 슬롯이 붙은 횟수, 틀린 슬롯이 붙은 횟수.
 *
 * 두 글자 이하 이름은 세지 않는다. 슬롯 붙이기가 일부러 건드리지 않는 길이다.
 */
export function slotCoverage(text: string, answer: AdvisorAnswer): { named: number; slotted: number; wrongSlot: number } {
  if (answer.kind !== "compare") return { named: 0, slotted: 0, wrongSlot: 0 };
  let named = 0;
  let slotted = 0;
  let wrongSlot = 0;
  for (const c of answer.cards) {
    for (const spell of c.spells) {
      if (spell.name.replace(/\s/g, "").length < 3) continue;
      const escaped = spell.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const match of text.matchAll(new RegExp(escaped, "g"))) {
        named += 1;
        const at = match.index ?? 0;
        const before = /(?<![A-Za-z])([A-Z])(?:\s*스킬\S?)?[\s'"‘“*(（]*$/.exec(text.slice(Math.max(0, at - 8), at));
        const after = /^\s*[(（]([A-Z])[)）]/.exec(text.slice(at + spell.name.length, at + spell.name.length + 5));
        const letter = before?.[1] ?? after?.[1];
        if (letter === spell.slot) slotted += 1;
        else if (letter) wrongSlot += 1;
      }
    }
  }
  return { named, slotted, wrongSlot };
}

const TEMPLATE = /1레벨 기준 전체 챔피언 중/g;

/** 근거 검사의 `overlap` 과 같은 셈. 문장 a 의 낱말 중 b 에도 있는 비율. */
function overlap(a: string, b: string): number {
  const words = a.split(/\s+/).filter((word) => word.length > 1);
  const other = new Set(b.split(/\s+/).filter((word) => word.length > 1));
  if (words.length === 0) return 0;
  return words.filter((word) => other.has(word)).length / words.length;
}

/** 화면 글의 문장과, 그중 노트를 베낀 문장. */
function noteCopying(text: string, answer: AdvisorAnswer): { sentences: number; noteCopies: number } {
  const notes =
    answer.kind === "compare"
      ? [...(answer.notes?.mine ?? []), ...(answer.notes?.enemy ?? [])].flatMap((note) => note.split(/(?<=[.!?])\s+/))
      : [];
  const sentences = text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((sentence) => sentence.replace(/\*\*/g, "").trim())
    .filter((sentence) => sentence.length > 10);
  return {
    sentences: sentences.length,
    noteCopies: sentences.filter((sentence) => notes.some((note) => overlap(sentence, note) >= 0.7)).length,
  };
}

/** 생성하는 쪽이 끊었는지 알려 주지 않으면 같은 장치에 글을 흘려 넣어 본다. */
function replayGuard(text: string): boolean {
  const guard = createLoopGuard();
  for (let i = 0; i < text.length; i += 2) if (guard.feed(text.slice(i, i + 2))) return true;
  return false;
}

export function matchupAnswer(data: AdvisorData, me: ChampionCard, enemy: ChampionCard, question: string): AdvisorAnswer {
  return buildCompareAnswer([me, enemy], question, undefined, {
    matchup: true,
    notes: matchupNotes(data, me, enemy, "ko_KR"),
    lang: "ko_KR",
  });
}

export async function runPair(
  generate: Generate,
  data: AdvisorData,
  me: ChampionCard,
  enemy: ChampionCard,
  question: string,
  patch: string,
  mode: Mode,
): Promise<Row> {
  const answer = matchupAnswer(data, me, enemy, question);
  const persona = advisorSystemPrompt("ko_KR");
  let raw = "";
  let shownRaw = "";
  let tokens = 0;
  let seconds = 0;
  let cut = false;
  let capped = false;
  let promptChars = 0;

  if (mode === "sections") {
    // 칸 나누기 모듈은 이 방식을 잴 때만 올린다
    const sections = await import("../../../src/lib/advisor/sections.ts");
    const plan = sections.matchupSections(answer, patch, "ko_KR");
    if (!plan) throw new Error("칸 재료 없음");
    for (const part of plan) {
      promptChars += part.prompt.length;
      const result = await generate(`${persona}\n\n${part.prompt}`, question, part.maxTokens);
      raw += `${result.untrimmed ?? result.text}\n`;
      tokens += result.tokens;
      seconds += result.seconds;
      if (result.looped ?? replayGuard(result.text)) cut = true;
      if (result.tokens >= part.maxTokens) capped = true;
      shownRaw += sections.joinSection(part, result.text);
    }
  } else {
    const prompt = buildCommentaryPrompt(answer, patch, "ko_KR");
    if (!prompt) throw new Error("재료 없음");
    promptChars = prompt.length;
    const result = await generate(`${persona}\n\n${prompt}`, question, MAX_NEW_TOKENS);
    raw = result.untrimmed ?? result.text;
    tokens = result.tokens;
    seconds = result.seconds;
    capped = result.tokens >= MAX_NEW_TOKENS;
    cut = result.looped ?? (!capped && replayGuard(raw));
    shownRaw = result.text;
  }

  const grounded = groundCommentary(shownRaw, answer, "ko_KR");
  const coverage = slotCoverage(grounded.text, answer);
  return {
    question,
    mode,
    promptChars,
    raw,
    tokens,
    seconds,
    loopRaw: repeatedSpan(raw),
    cut,
    capped,
    shown: grounded.text,
    shownChars: grounded.text.length,
    dropped: grounded.dropped.length,
    named: coverage.named,
    slotted: coverage.slotted,
    wrongSlot: coverage.wrongSlot,
    templateCopies: (grounded.text.match(TEMPLATE) ?? []).length,
    ...noteCopying(grounded.text, answer),
  };
}

export function formatRow(row: Row): string {
  const flags = [row.loopRaw ? `고리「${row.loopRaw}」` : "", row.cut ? "차단" : "", row.capped ? "상한" : ""]
    .filter(Boolean)
    .join(" · ");
  return (
    `■ ${row.question}  (${row.seconds.toFixed(1)}초 · ${row.tokens}토큰 · 화면 ${row.shownChars}자 · ` +
    `슬롯 ${row.slotted}/${row.named}${row.wrongSlot ? `(틀림 ${row.wrongSlot})` : ""} · 베낌 ${row.noteCopies}/${row.sentences} · 걷어냄 ${row.dropped}${row.templateCopies ? ` · 틀 ${row.templateCopies}` : ""})` +
    `${flags ? `  ⚠ ${flags}` : ""}\n  ${row.shown.replace(/\s+/g, " ").slice(0, 500)}\n`
  );
}

export function summarize(rows: Row[]): string {
  const sum = (pick: (row: Row) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const named = sum((r) => r.named);
  const slotted = sum((r) => r.slotted);
  const n = rows.length || 1;
  return [
    `원문 고리        ${rows.filter((r) => r.loopRaw).length}/${rows.length}`,
    `상한까지 감      ${rows.filter((r) => r.capped).length}/${rows.length}`,
    `차단이 끊음      ${rows.filter((r) => r.cut).length}/${rows.length}`,
    `화면 고리        ${rows.filter((r) => repeatedSpan(r.shown)).length}/${rows.length}`,
    `슬롯 맞게 붙음   ${slotted}/${named} (${named ? Math.round((slotted / named) * 100) : 0}%) · 틀리게 붙음 ${sum((r) => r.wrongSlot)}`,
    `틀 베끼기        ${sum((r) => r.templateCopies)}회`,
    `걷어낸 문장      ${sum((r) => r.dropped)}`,
    `노트 베끼기      ${sum((r) => r.noteCopies)}/${sum((r) => r.sentences)}문장 (${sum((r) => r.sentences) ? Math.round((sum((r) => r.noteCopies) / sum((r) => r.sentences)) * 100) : 0}%)`,
    `평균 화면 길이   ${Math.round(sum((r) => r.shownChars) / n)}자`,
    `평균 시간        ${(sum((r) => r.seconds) / n).toFixed(1)}초 · 평균 토큰 ${Math.round(sum((r) => r.tokens) / n)}`,
    `평균 프롬프트    ${Math.round(sum((r) => r.promptChars) / n)}자`,
  ].join("\n");
}
