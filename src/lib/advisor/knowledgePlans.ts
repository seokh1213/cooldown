/** 문서 검색, 룬·주문 규칙, 이름 정정, 게임 사실과 마지막 낱말 검색. */
import { buildItemCard } from "./context";
import { buildRuleAnswer as buildRuleCard } from "./answer";
import { refersToContextChampions } from "./askWords";
import { detectSpellFocus } from "./spellFocus";
import { championTypoPlan } from "./championTypoPlan";
import { topicFromWords } from "./topicJudge";
import { championPriceAnswer, gameMetaAnswer, findGameMeta } from "./gameMeta";
import { namedMonsters } from "./monsterAnswer";
import { buildSearchCorpus, hitsToAnswer, buildRetrievalDocs, hybridSearch, lexicalSearch } from "./searchFallback";
import { questionLanguage } from "./questionLanguage";
import { ruleCooldown, askedRules, docAnswer, knowledgeReference, lexicalHit, searchesByVector } from "./questionDocs";
import { type AnswerPlan, type PlanDeps, type Intent } from "./planTypes";

/** 상성 대화에서 소환사 주문의 쓰임새를 묻는 말(규칙 카드가 아니라 이어 묻기) */
const SPELL_USE_IN_MATCHUP = /대신|빠지|빠졌|없(을|으면|는데|을\s*때)|instead|\bis\s+down\b|\bdown\b|without|没了|没有|不带|换成|交了.*(?:窗口|开|打|杀)/i;

/*
 * 이름 없는 질문은 검색 LoRA 벡터로 찾는다(`model.retrieval`). 챔피언·아이템 이름이 없고, 이어 묻는 상성 대화도 아니고,
 * 도우미 자신·챔피언 가격 단계를 묻는 것도 아닐 때. 낱말(룬·주문 이름 → 게임 메타 → 게임 원리 → 낱말 검색)보다 먼저 쓴다 —
 * 낱말이 먼저 답하면 그 틀린 답이 그대로 남았다(시험 절반: 낱말 먼저 226 · 31, 벡터만 288 · 31).
 * 챔피언 이름 오타 후보가 있어도 찾지 않는다 — "럼미 E" 는 럼블 질문이다(오타 단계가 고친다).
 * 검색이 실패하면(그래프·파일) 아래 낱말 길이 처음부터 그대로 돈다.
 */
export async function answerByVector({ question, ctx, data, ask, recentItem, matchup, recent, slot }: Intent, deps: PlanDeps): Promise<AnswerPlan | undefined> {
  /*
   * "두 챔피언에 대해 스킬 쿨타임도" — 가리키는 챔피언이 화면·대화에 있으면 문서 검색이 아니다. 검색은 "챔피언 분류" 절을 골랐다.
   * 갈래가 스킬 소개·스킬 수치여도 같다: 이름 없이 스킬을 묻는데 챔피언이 눈앞에 있으면 그 챔피언이 답이다(`answerChampion` 이 붙인다).
   * 잘못 가른 룬·게임 메타 질문은 아래 낱말 길(룬·주문 → 게임 메타 → 아이템·원리)이 그대로 받는다.
   */
  if ((refersToContextChampions(question) || Boolean(slot) || ask === "spellStat" || ask === "skills" || ask === "guide" || Boolean(topicFromWords(question)) || (ask === "item" && !buildItemCard(data, question, recentItem))) && (recent.length > 0 || ctx.championIds.length > 0)) return undefined;
  if (!(ctx.canUseModel && ctx.consented && ctx.retrieval && searchesByVector(data, question, recentItem, Boolean(matchup)))) return undefined;
  // 명시된 몬스터는 검수한 사실로 답한다. 옛 벡터 목록에 문서가 없다는 이유로 거절하지 않는다.
  if (namedMonsters(question).length && lexicalHit(data, question)?.step === "meta") return undefined;
  const top = await deps.search(question, ctx.lang).catch((error: unknown) => {
    console.warn("[advisor] 검색 벡터 실패 — 낱말 검색으로", error);
    return null;
  });
  // null: 검색 실패 — 아래 낱말 길로 내려간다
  if (top === null) return undefined;
  // 벡터 점수와 낱말 점수(BM25 · 룬·주문 이름·은어 → 게임 메타 → 게임 원리 적중)를 합친다. 까닭과 수치는 `hybridSearch`
  const asked = questionLanguage(question) ?? ctx.lang;
  const bm25 = lexicalSearch(buildRetrievalDocs(data, asked, true), question, 100);
  const found = hybridSearch(top, bm25, lexicalHit(data, question));
  const answer = found.answer ? docAnswer(data, ctx.lang, found.answer, question) : undefined;
  if (typeof answer === "string") return { type: "code", answer, knowledge: found.answer ? knowledgeReference(data, ctx.lang, found.answer) : undefined, notice: ctx.notice };
  if (answer) return { type: "card", answer, notice: ctx.notice };
  if (found.related?.length) {
    // 확신이 없으면 "자료 없음" 대신 가까운 자료 셋을 고르게 한다. 누르면 그 자료를 보인다(`showDoc`).
    const titles = new Map(buildRetrievalDocs(data, ctx.lang).map((doc) => [doc.id, doc.title]));
    // 검색 벡터 목록에는 자료에서 뺀 절의 id 가 남아 있을 수 있다(벡터를 다시 만들기 전). 이름을 못 찾는 id 는 보이지 않는다.
    const related = found.related.filter((id) => titles.has(id)).map((id) => ({ id, title: titles.get(id)! }));
    if (!related.length) return { type: "code", answer: ctx.copy.noLiteAnswer };
    return { type: "code", answer: ctx.copy.card.relatedPrompt, related };
  }
  return { type: "code", answer: ctx.copy.noLiteAnswer };
}

/**
 * 룬·주문 판정. 함께 나온 다른 규칙 이름이 든 문장이 답이다.
 * "정복자에 점화 들어가?" 는 점화 규칙 9문장 중 "정복자" 가 든 한 문장.
 *
 * 이런 질문은 툴팁만 보면 틀린다. 실제로 그렇게 틀렸다. 그래서 문장에서 룬·주문 이름을 찾아
 * 위키에서 모은 판정 규칙으로 답한다.
 */
export function answerRuleQuestion({ question, ctx, data, matchup }: Pick<Intent, "question" | "ctx" | "data" | "matchup">): AnswerPlan | undefined {
  const descriptive = lexicalHit(data, question);
  if (descriptive?.step === "rule" && !askedRules(data, question).some(rule => `rule:${rule.name}` === descriptive.id)) {
    const answer = docAnswer(data, ctx.lang, descriptive.id, question);
    if (typeof answer === "string") return { type: "code", answer, notice: ctx.notice };
    if (answer) return { type: "card", answer, notice: ctx.notice };
  }
  const named = askedRules(data, question).sort((a, b) => Number(a.subject === "gameplay") - Number(b.subject === "gameplay"));
  /*
   * 상성 대화 중에 소환사 주문을 **어떻게 쓰느냐**를 물으면("점멸 빠지면 물어도 돼?", "점멸 대신 방어막 들어도 돼?") 규칙 카드가 아니라
   * 그 상성의 이어 묻기다. 대화 흐름 시험에서 이름이 든 이어 묻기 9개가 모두 이 꼴이었고, 새 질문 3개는 룬 자체의 속성("감전 쿨타임")이었다.
   */
  const spellInMatchup =
    named.length > 0 && named.every((rule) => rule.subject === "summoner") && SPELL_USE_IN_MATCHUP.test(question) && Boolean(matchup);
  if (!named.length || spellInMatchup) return undefined;
  const names = named.map((rule) => rule.name);
  const cards = named.map((rule) => buildRuleCard(rule, { mentionedNames: names, lang: ctx.lang, mentioned: named, cooldownSeconds: ruleCooldown(data, rule, question), question }));
  if (named.length > 1 && detectSpellFocus(question)?.focus === "cooldown") {
    const text = cards.flatMap(card => card.kind === "rule" ? [`### ${card.rule.name}\n${card.highlighted.join("\n")}`] : []).join("\n\n");
    return { type: "code", answer: text, notice: ctx.notice };
  }
  const best = cards.find((card) => card.kind === "rule" && card.highlighted.length > 0) ?? cards[0];
  return { type: "card", answer: best, notice: ctx.notice };
}

/**
 * 챔피언 이름 오타. 한 글자 틀린 이름이 있으면 먼저 고친다 — 말파이트 표를 보며 "럼미 E" 라
 * 치면 럼블이지 말파이트가 아니고, "말파이트랑 럼베 중" 은 둘을 견주는 질문이다.
 * 후보가 하나면 바로 간다. 이미 찾은 챔피언은 오타 후보에서 뺀다.
 */
export function fixChampionTypo({ question, data, champions, matchup }: Intent): AnswerPlan | undefined {
  return championTypoPlan(question, data, { champions, inMatchup: Boolean(matchup) });
}

/*
 * 게임 규칙·메타(항복·다시하기·오브젝트 시간·챔피언 가격·닷지 …). 공식 위키에서 옮긴 사실로 답한다(`gameMeta.ts`).
 * 이름이 없으면 낱말로, 챔피언 하나가 곁들여졌으면 갈래가 게임 규칙일 때만("킨드레드 하는 중인데
 * 첫 바론 몇 분에 나와"). 상성 대화 중이어도 새 질문이다.
 */
export function answerGameFact({ question, ctx, data, champions, ask }: Intent): AnswerPlan | undefined {
  if (champions.length === 1) {
    const price = championPriceAnswer(question, champions[0], ctx.lang);
    // "피오라 굶주린 히드라 가격" 은 아이템 가격이다 — 아이템 이름이 있으면 챔피언 가격 대신 아이템 카드로 답한다
    if (price) return { type: "code", answer: buildItemCard(data, question, undefined) ?? price, notice: ctx.notice };
  }
  if (champions.length === 0 || (champions.length === 1 && ask === "game")) {
    const fact = gameMetaAnswer(question, ctx.lang);
    if (fact) {
      const named = findGameMeta(question);
      return { type: "code", answer: fact, knowledge: named ? knowledgeReference(data, ctx.lang, `meta:${named.id}`) : undefined, notice: ctx.notice };
    }
  }
  return undefined;
}

/** 어느 이름도 없고 벡터 검색도 답을 못 냈다. 질문 낱말로 찾는다. 동의 전이면 모델에게 넘긴다. */
export function answerFromNotes({ question, ctx, data, ask }: Intent): AnswerPlan | undefined {
  if (!ctx.consented) return undefined;
  const corpus = buildSearchCorpus(data, ctx.lang);
  /*
   * 게임 규칙·메타(항복·오브젝트 시간·챔피언 가격·랭크)는 자료에 없는 것이 많다. 갈래가 게임 규칙인 질문이
   * 낱말 검색에도 안 걸리면 자료가 없다는 안내(`noGameData`)를 보인다.
   */
  if (ask === "game" && !lexicalSearch(corpus, question).length) return { type: "code", answer: ctx.copy.noGameData };
  // 모델은 카드 없는 답을 쓰지 않는다. 질문 낱말로 찾아 걸린 자료 문장을 그대로 보인다(`hitsToAnswer`). 없으면 자료가 없다고 말한다.
  const shown = hitsToAnswer(lexicalSearch(corpus, question), question);
  return { type: "code", answer: shown || ctx.copy.noLiteAnswer };
}
