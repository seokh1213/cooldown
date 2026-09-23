/**
 * 가벼운 모델용 상성 프롬프트 — 시험만 하고 **쓰지 않는다**
 *
 * 앱 어디서도 부르지 않는다. 0.8B 로 무엇까지 되는지 재 본 기록이고, 결론은 "자유
 * 글쓰기는 안 된다" 였다. 열네 쌍을 브라우저(q4, WebGPU)에서 잰 값:
 *
 *   판본                         프롬프트  화면 길이  나온 글
 *   원래 프롬프트                  2,138자    615자    스킬 목록 읊기, 임자 헷갈림
 *   int8 판본(938MB)              2,138자    520자    거의 같다. 양자화 탓이 아니었다
 *   아래 짧은 프롬프트 + 예시        1,090자    405자    예시를 무시하고 목록을 쓴다
 *   바꿔 쓰기(문장 넷만 주고 다듬기)    389자    385자    "Melted Flame", "Blitzkrieg" 를 지어낸다
 *
 * 같은 원래 프롬프트로 Qwen3.5 2B(q4, 1.5GB)는 처음으로 틀린 말 없이 썼지만 한 답에
 * 54초가 걸렸다. LFM2.5 1.2B(q4)는 맥에서 적재 중에 매달렸다.
 *
 * 4B 에 맞춰 다듬어 온 프롬프트는 0.8B 에게 무겁다. 재료가 2,100자, 규칙이 열 줄이다.
 * 0.8B 는 규칙을 지키는 대신 재료를 옮겨 적었다 — 스킬 목록을 읊고, 노트를 베끼고,
 * 틀 문구를 되풀이했다.
 *
 * 작은 모델은 지시보다 예시를 따른다. 그래서 셋을 바꾼다.
 *   재료를 줄인다   코드가 고른 핵심 사실 넷과 두 챔피언의 스킬만.
 *   규칙을 줄인다   네 줄.
 *   예시를 준다     잘 쓴 답 하나. 재는 열네 쌍과 겹치지 않는 상성(애니 · 카타리나)으로
 *                   골라, 내용을 옮겨 적어도 드러나게 했다.
 */
import type { Language } from "@/i18n";
import type { AdvisorAnswer } from "./answer";
import { extremeStatsLine } from "./answer";
import { translateDamage, translateTag } from "./promptLocale";
import { josa } from "../../../scripts/llm/lib/text";

const EXAMPLE_KO =
  "애니 P 방화광을 채워 둔 채로 있으면 카타리나가 E 순보로 들어오는 순간 애니 Q 붕괴로 바로 기절시킬 수 있습니다. " +
  "카타리나 R 죽음의 연꽃은 기절로 끊기므로, 기절은 카타리나가 R을 누를 때까지 아껴 둡니다. " +
  "애니는 체력이 매우 낮아 오래 버티지 못하니 애니 E 용암 방패를 먼저 두르고, 카타리나가 떨어뜨린 단검 근처에는 서지 않습니다.";

/**
 * 세 문장이면 한국어로 250자 안팎, 토큰으로 200 남짓이다. 두 배를 두어 끊기지는 않되
 * 고리에 빠져도 여기서 멈춘다.
 */
export const LITE_TOKENS = 400;

/** 핵심 사실은 이만큼만. 노트마다 첫 문장만 쓴다. */
const FACTS = 4;

const firstSentence = (text: string) => text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text;

/** 한국어 상성 답에만 짓는다. 다른 언어·다른 답은 undefined — 부르는 쪽이 원래 프롬프트를 쓴다. */
export function buildLiteMatchupPrompt(answer: AdvisorAnswer, lang: Language): string | undefined {
  if (lang !== "ko_KR" || answer.kind !== "compare" || !answer.matchup) return undefined;
  const [me, enemy] = answer.cards;
  if (!me || !enemy) return undefined;
  const tags = (list: string[]) => list.map((tag) => translateTag(tag, lang)).join(", ");

  const lines = [`[상성] 사용자는 ${josa(me.name, "로/으로")} ${josa(enemy.name, "을/를")} 상대합니다. ${me.name} 시점으로 조언합니다.`];
  lines.push("[스킬]");
  for (const card of [me, enemy]) {
    for (const spell of card.spells) {
      lines.push(`- ${card.name} ${spell.slot} ${spell.name}${spell.effects.length ? `: ${tags(spell.effects)}` : ""}`);
    }
  }
  lines.push("[특징]");
  for (const card of [me, enemy]) {
    const extremes = extremeStatsLine(card, lang);
    lines.push(`- ${card.name}: 주 피해 ${translateDamage(card.damageProfile.primary, lang)}${extremes ? ` · ${extremes}` : ""}`);
  }
  // 내 쪽 셋, 상대 쪽 하나. 상대 노트가 없으면 내 쪽으로 채운다. 내 쪽은 도출 문장이
  // 앞에 온다 — 이 조합을 직접 말하는 글이다(matchupNotes 가 이미 그 순서다).
  const mine = answer.notes?.mine ?? [];
  const theirs = (answer.notes?.enemy ?? []).slice(0, 1);
  const notes = [...mine.slice(0, FACTS - theirs.length), ...theirs].map(firstSentence);
  if (notes.length) {
    lines.push("[핵심 사실 — 검증된 내용입니다]");
    for (const note of notes) lines.push(`- ${note}`);
  }
  lines.push(
    "",
    "[좋은 답의 예 — 다른 상성(애니로 카타리나 상대)입니다. 형식만 따르고 내용은 옮기지 마십시오]",
    EXAMPLE_KO,
    "",
    `[할 일] 위 자료를 근거로 ${josa(me.name, "이/가")} ${josa(enemy.name, "을/를")} 상대하는 요령을 세 문장으로 쓰십시오.`,
    `- 스킬은 "${me.name} ${me.spells[1]?.slot ?? "Q"} ${me.spells[1]?.name ?? ""}"처럼 챔피언·슬롯·이름을 함께 씁니다.`,
    "- 스킬 목록을 다시 적지 말고, 언제 무엇을 쓰고 무엇을 피할지를 씁니다.",
    "- 수치·목록·머리말·인사말 없이 합니다체 본문만 씁니다.",
    "- 자료에 없는 스킬·아이템 이름을 만들지 않습니다.",
  );
  return lines.join("\n");
}

/**
 * 바꿔 쓰기 판본. 0.8B 에게 **생각은 시키지 않고 말만 다듬게** 한다.
 *
 * 위 판본을 재 보니 0.8B 는 예시를 무시하고 스킬 목록을 한 줄씩 읊었다. 쓸 만했던
 * 문장은 어느 모델·판본에서나 검증 노트를 거의 옮긴 것이었다. 그래서 코드가 조언이
 * 될 문장을 고르고, 모델은 그것을 사용자에게 하는 말로 이어 붙이기만 한다. 작은
 * 모델은 짓기보다 바꿔 쓰기를 훨씬 잘한다.
 *
 * 고르는 순서: 도출 문장 하나(이 조합을 직접 말한다), 내 쪽 운용 노트 둘, 상대 쪽
 * 노트 하나. 노트마다 첫 문장만 쓴다.
 */
export function buildRewriteMatchupPrompt(answer: AdvisorAnswer, lang: Language): string | undefined {
  if (lang !== "ko_KR" || answer.kind !== "compare" || !answer.matchup) return undefined;
  const [me, enemy] = answer.cards;
  if (!me || !enemy) return undefined;
  const mine = answer.notes?.mine ?? [];
  const theirs = answer.notes?.enemy ?? [];
  const picked = [...new Set([mine[0], ...mine.slice(-2), theirs[0]].filter((note): note is string => Boolean(note)))]
    .map(firstSentence)
    .slice(0, FACTS);
  if (picked.length < 2) return undefined;
  return [
    `[상성] 사용자는 ${josa(me.name, "로/으로")} ${josa(enemy.name, "을/를")} 상대합니다.`,
    "[검증된 조언]",
    ...picked.map((line) => `- ${line}`),
    "",
    `[할 일] 위 조언을 ${me.name}을 잡은 사용자에게 건네는 말로 다듬어 이어 쓰십시오.`,
    "- 새 사실·스킬·아이템을 더하지 마십시오. 위에 없는 말은 쓰지 않습니다.",
    "- 문장마다 순서를 지키고, 합니다체로 씁니다. 목록·머리말·인사말 없이 본문만 씁니다.",
    "- 스킬은 위에 적힌 대로(슬롯 문자와 이름) 씁니다.",
  ].join("\n");
}
