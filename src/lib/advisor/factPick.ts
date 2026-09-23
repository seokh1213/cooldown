/**
 * 검증된 사실을 모델이 **고르게** 하는 상성 답 — 시험만 하고 **쓰지 않는다**
 *
 * 앱 어디서도 부르지 않는다. 맹검 1~5점(2026-09-24):
 *
 *                           일반 14   한 갈래 8
 *   조립 답(코드)             4.00      3.88
 *   4B 산문                   (3.64)    3.88
 *   4B 고르기 · 전문           3.79       —
 *   4B 고르기 · 첫 문장        3.43      2.62
 *   4B 고르기 · 순서 섞음      3.36      2.88
 *   kev 칸별 고르기            3.07      2.12
 *   0.8B 고르기               2.00      1.88
 *
 * 고르게 하니 지어내기는 사라졌지만 코드의 규칙보다 못 골랐다. 4B 는 칸의 뜻을 흐리게
 * 읽어 "조심할 것" 에 내 피해 문장을 넣고 "아이템" 에 패시브 설명을 넣었다. 한 갈래 질문에는
 * 딱 맞는 사실 하나를 골랐는데, 한 문장이라 얇았다. 순서를 섞어도 비슷해서 목록 위쪽을
 * 고르는 버릇은 주된 원인이 아니었다. kev 는 칸마다 같은 사실을 골랐고, 0.8B 는 세 칸에
 * 같은 번호(대개 1번)를 적었다. 첫 문장 대신 전문을 쓰면 오른다(3.43 → 3.79) — 얇음이
 * 약점이라는 뜻이다.
 *
 * XML 칸에 문장을 쓰게 했더니 형식은 지켰지만 사실을 지어냈다(4B 2.79점, 조립 4.00).
 * 반면 모델이 노트를 고르기만 했을 때가 가장 높았다(kev 가 셋을 고른 판 4.07).
 * 그래서 모델에게 번호가 붙은 사실 목록을 주고 칸마다 번호만 적게 한다.
 *
 *   <answer><watch><fact id="7"/></watch><build><fact id="2"/><fact id="4"/></build><fight>…</fight></answer>
 *
 * 문장은 코드가 사실 목록에서 그대로 옮긴다. 모델이 쓸 수 있는 것은 번호뿐이라 지어낼
 * 자리가 없다. 없는 번호는 버린다. 모델이 거의 못 골랐으면 노트 조립(`digestSections`)으로 간다.
 */
import type { Language } from "@/i18n";
import type { AdvisorAnswer } from "./answer";
import { labelSlots } from "./grounding";
import { digestSections, type DigestSection } from "./prose";
import { josa } from "../../../scripts/llm/lib/text";

type Compare = Extract<AdvisorAnswer, { kind: "compare" }>;
const KEYS: DigestSection["key"][] = ["watch", "build", "fight"];
/** 한 칸에 싣는 사실 수 상한. 조립 답과 같다. */
const PER_SECTION = 2;

const firstSentence = (text: string) => text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text;

export interface Fact {
  id: number;
  /** 사실 전문. 화면에는 첫 문장이나 전문을 쓴다. */
  text: string;
  /** 누구에 관한 사실인가 — 도출 문장은 둘 다에 걸친다 */
  side: "mine" | "enemy" | "both";
  /** 도출 문장의 종류나 노트의 갈래 */
  kind: string;
}

const KIND_LABEL: Record<string, string> = {
  offense: "내 피해",
  defense: "상대 피해·저항",
  pinned: "붙잡힘",
  scaling: "성장",
  combo: "콤보",
  skill: "스킬",
  laning: "라인전",
  teamfight: "한타",
  phase: "시간대",
  "situational-item": "아이템",
  "escape-window": "이동기 공백",
};

/**
 * 번호를 붙인 사실 목록. 도출 문장, 내 노트, 상대 노트 순이다.
 *
 * `shuffle` 을 주면 그 값으로 순서를 섞는다(같은 값이면 같은 순서). 모델이 목록 위쪽을
 * 고르는 버릇이 있는지 보려고 둔다.
 */
export function factPool(answer: Compare, shuffle?: number): Fact[] {
  const plan = answer.notes?.plan;
  if (!plan) return [];
  const facts: Fact[] = [];
  const push = (text: string, side: Fact["side"], kind: string) => {
    if (!facts.some((fact) => fact.text === text)) facts.push({ id: facts.length + 1, text, side, kind });
  };
  for (const claim of plan.claims) push(claim.text, "both", claim.kind);
  for (const entry of plan.mine) push(entry.text, "mine", entry.category);
  for (const entry of plan.enemy) push(entry.text, "enemy", entry.category);
  if (shuffle === undefined) return facts;
  let seed = shuffle >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const mixed = [...facts].sort(() => rand() - 0.5);
  return mixed.map((fact, index) => ({ ...fact, id: index + 1 }));
}

/** 한국어 상성 답만. */
export function buildFactPickPrompt(answer: AdvisorAnswer, lang: Language, shuffle?: number): string | undefined {
  if (lang !== "ko_KR" || answer.kind !== "compare" || !answer.matchup) return undefined;
  const [me, enemy] = answer.cards;
  const facts = factPool(answer as Compare, shuffle);
  if (!me || !enemy || facts.length < 3) return undefined;
  const who = (fact: Fact) => (fact.side === "mine" ? me.name : fact.side === "enemy" ? enemy.name : "상성");
  return [
    `[상성] 사용자는 ${josa(me.name, "로/으로")} ${josa(enemy.name, "을/를")} 상대합니다.`,
    "[사실] 사람이 검증한 문장들입니다. 번호로만 고릅니다.",
    ...facts.map((fact) => `${fact.id}. (${who(fact)} · ${KIND_LABEL[fact.kind] ?? fact.kind}) ${firstSentence(fact.text)}`),
    "",
    "[할 일] 사용자의 질문에 가장 도움이 되는 사실을 칸마다 한두 개 고르십시오.",
    `- watch: ${enemy.name}에게서 조심할 것`,
    `- build: ${josa(me.name, "이/가")} 무엇을 사고 어떤 저항을 올릴지`,
    `- fight: ${josa(me.name, "이/가")} 언제 어떻게 싸울지`,
    "- 질문이 한 가지(아이템·라인전·콤보 등)를 물으면 그 칸에 더 고르고 다른 칸은 비워도 됩니다.",
    "- 아래 XML 만 쓰십시오. 문장을 쓰지 말고 번호만 적습니다.",
    '<answer><watch><fact id="번호"/></watch><build><fact id="번호"/></build><fight><fact id="번호"/></fight></answer>',
  ].join("\n");
}

export interface PickRender {
  text: string;
  /** 모델이 고른 번호(칸마다). 없는 번호는 뺐다. */
  picked: Record<DigestSection["key"], number[]>;
  invalid: number;
  fallback: number;
  wellFormed: boolean;
}

/**
 * 모델이 고른 번호를 화면 글로 옮긴다.
 *
 * `full` 이면 사실 전문을, 아니면 첫 문장을 쓴다. 칸 순서는 모델이 적은 순서가 아니라
 * 조립 답과 같다(물은 주제를 따른다) — 칸 제목도 거기서 온다.
 */
export function renderFactPick(
  raw: string,
  answer: Compare,
  lang: Language = "ko_KR",
  full = false,
  shuffle?: number,
  options: { minFacts?: number } = {},
): PickRender {
  const facts = new Map(factPool(answer, shuffle).map((fact) => [fact.id, fact]));
  const sections = digestSections(answer, lang);
  const body = /<answer>([\s\S]*?)(?:<\/answer>|$)/.exec(raw)?.[1] ?? raw;
  const picked = { watch: [], build: [], fight: [] } as Record<DigestSection["key"], number[]>;
  let invalid = 0;
  let present = 0;
  const used = new Set<number>();
  for (const key of KEYS) {
    // 모델이 같은 칸을 여러 번 여는 일이 있다(<watch>…</watch><watch>…</watch>). 모두 모은다.
    const blocks = [...body.matchAll(new RegExp(`<${key}>([\\s\\S]*?)</${key}>`, "g"))].map((m) => m[1]);
    if (!blocks.length) continue;
    present += 1;
    const inner = blocks.join(" ");
    for (const m of inner.matchAll(/<fact\s+id\s*=\s*"?(\d+)"?\s*\/?>/g)) {
      const id = Number(m[1]);
      if (!facts.has(id) || used.has(id)) {
        invalid += 1;
        continue;
      }
      if (picked[key].length >= PER_SECTION) continue;
      picked[key].push(id);
      used.add(id);
    }
  }
  /*
   * 빈 칸을 어떻게 할지.
   *
   * 한 갈래만 물은 질문("아이템 뭐 사?")에는 칸을 비우라고 일렀다. 4B 는 실제로 그 칸에
   * 딱 맞는 사실 하나만 골랐다. 그러니 하나라도 골랐으면 그 선택을 따른다. 아무것도 못
   * 골랐을 때만(형식이 깨졌거나 번호가 다 틀렸을 때) 통째로 조립 답으로 간다.
   *
   * `minFacts` 를 주면 고른 것이 그보다 적을 때 고른 칸의 조립 문장으로 채운다. 한 문장
   * 답은 맞아도 얇기 때문이다.
   */
  const total = KEYS.reduce((sum, key) => sum + picked[key].length, 0);
  const fallbackAll = total === 0;
  const text = (id: number) => (full ? facts.get(id)!.text : firstSentence(facts.get(id)!.text));
  const lines = new Map<DigestSection["key"], string[]>(KEYS.map((key) => [key, picked[key].map(text)]));
  if (!fallbackAll && options.minFacts && total < options.minFacts) {
    const shown = new Set([...lines.values()].flat().map(firstSentence));
    let need = options.minFacts - total;
    // 고른 칸부터, 그다음 조립 답의 칸 순서대로
    const order = [...sections].sort((a, b) => Number(!picked[a.key].length) - Number(!picked[b.key].length));
    for (const section of order) {
      for (const line of section.lines) {
        if (need <= 0) break;
        if (shown.has(firstSentence(line))) continue;
        lines.get(section.key)!.push(line);
        shown.add(firstSentence(line));
        need -= 1;
      }
    }
  }
  let fallback = 0;
  const parts: string[] = [];
  for (const section of sections) {
    let body: string[];
    if (fallbackAll) {
      body = section.lines;
      fallback += 1;
    } else body = lines.get(section.key) ?? [];
    if (body.length) parts.push(`**${section.title}**\n${labelSlots(body.join(" "), answer.cards)}`);
  }
  return { text: parts.join("\n\n"), picked, invalid, fallback, wellFormed: present === KEYS.length };
}
