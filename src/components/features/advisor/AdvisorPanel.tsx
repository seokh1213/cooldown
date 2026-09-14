/**
 * 롤 지식 질의 패널
 *
 * 화면 오른쪽 아래에 떠 있고, 동의 전에는 동의 화면을, 그 뒤에는 대화를 보여 준다.
 * 모델 적재는 수십 초가 걸리므로 진행률을 파일 합계로 계속 보여 준다.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, HardDrive, History, Loader2, MessageSquarePlus, Send, Square, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { advisorSystemPrompt } from "@/lib/advisor/persona";
import { AdvisorMarkdown } from "./AdvisorMarkdown";
import {
  buildChampionsBrief,
  buildMatchupTips,
  championNotes,
  buildItemAnswer,
  buildTagAnswer,
  buildMechanicsAnswer,
  detectSlot,
  type AdvisorData,
} from "@/lib/advisor/context";
import {
  answerChampionIds,
  asksComparison,
  asksMatchup,
  asksSkillsOverview,
  buildCommentaryPrompt,
  buildCompareAnswer as buildCompareCard,
  buildRuleAnswer as buildRuleCard,
  buildSpellAnswer as buildSpellCard,
  detectSpellFocus,
  looksChampionDirected,
  suggestChampions,
  type AdvisorAnswer,
} from "@/lib/advisor/answer";
import { nicknames } from "@/lib/advisor/intent";
import { findMentionedRules } from "../../../../scripts/llm/lib/rules";
import type { ChampionCard } from "../../../../scripts/llm/lib/facts";
import { championIconUrl } from "@/data/assets/riotAssetUrls";
import { usePageContext } from "@/hooks/usePageContext";
import { AdvisorAnswerCard } from "./AdvisorAnswerCard";
import {
  SEARCH_QUERY_SYSTEM,
  buildQueryPrompt,
  buildSearchCorpus,
  extractQuery,
  lexicalSearch,
  searchContext,
} from "@/lib/advisor/searchFallback";
import { detectChampions } from "@/lib/advisor/intent";
import type { UseAdvisorResult } from "@/hooks/useAdvisor";
import type { UseAdvisorHistoryResult } from "@/hooks/useAdvisorHistory";
import { AdvisorConsent } from "./AdvisorConsent";
import { AdvisorHistory } from "./AdvisorHistory";
import { AdvisorStorage } from "./AdvisorStorage";

interface AdvisorPanelProps {
  advisor: UseAdvisorResult;
  /** 챔피언·규칙 자료. 위젯이 받아 둔다. 아직 없으면 모델만으로 답한다. */
  data: AdvisorData | null;
  history: UseAdvisorHistoryResult;
  patch: string;
  /** 카드의 챔피언 아이콘용 */
  ddragonVersion: string;
  /**
   * 이 기기에 모델을 권할 수 있는가. 모바일이거나 WebGPU 가 없으면 false.
   * false 면 내려받기를 권하지 않고 코드 답변만으로 쓴다.
   */
  canUseModel: boolean;
  onClose: () => void;
}

function formatMb(bytes: number): string {
  return (bytes / 1048576).toFixed(0);
}

/** `{name}` 같은 자리를 채운다. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function AdvisorPanel({ advisor, data, history, patch, ddragonVersion, canUseModel, onClose }: AdvisorPanelProps) {
  const { t, lang } = useTranslation();
  const copy = t.advisor;
  const [draft, setDraft] = useState("");
  // 동의 화면을 건너뛰고 코드 답변만으로 써 보는 상태
  const [skippedModel, setSkippedModel] = useState(false);
  // 헤더 버튼으로 바꾸는 보조 화면. 저장 공간(모델 삭제) / 대화 기록(새 대화·열기·삭제)
  const [view, setView] = useState<"chat" | "storage" | "history">("chat");
  const showStorage = view === "storage";
  const showHistory = view === "history";
  // 생성 중에 보내려 했는지. 조용히 먹히면 고장으로 보여서 한 줄 알린다.
  const [pressedWhileBusy, setPressedWhileBusy] = useState(false);
  // 지금 화면에 떠 있는 챔피언·탭. 이름을 생략한 질문과 빈 화면 예시가 여기에 기댄다.
  const context = usePageContext();
  // 오타 후보를 물었을 때의 원래 질문. 고르면 그 말만 바꿔 다시 묻는다.
  const pendingQuestion = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = advisor.status === "generating";
  // 모델이 아직 안 올라왔으면 진행률을 계속 보여 준다.
  // 적재 중에 질문을 받으면 상태가 generating 으로 바뀌는데, 그때 진행률을 감추면
  // 사용자는 몇 분 동안 도는 점만 보게 된다.
  const loading =
    canUseModel &&
    !advisor.modelReady &&
    advisor.consented &&
    advisor.status !== "idle" &&
    advisor.status !== "error";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [advisor.turns]);

  /**
   * 카드를 얹는다. 모델을 쓸 수 있으면 해설을 그 위에 스트리밍한다.
   *
   * 카드는 코드가 0초에 그린다. 모델에게는 코드가 계산한 재료(백분위·계수·태그)를 주고
   * "왜 중요한가" 두세 문장만 시킨다. 수치는 카드에 있으니 모델이 숫자를 입에 담지 않는다.
   */
  const deliver = (question: string, answer: AdvisorAnswer, notice?: string) => {
    const system = advisorSystemPrompt(lang);
    if (canUseModel && advisor.consented) {
      const prompt = buildCommentaryPrompt(answer, patch);
      if (prompt) {
        advisor.sendWithAnswer(question, `${system}\n\n${prompt}`, answer, notice);
        return;
      }
    }
    advisor.answerWithoutModel(question, answer, notice);
  };

  /** 대화에서 가장 최근에 다룬 챔피언. 이름을 생략한 다음 질문의 맥락이다. */
  const recentChampions = (): ChampionCard[] => {
    if (!data) return [];
    for (let i = advisor.turns.length - 1; i >= 0; i -= 1) {
      const turn = advisor.turns[i];
      if (turn.role !== "assistant" || !turn.answer) continue;
      const ids = answerChampionIds(turn.answer);
      if (ids.length) return ids.map((id) => data.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card));
    }
    return [];
  };

  /**
   * 질문 하나를 푼다.
   *
   * 순서가 곧 우선순위다. 룬·주문 판정 → 챔피언(오타 교정) → 대화 맥락의 상성 →
   * 아이템·게임 규칙 → 맥락 챔피언(대화, 화면) → 검색 폴백.
   * 오타를 고쳐 다시 들어올 수 있어 submit 과 분리했다.
   */
  const ask = (question: string, notice?: string) => {
    const system = advisorSystemPrompt(lang);
    if (!data) {
      advisor.send(question, system, undefined, copy.noModel);
      return;
    }

    // 1. 룬·주문 판정. 함께 나온 다른 규칙 이름이 든 문장이 답이다.
    //    "정복자에 점화 들어가?" 는 점화 규칙 9문장 중 "정복자" 가 든 한 문장.
    const named = findMentionedRules(data.ruleIndex, question);
    if (named.length) {
      const names = named.map((rule) => rule.name);
      const cards = named.map((rule) => buildRuleCard(rule, names));
      const best = cards.find((card) => card.kind === "rule" && card.highlighted.length > 0) ?? cards[0];
      deliver(question, best, notice);
      return;
    }

    // 2. 챔피언. 한 글자 틀린 이름이 있으면 먼저 고친다 — 말파이트 표를 보며 "럼미 E" 라
    //    치면 럼블이지 말파이트가 아니고, "말파이트랑 럼베 중" 은 둘을 견주는 질문이다.
    //    후보가 하나면 바로 간다. 이미 찾은 챔피언은 오타 후보에서 뺀다.
    let champions = detectChampions(data, question);
    let usedNotice = notice;
    {
      const known = new Set(champions.map((card) => card.id));
      const typo = suggestChampions(question, data.cards, nicknames(data.cards), known);
      if (typo?.candidates.length === 1) {
        const [card] = typo.candidates;
        ask(question.replace(typo.original, card.name), fill(copy.card.understoodAs, { name: card.name }));
        return;
      }
      if (typo && typo.candidates.length > 1) {
        pendingQuestion.current = question;
        advisor.answerWithoutModel(question, { kind: "suggestion", original: typo.original, candidates: typo.candidates });
        return;
      }
    }

    // 3. 대화 맥락. "말파이트 설명해줘" 다음의 "제이스랑 상대한다 생각하면" 은 말파이트로
    //    제이스를 상대하는 질문이다. 방금 다룬 챔피언이 내 챔피언, 새 이름이 상대.
    const recent = recentChampions();
    if (champions.length === 1 && asksMatchup(question)) {
      const mine = recent.find((card) => card.id !== champions[0].id);
      if (mine) {
        const pair = [mine, champions[0]];
        const answer = buildCompareCard(pair, question, undefined, { matchup: true });
        const prompt = buildCommentaryPrompt(answer, patch);
        if (canUseModel && advisor.consented && prompt) {
          // 상성 해설은 사람이 검증한 지식 카드(플레이북)를 재료로 더 준다.
          const tips = buildMatchupTips(data, mine, champions[0]);
          advisor.sendWithAnswer(question, [system, tips, prompt].filter(Boolean).join("\n\n"), answer, usedNotice);
        } else {
          advisor.answerWithoutModel(question, answer, usedNotice);
        }
        return;
      }
    }

    // 4. 이름이 아예 없다. 아이템·게임 규칙 이름이면 그것이 답이다. 맥락 챔피언을 붙이기
    //    전에 본다 — 말파이트 표를 보며 "쇼진의 창 효과" 를 물으면 아이템 질문이다.
    if (champions.length === 0) {
      const itemAnswer = buildItemAnswer(data, question);
      if (itemAnswer) {
        advisor.answerWithoutModel(question, itemAnswer);
        return;
      }
      const mechanicsAnswer = buildMechanicsAnswer(data, question);
      if (mechanicsAnswer) {
        advisor.answerWithoutModel(question, mechanicsAnswer);
        return;
      }
    }

    // 5. 챔피언을 겨냥했는데 이름이 없으면 맥락에서 가져온다. 대화에서 방금 다룬 챔피언이
    //    먼저, 없으면 화면에 떠 있는 것 — 표를 보면서 "W 쿨타임" 이라 물으면 화면의 W 다.
    const slot = detectSlot(question);
    if (champions.length === 0 && looksChampionDirected(question, slot)) {
      const onScreen = context.championIds
        .map((id) => data.cardById.get(id))
        .filter((card): card is ChampionCard => Boolean(card));
      const source = recent.length ? recent : onScreen;
      const fromWhere = recent.length ? copy.card.fromChat : copy.card.fromScreen;
      if (source.length === 1) {
        champions = source;
        usedNotice = notice ?? fill(fromWhere, { name: source[0].name });
      } else if (source.length >= 2) {
        if (asksComparison(question, source.length)) {
          champions = source;
        } else if (slot) {
          // VS 화면에 둘이 떠 있는데 "W 쿨타임" 이면 둘의 W 를 나란히 놓는다. 견주러 온
          // 화면에서 "누구 것?" 하고 되묻는 것보다 둘 다 보여 주는 쪽이 답이다.
          const names = source.map((card) => card.name).join("·");
          deliver(question, buildCompareCard(source, question, slot), notice ?? fill(fromWhere, { name: names }));
          return;
        } else if (recent.length) {
          // 상성을 말한 뒤의 "스킬 쿨타임" 은 내 챔피언(앞쪽) 것이다.
          champions = [source[0]];
          usedNotice = notice ?? fill(fromWhere, { name: source[0].name });
        } else {
          // 화면에 둘이 있는데 슬롯도 비교도 아니면 누구 것인지 묻는다.
          pendingQuestion.current = question;
          advisor.answerWithoutModel(question, { kind: "suggestion", original: question, candidates: source, reason: "ambiguous" });
          return;
        }
      }
    }

    if (champions.length > 0) {
      // 둘 이상을 견주는 질문은 코드가 표로 견준다. 모델이 도구로 수치를 꺼내 글로
      // 견주게 했을 때는 30초 걸리고 "665이고," 에서 끊기기도 했다.
      if (asksComparison(question, champions.length)) {
        deliver(question, buildCompareCard(champions, question, slot), usedNotice);
        return;
      }
      if (champions.length === 1) {
        const [card] = champions;
        const spell = slot ? card.spells.find((entry) => entry.slot === slot) : undefined;
        if (spell) {
          deliver(question, buildSpellCard(card, spell, question), usedNotice);
          return;
        }
        // 효과 태그 예/아니오는 코드가 바로 답한다. 태그가 없다는 사실을 근거로
        // "아니다" 라고 말하는 것을 모델이 못 한다.
        const tagAnswer = buildTagAnswer(data, card, question);
        if (tagAnswer) {
          advisor.answerWithoutModel(question, tagAnswer, usedNotice);
          return;
        }
        // "말파이트 스킬 설명해줘": 스킬 다섯 개의 요약 + 운용 노트. 능력치 표는 뺀다.
        if (asksSkillsOverview(question)) {
          deliver(question, { kind: "champion", card, view: "skills", notes: championNotes(data, card) }, usedNotice);
          return;
        }
        // "말파이트 스킬 쿨타임": 슬롯 없이 사실 하나를 물으면 스킬 다섯 개의 그 사실을 표로.
        const focus = detectSpellFocus(question)?.focus;
        if (focus && focus !== "damage") {
          deliver(question, { kind: "champion", card, focus }, usedNotice);
          return;
        }
        deliver(question, { kind: "champion", card, notes: championNotes(data, card) }, usedNotice);
        return;
      }
      advisor.send(question, `${system}\n\n${buildChampionsBrief(data, champions)}`, undefined, copy.noModel);
      return;
    }

    // 5. 어느 이름도 없다. 모델에게 검색어만 만들게 하고 찾는 일은 코드가 한다.
    if (advisor.consented) {
      const corpus = buildSearchCorpus(data);
      advisor.sendWithSearch(question, system, {
        querySystem: SEARCH_QUERY_SYSTEM,
        buildPrompt: (tried) => buildQueryPrompt(question, tried),
        extract: extractQuery,
        search: (query) => {
          const hits = lexicalSearch(corpus, query);
          if (!hits.length) return undefined;
          return {
            context: searchContext(hits, data.patch, query),
            titles: hits.map((hit) => hit.doc.title),
          };
        },
        labels: { searching: copy.status.searching, searched: copy.status.searched },
        maxRounds: 2,
        fallbackSystem: system,
      });
      return;
    }
    advisor.send(question, system, undefined, copy.noModel);
  };

  const submit = () => {
    const question = draft.trim();
    if (!question) return;
    if (busy) {
      setPressedWhileBusy(true);
      return;
    }
    setPressedWhileBusy(false);
    ask(question);
    setDraft("");
  };

  /** 오타 후보를 골랐을 때. 원래 질문에서 그 말만 바꿔 다시 묻는다. */
  const pickChampion = (championId: string) => {
    const card = data?.cardById.get(championId);
    const original = pendingQuestion.current;
    if (!data || !card || !original) return;
    pendingQuestion.current = "";
    const typo = suggestChampions(original, data.cards, nicknames(data.cards));
    // 오타였으면 그 말을 바꾸고, 화면의 둘 중 하나를 고른 것이면 이름을 앞에 붙인다.
    const fixed = typo ? original.replace(typo.original, card.name) : `${card.name} ${original}`;
    ask(fixed, fill(copy.card.understoodAs, { name: card.name }));
  };

  // 빈 화면과 입력창 안내는 화면 맥락을 따른다. 말파이트 표를 보고 있으면 말파이트 예시.
  const contextCards = data
    ? context.championIds.map((id) => data.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card))
    : [];
  const examples = (() => {
    const ex = copy.card.examples;
    // 예시는 특정 사례("W 쿨타임")가 아니라 질문의 종류다. 하나씩 눌러 보면 무엇을
    // 물을 수 있는지 다 보인다.
    if (contextCards.length >= 2) {
      const [a, b] = contextCards;
      const pair = { a: a.name, b: b.name };
      return [fill(ex.vsWho, pair), fill(ex.vsStat, pair), fill(ex.vsBuy, pair), fill(ex.skillCd, { name: a.name })];
    }
    if (contextCards.length === 1) {
      const name = contextCards[0].name;
      return [
        fill(ex.skillCd, { name }),
        fill(ex.skillEffect, { name }),
        fill(ex.skillRatio, { name }),
        fill(ex.explain, { name }),
        fill(ex.counterBuy, { name }),
      ];
    }
    if (context.route === "encyclopedia") {
      if (context.tab === "items") return [ex.item1, ex.item2, ex.generic4];
      if (context.tab === "runes") return [ex.rune1, ex.rune2, ex.generic1];
      if (context.tab === "summoner") return [ex.summoner1, ex.summoner2, ex.rune1];
    }
    return [ex.generic1, ex.generic2, ex.generic3, ex.generic4];
  })();
  const placeholder = contextCards.length
    ? fill(copy.card.askAbout, { name: contextCards.map((card) => card.name).join("·") })
    : copy.placeholder;
  const lastAssistantId = [...advisor.turns].reverse().find((turn) => turn.role === "assistant")?.id;

  const percent =
    advisor.progress.totalBytes > 0
      ? Math.min(100, Math.round((advisor.progress.loadedBytes / advisor.progress.totalBytes) * 100))
      : 0;

  return (
    <div
      role="dialog"
      aria-label={copy.title}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[560px] md:border-l"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {view !== "chat" && (
            <Button variant="ghost" size="icon" className="-ml-2 h-7 w-7" onClick={() => setView("chat")} aria-label={copy.storage.back}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <span className="text-sm font-semibold">
            {showStorage ? copy.storage.title : showHistory ? copy.history.title : copy.title}
          </span>
          {view === "chat" && advisor.status === "generating" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {copy.status.generating}
            </span>
          )}
        </div>
        {view === "chat" && (
          <div className="flex items-center gap-1">
            {/* 대화는 지우는 것이 아니라 새로 시작한다. 지난 대화는 기록에 남아 다시 열 수 있다. */}
            {advisor.turns.length > 0 && (
              <Button variant="ghost" size="icon" disabled={busy} onClick={history.startNew} aria-label={copy.history.newChat}>
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setView("history")} aria-label={copy.history.open}>
              <History className="h-4 w-4" />
            </Button>
            {/* 3GB 는 받아 두면 계속 남는다. 지울 길을 눈에 보이는 곳에 둔다. */}
            <Button variant="ghost" size="icon" onClick={() => setView("storage")} aria-label={copy.storage.open}>
              <HardDrive className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={copy.close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {view !== "chat" && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={copy.close}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </header>

      {showStorage ? (
        <AdvisorStorage onDelete={advisor.deleteModel} />
      ) : showHistory ? (
        <AdvisorHistory
          conversations={history.conversations}
          currentId={history.currentId}
          busy={busy}
          onNew={() => {
            history.startNew();
            setView("chat");
          }}
          onOpen={(id) => {
            history.open(id);
            setView("chat");
          }}
          onRemove={history.remove}
        />
      ) : canUseModel && !advisor.consented && !skippedModel ? (
        <AdvisorConsent
          webgpu={advisor.webgpu}
          storage={advisor.storage}
          onAccept={advisor.accept}
          onCancel={onClose}
          onSkip={() => setSkippedModel(true)}
        />
      ) : (
        <>
          {/*
            내려받기를 권하지 않는 기기에서는 동의 화면을 건너뛰고 바로 여기로 온다.
            3GB 를 못 받는다고 챔피언·아이템·규칙 조회까지 막을 이유는 없다.
          */}
          {!canUseModel && (
            <p className="border-b px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
              {copy.modelUnavailable}
            </p>
          )}
          {loading && (
            <div className="border-b px-4 py-3 text-xs text-muted-foreground">
              <div className="mb-2 flex items-center justify-between">
                <span>
                  {advisor.progress.totalBytes > 0 &&
                  advisor.progress.loadedBytes >= advisor.progress.totalBytes
                    ? copy.status.warming
                    : copy.status.downloading}
                </span>
                {advisor.progress.totalBytes > 0 && (
                  <span>
                    {formatMb(advisor.progress.loadedBytes)} / {formatMb(advisor.progress.totalBytes)} MB
                  </span>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {advisor.turns.length === 0 && !loading && (
              <div className="space-y-3 text-muted-foreground">
                {contextCards.length > 0 ? (
                  <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-foreground">
                    {contextCards.map((card) => (
                      <img
                        key={card.id}
                        src={championIconUrl(ddragonVersion, card.id)}
                        alt=""
                        width={28}
                        height={28}
                        className="h-7 w-7 shrink-0 rounded-md"
                      />
                    ))}
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-sm font-semibold">{contextCards.map((card) => card.name).join(" vs ")}</div>
                      <div className="text-xs text-muted-foreground">
                        {contextCards.length > 1 ? copy.card.comparing : copy.card.viewing}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p>{copy.emptyHint}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {examples.map((example) => (
                    <button
                      key={example}
                      type="button"
                      onClick={() => ask(example)}
                      className="rounded-md border bg-background px-2.5 py-1 text-xs text-foreground hover:bg-muted"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {advisor.turns.map((turn) => (
              <div
                key={turn.id}
                className={
                  turn.role === "user"
                    ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground"
                    : turn.answer
                      ? "w-full"
                      : "mr-auto w-fit max-w-[95%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2"
                }
              >
                {turn.notice && <p className="mb-1.5 text-[11px] text-muted-foreground">{turn.notice}</p>}
                {turn.answer ? (
                  // 해설이 먼저, 카드가 아래(M3-A). 카드는 0초에 뜨고 해설은 그 위에서 자라난다.
                  <div className="space-y-2">
                    {turn.content ? (
                      <div className="border-l-2 border-border pl-2.5 text-[13px] leading-relaxed">
                        <span className="block text-[11px] text-muted-foreground">{copy.card.commentary}</span>
                        <AdvisorMarkdown text={turn.content} />
                      </div>
                    ) : busy && turn.id === lastAssistantId ? (
                      <span className="flex items-center gap-2 pl-2.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {copy.card.commentaryPending}
                      </span>
                    ) : null}
                    <AdvisorAnswerCard
                      answer={turn.answer}
                      ddragonVersion={ddragonVersion}
                      patch={patch}
                      onPickChampion={pickChampion}
                    />
                  </div>
                ) : turn.content ? (
                  turn.role === "assistant" ? (
                    <AdvisorMarkdown text={turn.content} />
                  ) : (
                    <span className="whitespace-pre-wrap">{turn.content}</span>
                  )
                ) : (
                  turn.role === "assistant" && (
                    // 검색 폴백은 모델을 두 번 부르고 사이에 코드가 찾는다. 그동안 도는 점만
                    // 있으면 멈춘 것처럼 보인다. 지금 무엇을 하는지 옆에 적는다.
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {turn.activity}
                    </span>
                  )
                )}
                {/*
                  무엇을 보고 답했는지 밝힌다. "자료에 있는 것만 답한다" 가 설계인데
                  어느 자료인지 안 보이면 사용자가 맞는지 가릴 수 없다. 엉뚱한 자료를
                  물어 왔을 때도 그 사실이 드러나야 한다.

                  "근거" 가 아니라 "찾은 자료" 다. 상위 세 건을 다 실어 놓고 어느 것이
                  답인지는 모델이 고르므로, 답에 안 쓰인 것도 섞여 있다.
                */}
                {turn.role === "assistant" && turn.sources && turn.sources.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 border-t pt-2 text-[11px] text-muted-foreground">
                    <span>{copy.sources}</span>
                    {turn.sources.map((source) => (
                      <span key={source} className="rounded bg-background px-1.5 py-0.5">
                        {source}
                      </span>
                    ))}
                  </div>
                )}
                {turn.role === "assistant" && (turn.content || turn.answer) && (
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                    {turn.stats && (
                      <span>
                        {turn.stats.tokens} tok · {turn.stats.seconds.toFixed(1)}s
                      </span>
                    )}
                    {/* 평가는 기기 안에만 쌓인다. 서버로 보내지 않는다. */}
                    <button
                      type="button"
                      aria-label={copy.rateUp}
                      aria-pressed={turn.rating === "up"}
                      onClick={() => advisor.rate(turn.id, "up", patch)}
                      className={
                        turn.rating === "up"
                          ? "text-emerald-400"
                          : "opacity-50 transition-opacity hover:opacity-100"
                      }
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={copy.rateDown}
                      aria-pressed={turn.rating === "down"}
                      onClick={() => advisor.rate(turn.id, "down", patch)}
                      className={
                        turn.rating === "down"
                          ? "text-destructive"
                          : "opacity-50 transition-opacity hover:opacity-100"
                      }
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {advisor.error && (
              <p className="text-destructive">
                {copy.errorPrefix}: {advisor.error}
              </p>
            )}
          </div>

          <footer className="flex flex-col gap-1.5 border-t p-3">
            {pressedWhileBusy && busy && (
              <p className="px-1 text-[11px] leading-4 text-muted-foreground">{copy.busyHint}</p>
            )}
            <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder={placeholder}
              className="max-h-32 min-h-9 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {busy ? (
              <Button size="icon" variant="outline" onClick={advisor.stop} aria-label={copy.stop}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" onClick={submit} disabled={!draft.trim()} aria-label={copy.send}>
                <Send className="h-4 w-4" />
              </Button>
            )}
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
