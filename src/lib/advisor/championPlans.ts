/** 아이템·원리·챔피언 자료의 계획. 수치 조회와 운용 노트를 구분한다. */
import { championNotes } from "./playbookNotes";
import { buildItemCard, buildTagAnswer, buildMechanicsAnswer } from "./context";
import { buildCompareAnswer as buildCompareCard, buildSpellAnswer as buildSpellCard } from "./answer";
import { asksComparison, asksWholeKit, looksChampionDirected, asksSkillHandling } from "./askWords";
import { detectSpellFocus } from "./spellFocus";
import { topicFromWords } from "./topicJudge";
import { asksCombo } from "./comboIntent";
import type { ChampionCard } from "@/lib/knowledge/facts";
import { type AnswerPlan, type Intent } from "./planTypes";

/**
 * 이름이 아예 없다. 아이템·게임 규칙 이름이면 그것이 답이다. 맥락 챔피언을 붙이기
 * 전에 본다 — 말파이트 표를 보며 "쇼진의 창 효과" 를 물으면 아이템 질문이다.
 */
export function answerItemOrMechanics({ question, data, champions, recentItem }: Intent): AnswerPlan | undefined {
  if (champions.length !== 0) return undefined;
  const itemAnswer = buildItemCard(data, question, recentItem);
  if (itemAnswer) return { type: "code", answer: itemAnswer };
  const mechanicsAnswer = buildMechanicsAnswer(data, question);
  return mechanicsAnswer ? { type: "code", answer: mechanicsAnswer } : undefined;
}

/** 챔피언 질문. 이름이 없으면 대화·화면의 챔피언을 붙인다. */
export async function answerChampion(intent: Intent): Promise<AnswerPlan | undefined> {
  const { question, ctx, champions, slot, ask } = intent;
  // 아이템 갈래인데 아이템 이름이 없으면("그럼 템은?") 대화·화면 챔피언의 아이템 노트를 묻는 것이다
  const itemWithoutName = ask === "item" && !buildItemCard(intent.data, question, intent.recentItem);
  // 챔피언 카드 뒤의 "그럼 한타 때는?", "라인전은?" — 이름 없는 공략 갈래나 주제 낱말은 대화·화면 챔피언의 그 주제 노트다(2026-09-30 브라우저 시험: "자료 없음" 으로 빠짐)
  const guideFollowup = ask === "guide" || Boolean(topicFromWords(question));
  const about = champions.length === 0 && (looksChampionDirected(question, slot, ask) || itemWithoutName || guideFollowup) ? championsFromContext(intent) : { champions, notice: ctx.notice };
  if ("type" in about) return about;
  if (about.champions.length === 0) return undefined;
  // 둘 이상을 견주는 질문은 코드가 표로 견준다. 모델이 도구로 수치를 꺼내 글로
  // 견주게 했을 때는 30초 걸리고 "665이고," 에서 끊기기도 했다.
  if (asksComparison(question, about.champions.length) || about.champions.length > 1) {
    // 여럿을 한데 묻는 말도 나란히 놓은 표로 답한다
    // 상성 대화 중의 조회 표는 상성 맥락을 잇는다(`matchupStateOf`)
    const card = buildCompareCard(about.champions, question, slot, { lang: ctx.lang });
    return { type: "card", answer: intent.matchup && card.kind === "compare" ? { ...card, inMatchup: true } : card, notice: about.notice };
  }
  return answerOneChampion(intent, about.champions[0], about.notice);
}

/**
 * 챔피언을 겨냥했는데 이름이 없으면 맥락에서 가져온다. 대화에서 방금 다룬 챔피언이
 * 먼저, 없으면 화면에 떠 있는 것 — 표를 보면서 "W 쿨타임" 이라 물으면 화면의 W 다.
 * 누구 것인지 정할 수 없으면 답(되묻기·나란히 놓기)을 돌려준다.
 */
function championsFromContext({ question, ctx, data, recent, slot, ask }: Intent): AnswerPlan | { champions: ChampionCard[]; notice?: string } {
  const onScreen = ctx.championIds.map((id) => data.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
  const source = recent.length ? recent : onScreen;
  if (source.length === 1) return { champions: source, notice: ctx.notice };
  if (source.length === 0) return { champions: [], notice: ctx.notice };
  if (asksComparison(question, source.length)) return { champions: source, notice: ctx.notice };
  if (slot) {
    // VS 화면에 둘이 떠 있는데 "W 쿨타임" 이면 둘의 W 를 나란히 놓는다. 견주러 온
    // 화면에서 "누구 것?" 하고 되묻는 것보다 둘 다 보여 주는 쪽이 답이다.
    return { type: "card", answer: buildCompareCard(source, question, slot, { lang: ctx.lang }), notice: ctx.notice };
  }
  // 상성을 말한 뒤의 "스킬 쿨타임" 은 내 챔피언(앞쪽) 것이다.
  // 상성·비교 뒤의 스킬 수치 조회("list their ability cooldowns")는 둘의 표다. 한쪽만 주면 나머지를 되물어야 한다.
  if (recent.length >= 2 && ask === "spellStat") return { champions: source, notice: ctx.notice };
  if (recent.length) return { champions: [source[0]], notice: ctx.notice };
  // 화면에 둘이 있는데 슬롯도 비교도 아니면 누구 것인지 묻는다.
  return { type: "code", answer: { kind: "suggestion", original: question, candidates: source, reason: "ambiguous" }, pending: true };
}

/**
 * 챔피언 한 명을 묻는 질문의 답.
 *
 * **모델을 거치지 않는다.** 자료를 붙여 모델에게 넘겼더니 받아 적기만 하다가
 * 900토큰에서 잘렸다. 럼블은 카드 본문만 2,654자라 끝까지 닿지 못했고,
 * 능력치 표를 통째로 빠뜨린 채 문장 중간에서 끊겼다.
 *
 * 자료가 곧 답인 질문이다. 코드가 내면 잘리지 않고, 빠뜨리지 않고, 즉시 나간다.
 *
 * 프롬프트가 아니므로 지식 카드를 자르지 않는다. (자료를 프롬프트에 붙이던 때) `buildChampionBrief` 가
 * 4건·3건으로 줄인 것은 프롬프트가 6천 자에 닿으면 브라우저 런타임이 죽기 때문이었는데,
 * 여기는 화면에 바로 나가는 글이라 그 제약이 없다.
 */
async function answerOneChampion({ question, ctx, data, ask, topic: judgeTopicOnce, slot }: Intent, card: ChampionCard, notice: string | undefined): Promise<AnswerPlan> {
  // 판정기가 skills를 골라도 명시적인 연계 질문은 절차를 답한다.
  if (asksCombo(question) && !asksSkillHandling(question)) {
    return { type: "card", answer: { kind: "champion", card, notes: championNotes(data, card, question, "playing", { topic: "combo" }) }, notice };
  }
  // "패시브와 네 가지 스킬을 각각" 은 패시브 한 칸이 아니라 스킬 전체 소개다
  const spell = slot && !asksWholeKit(question) ? card.spells.find((entry) => entry.slot === slot) : undefined;
  if (spell && asksSkillHandling(question)) {
    const notes = championNotes(data, card, question, "against", { topic: "skill", perspective: "against" });
    return { type: "card", answer: { kind: "champion", card, notes: { ...notes, playing: [], against: notes.against.slice(0, 1), detail: "full" } }, notice };
  }
  if (spell) return { type: "card", answer: buildSpellCard(card, spell, question, ctx.lang), notice };
  // 효과 태그 예/아니오는 코드가 바로 답한다. 태그가 없다는 사실을 근거로
  // "아니다" 라고 말하는 것을 모델이 못 한다.
  const tagAnswer = buildTagAnswer(data, card, question);
  if (tagAnswer) return { type: "code", answer: tagAnswer, notice };
  // "말파이트 스킬 설명해줘": 스킬 다섯 개의 요약 + 운용 노트. 능력치 표는 뺀다.
  if (ask === "skills" || asksWholeKit(question)) {
    return { type: "card", answer: { kind: "champion", card, view: "skills", notes: championNotes(data, card, question, undefined, await judgeTopicOnce()) }, notice };
  }
  // "말파이트 스킬 쿨타임": 슬롯 없이 사실 하나를 물으면 스킬 다섯 개의 그 사실을 표로.
  const focus = detectSpellFocus(question)?.focus;
  if (focus && focus !== "damage") {
    /*
     * 수치 하나를 물은 것이니 그 수치만 준다.
     *
     * 한때 표 밑에 운용 노트를 얹었다. 답이 대화에도 글로 적히니 카드는 더
     * 줘도 된다고 봤는데, "오공 스킬 쿨타임" 에 "오공을 상대할 때 · 플레이할
     * 때" 가 따라 나와 무엇을 답한 것인지 흐려졌다. 묻지 않은 것이다.
     */
    return { type: "card", answer: { kind: "champion", card, focus }, notice };
  }
  return { type: "card", answer: { kind: "champion", card, notes: championNotes(data, card, question, undefined, await judgeTopicOnce()) }, notice };
}
