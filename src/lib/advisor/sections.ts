/**
 * 상성 해설을 칸으로 나눠 쓰게 한다 — 가벼운 모델 전용
 *
 * 0.8B 에게 상성 재료를 통째로 주고 "알아서 써라" 하면 두 가지가 망가진다.
 *
 *   길어질수록 고리에 빠진다. 한 번에 수백 토큰을 쓰는 동안 한 번만 삐끗해도
 *   같은 구절을 상한까지 되풀이한다.
 *   재료가 많을수록 짝을 틀린다. 두 챔피언의 스킬 열 개를 한꺼번에 읽다가 남의
 *   스킬을 내 것으로 쓴다.
 *
 * 그래서 **무엇을 쓸지는 코드가 정하고** 모델은 칸 하나씩만 채운다. 칸마다 그 칸에
 * 필요한 재료만 떼어 주고 두세 문장으로 좁힌다. 호출이 셋이라 기다림은 늘지만 한
 * 호출이 짧아 고리에 빠질 틈이 적다. 머리말은 코드가 붙이므로 모델이 틀을 어길 수도
 * 없다.
 *
 * 0.8B 열네 쌍을 브라우저에서 잰 값(`npm run llm:eval-matchup` 의 브라우저 판):
 *
 *                 화면 고리  슬롯 맞음  노트 베끼기  평균 길이  평균 시간
 *   한 번에 쓰기     0/14      100%        10%         615자     14.6초
 *   칸 나눠 쓰기     0/14      100%         5%         719자     21.7초
 *
 * 나아진 것은 베끼기와 형식이고, 내용은 여전히 부실하다. 칸마다 "네, …정리해
 * 드립니다" 로 시작하거나 두세 문장 지시를 어기고 목록을 쓴다. 자유 산문을 맡기는
 * 한 이 크기에서는 여기가 한계로 보인다.
 *
 * 4B 에는 쓰지 않는다. 한 번에 써도 멀쩡하고, 칸을 강제하면 글이 깎인다(한 번
 * 재료를 좁혔을 때 529자 답이 194자가 됐다).
 */
import type { ChampionCard } from "../../../scripts/llm/lib/facts";
import type { Language } from "@/i18n";
import { extremeStatsLine, type AdvisorAnswer } from "./answer";
import { promptWords, translateDamage, translateScaling, translateTag } from "./promptLocale";
import { josa } from "../../../scripts/llm/lib/text";

export interface SectionPlan {
  key: "edge" | "threat" | "fight";
  /** 코드가 붙이는 머리말. 모델은 본문만 쓴다. */
  heading: string;
  prompt: string;
  maxTokens: number;
}

/**
 * 칸 하나의 상한.
 *
 * 두세 문장이면 한국어로 150~250자, 토큰으로 120~180 이다. 넉넉히 두되 고리에 빠져도
 * 이 선에서 끝난다. 잘린 꼬리는 `joinSection` 이 문장 끝으로 물린다.
 */
const SECTION_TOKENS = 220;

interface SectionWords {
  headings: Record<SectionPlan["key"], string>;
  mine: string;
  theirs: string;
  notes: string;
  task: Record<SectionPlan["key"], (me: string, enemy: string) => string>;
  /**
   * 분량·형식 지시. 예시는 그 상성의 실제 스킬로 채운다 — 고정 예시("Q 화염방사기")를
   * 두면 럼블이 없는 상성에도 그 이름이 재료로 들어간다.
   */
  length: (example: string) => string;
}

const KO: SectionWords = {
  headings: { edge: "유리한 점", threat: "조심할 것", fight: "싸우는 법" },
  mine: "내 챔피언",
  theirs: "상대 챔피언",
  notes: "[노트 — 사람이 검증한 사실입니다. 판단의 근거로 삼되 옮겨 쓰지 마십시오]",
  task: {
    edge: (me, enemy) => `[할 일] ${josa(me, "이/가")} ${josa(enemy, "을/를")} 상대로 무엇으로 이기는지 쓰십시오. ${me}의 스킬과 ${enemy}의 약한 능력치를 짚으십시오.`,
    threat: (me, enemy) => `[할 일] ${josa(me, "이/가")} ${enemy}의 어느 스킬을 조심해야 하는지, 그 스킬이 왜 위험한지 쓰십시오.`,
    fight: (me, enemy) => `[할 일] ${josa(me, "이/가")} ${josa(enemy, "와/과")} 언제 싸우고 언제 물러나야 하는지 쓰십시오. 어느 스킬이 빠졌을 때 들어가는지를 짚으십시오.`,
  },
  length: (example) => `- 두세 문장만 쓰십시오. 머리말·목록·인사말 없이 본문만 쓰십시오. 스킬을 부를 때는 슬롯 문자와 이름을 함께 쓰십시오(예: ${example}).`,
};

const EN: SectionWords = {
  headings: { edge: "Where you win", threat: "What to watch", fight: "How to fight" },
  mine: "Your champion",
  theirs: "Opponent",
  notes: "[Notes — human-verified facts. Reason from them; do not copy them.]",
  task: {
    edge: (me, enemy) => `[Task] Explain what ${me} wins with against ${enemy}. Point to ${me}'s abilities and ${enemy}'s weak stats.`,
    threat: (me, enemy) => `[Task] Explain which of ${enemy}'s abilities ${me} must watch out for and why they are dangerous.`,
    fight: (me, enemy) => `[Task] Explain when ${me} should fight ${enemy} and when to back off. Say which ability being down opens the window.`,
  },
  length: (example) => `- Write two or three sentences only. No heading, list, or greeting. When naming an ability, give the slot letter and name (e.g. ${example}).`,
};

const ZH: SectionWords = {
  headings: { edge: "优势", threat: "注意", fight: "打法" },
  mine: "我方英雄",
  theirs: "对方英雄",
  notes: "[笔记——经人工核实的事实。以此为依据，但不要照抄。]",
  task: {
    edge: (me, enemy) => `[任务] 说明${me}对阵${enemy}时靠什么取胜。指出${me}的技能和${enemy}偏弱的属性。`,
    threat: (me, enemy) => `[任务] 说明${me}需要提防${enemy}的哪个技能，以及它为什么危险。`,
    fight: (me, enemy) => `[任务] 说明${me}何时与${enemy}交战、何时后撤。指出对方哪个技能进入冷却时可以进场。`,
  },
  length: (example) => `- 只写两三句话。不要标题、列表或客套话。提到技能时同时写出槽位字母和名称（例如 ${example}）。`,
};

function sectionWords(lang: Language): SectionWords {
  if (lang === "en_US") return EN;
  if (lang === "zh_CN") return ZH;
  return KO;
}

/** 챔피언 한 장의 재료. 스킬마다 임자를 붙인다 — 이유는 `buildCommentaryPrompt` 의 비교 쪽에 있다. */
function cardLines(card: ChampionCard, label: string, lang: Language, withSpells: boolean): string[] {
  const w = promptWords(lang);
  const tags = (list: string[]) => list.map((tag) => translateTag(tag, lang)).join(", ");
  const lines = [`- ${label}: ${card.name} · ${w.damageLine(translateDamage(card.damageProfile.primary, lang), translateScaling(card.scalingProfile.primary, lang))}`];
  const extremes = extremeStatsLine(card, lang);
  if (extremes) lines.push(`- ${card.name} ${extremes}`);
  if (withSpells) {
    for (const spell of card.spells) {
      lines.push(`- ${card.name} ${spell.slot} ${spell.name}${spell.effects.length ? `: ${tags(spell.effects)}` : ""}`);
    }
  }
  return lines;
}

/**
 * 상성 답을 칸 셋으로 나눈 재료. 상성 답이 아니면 undefined.
 *
 * 칸마다 주는 재료가 다르다.
 *   유리한 점   내 스킬 전부 + 두 챔피언의 능력치 + 나를 위한 노트
 *   조심할 것   상대 스킬 전부 + 두 챔피언의 능력치 + 상대에 관한 노트
 *   싸우는 법   두 챔피언의 스킬 + 노트 전부
 * 첫 두 칸에 남의 스킬을 아예 안 주는 것이 요지다. 없는 것은 헷갈릴 수 없다.
 */
export function matchupSections(answer: AdvisorAnswer, patch: string, lang: Language): SectionPlan[] | undefined {
  if (answer.kind !== "compare" || !answer.matchup) return undefined;
  const [me, enemy] = answer.cards;
  if (!me || !enemy) return undefined;
  const w = promptWords(lang);
  const s = sectionWords(lang);
  // 공통 규칙에서 분량 지시(첫 줄)만 뺀다. 분량은 칸마다 따로 정한다.
  const rules = w.rules.slice(1);
  const mineNotes = answer.notes?.mine ?? [];
  const enemyNotes = answer.notes?.enemy ?? [];

  const build = (key: SectionPlan["key"], material: string[], notes: string[]): SectionPlan => {
    const lines = [`[${w.patch}] ${patch}`, w.matchup(me.name, enemy.name), ...material];
    if (notes.length) {
      lines.push(s.notes);
      for (const note of notes) lines.push(`- ${note}`);
    }
    // 예시는 그 칸이 주로 다루는 쪽의 Q 로 든다
    const owner = key === "threat" ? enemy : me;
    const q = owner.spells.find((spell) => spell.slot === "Q") ?? owner.spells[0];
    lines.push("", s.task[key](me.name, enemy.name), s.length(q ? `${q.slot} ${q.name}` : "Q"), ...rules);
    return { key, heading: s.headings[key], prompt: lines.join("\n"), maxTokens: SECTION_TOKENS };
  };

  return [
    build("edge", [...cardLines(me, s.mine, lang, true), ...cardLines(enemy, s.theirs, lang, false)], mineNotes),
    build("threat", [...cardLines(me, s.mine, lang, false), ...cardLines(enemy, s.theirs, lang, true)], enemyNotes),
    build("fight", [...cardLines(me, s.mine, lang, true), ...cardLines(enemy, s.theirs, lang, true)], [...mineNotes, ...enemyNotes]),
  ];
}

/**
 * 칸 하나를 글에 잇는다. 머리말은 코드가 붙인다.
 *
 * 상한에 닿아 문장 중간에서 끊겼으면 마지막 문장 끝으로 물린다. 문장 끝이 하나도
 * 없으면 그대로 둔다 — 빈 칸보다는 덜 끝난 한 문장이 낫다.
 */
export function joinSection(part: Pick<SectionPlan, "heading">, body: string): string {
  let text = body.trim().replace(/^\*\*[^*\n]+\*\*\s*\n?/, "");
  if (!/[.!?。！？]$/.test(text)) {
    const ends = [...text.matchAll(/[.!?。！？](?=\s|$)/g)];
    const last = ends[ends.length - 1];
    if (last) text = text.slice(0, (last.index ?? 0) + 1);
  }
  return `**${part.heading}**\n${text.trim()}\n\n`;
}
