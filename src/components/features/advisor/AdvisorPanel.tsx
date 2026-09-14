/**
 * 롤 지식 질의 패널
 *
 * 화면 오른쪽 아래에 떠 있고, 동의 전에는 동의 화면을, 그 뒤에는 대화를 보여 준다.
 * 모델 적재는 수십 초가 걸리므로 진행률을 파일 합계로 계속 보여 준다.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronLeft,
  HardDrive,
  History,
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { advisorSystemPrompt } from "@/lib/advisor/persona";
import { AdvisorMarkdown } from "./AdvisorMarkdown";
import {
  buildChampionsBrief,
  buildMatchupTips,
  championNotes,
  matchupNotes,
  buildItemCard,
  buildTagAnswer,
  buildMechanicsAnswer,
  detectSlot,
  type AdvisorData,
} from "@/lib/advisor/context";
import {
  FOCUS_LABEL,
  answerChampionIds,
  answerKey,
  answerLinks,
  asksComparison,
  asksMatchup,
  asksSkillsOverview,
  buildCommentaryPrompt,
  buildCompareAnswer as buildCompareCard,
  buildRuleAnswer as buildRuleCard,
  buildSpellAnswer as buildSpellCard,
  detectSpellFocus,
  itemHeadline,
  looksChampionDirected,
  spellSummary,
  suggestChampions,
  type AdvisorAnswer,
  type SpellFocus,
} from "@/lib/advisor/answer";
import { nicknames } from "@/lib/advisor/intent";
import { findMentionedRules } from "../../../../scripts/llm/lib/rules";
import type { ChampionCard } from "../../../../scripts/llm/lib/facts";
import { championIconUrl, itemIconUrl } from "@/data/assets/riotAssetUrls";
import { usePageContext } from "@/hooks/usePageContext";
import {
  REFERENCE_MAX_WIDTH,
  REFERENCE_MIN_WIDTH,
  WIDE_VIEWPORT_MIN,
  advisorDrawerWidth,
  clampReferenceWidth,
  referencePanelWidth,
  useViewportWidth,
} from "@/hooks/useWideViewport";
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
import type { AdvisorTurn, UseAdvisorResult } from "@/hooks/useAdvisor";
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
  /** 드로어 폭이 바뀔 때. 레이아웃이 페이지를 그만큼 민다. */
  onWidthChange?: (px: number) => void;
}

/** 자료 패널을 접어 둔 것을 기억하는 열쇠. 기기마다. */
const REFERENCE_OPEN_KEY = "cooldown.advisor.reference-open";
/** 끌어서 정한 자료 패널 폭. */
const REFERENCE_WIDTH_KEY = "cooldown.advisor.reference-width";
/** 방향키로 한 번에 움직이는 폭. */
const RESIZE_STEP = 24;

function readReferenceWidth(): number | undefined {
  try {
    const stored = Number(localStorage.getItem(REFERENCE_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
}

/** "모델 없이 써보기" 를 고른 것을 기억하는 열쇠. */
const MODEL_SKIPPED_KEY = "cooldown.advisor.model-skipped";

function readModelSkipped(): boolean {
  try {
    return localStorage.getItem(MODEL_SKIPPED_KEY) === "true";
  } catch {
    return false;
  }
}

function readReferenceOpen(): boolean {
  try {
    return localStorage.getItem(REFERENCE_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

function formatMb(bytes: number): string {
  return (bytes / 1048576).toFixed(0);
}

/** 자료 탭에 쓰는 한 글자짜리 사실 이름. "재사용 대기시간" 은 탭에 안 들어간다. */
const FOCUS_SHORT: Record<SpellFocus, string> = { cooldown: "쿨", cost: "소모", ratio: "계수", damage: "피해", effect: "효과" };

/** `{name}` 같은 자리를 채운다. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export function AdvisorPanel({ advisor, data, history, patch, ddragonVersion, canUseModel, onClose, onWidthChange }: AdvisorPanelProps) {
  const { t, lang } = useTranslation();
  const copy = t.advisor;
  const [draft, setDraft] = useState("");
  // 동의 화면을 건너뛰고 코드 답변만으로 쓰는 선택. 기기에 남는다 — 새로 고칠 때마다
  // 3GB 를 받겠느냐고 다시 묻는 것은 거절한 사람에게 성가시다. 저장 공간 화면에서 다시 받을 수 있다.
  const [skippedModel, setSkippedModelState] = useState(readModelSkipped);
  const setSkippedModel = (skipped: boolean) => {
    setSkippedModelState(skipped);
    try {
      localStorage.setItem(MODEL_SKIPPED_KEY, String(skipped));
    } catch {
      // 기억 못 해도 이번 세션에서는 동작한다
    }
  };
  // 헤더 버튼으로 바꾸는 보조 화면. 저장 공간(모델 삭제) / 대화 기록(새 대화·열기·삭제) /
  // 카드(좁은 화면에서 자료 칩을 눌렀을 때 카드를 덮어 보임)
  const [view, setView] = useState<"chat" | "storage" | "history" | "card">("chat");
  const showStorage = view === "storage";
  const showHistory = view === "history";
  // 넓은 화면(≥1280)이면 왼쪽에 자료 패널을 붙여 대화는 글로만 흐르게 한다(L1).
  // 접을 수 있고, 접은 상태는 기기에 남는다.
  const viewportWidth = useViewportWidth();
  const wide = viewportWidth >= WIDE_VIEWPORT_MIN;
  const isMobile = viewportWidth < 768;
  const [referenceOpen, setReferenceOpen] = useState(readReferenceOpen);
  const setReferenceOpenPersisted = (open: boolean) => {
    setReferenceOpen(open);
    try {
      localStorage.setItem(REFERENCE_OPEN_KEY, String(open));
    } catch {
      // 기억 못 해도 이번 세션에서는 동작한다
    }
  };
  const toggleReference = () => setReferenceOpenPersisted(!referenceOpen);

  // 자료 패널 폭. 사용자가 가장자리를 끌어 정하고, 그 값은 기기에 남는다.
  const [storedWidth, setStoredWidth] = useState(readReferenceWidth);
  const referenceWidth = clampReferenceWidth(storedWidth ?? referencePanelWidth(viewportWidth), viewportWidth);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const applyWidth = (width: number, persist: boolean) => {
    const next = clampReferenceWidth(width, viewportWidth);
    setStoredWidth(next);
    if (!persist) return;
    try {
      localStorage.setItem(REFERENCE_WIDTH_KEY, String(next));
    } catch {
      // 기억 못 해도 이번 세션에서는 동작한다
    }
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 포인터를 잡지 못해도 끌기는 된다. 손이 가장자리를 벗어나면 끝날 뿐이다.
    }
    dragRef.current = { startX: event.clientX, startWidth: referenceWidth };
    setResizing(true);
  };

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // 패널은 드로어 왼쪽에 붙어 있다. 왼쪽으로 끌수록 넓어진다.
    const raw = drag.startWidth + (drag.startX - event.clientX);
    // 최소 폭보다 더 줄이려 하면 그 자리에서 닫는다. 끌다 말고 손을 떼게 하지 않는다.
    if (raw < REFERENCE_MIN_WIDTH - RESIZE_STEP) {
      endResize(event);
      setReferenceOpenPersisted(false);
      return;
    }
    applyWidth(raw, false);
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setResizing(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // 이미 놓였으면 그만이다
    }
    applyWidth(referenceWidth, true);
  };

  const resizeByKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") applyWidth(referenceWidth + RESIZE_STEP, true);
    else if (event.key === "ArrowRight") {
      if (referenceWidth <= REFERENCE_MIN_WIDTH) setReferenceOpenPersisted(false);
      else applyWidth(referenceWidth - RESIZE_STEP, true);
    } else if (event.key === "Home") applyWidth(REFERENCE_MAX_WIDTH, true);
    else if (event.key === "End") applyWidth(REFERENCE_MIN_WIDTH, true);
    else return;
    event.preventDefault();
  };
  // 모바일은 드로어가 전체 화면이라 "화면으로 이동" 을 눌러도 뒤에서만 바뀐다. 이동하면 닫는다.
  const onNavigate = () => {
    if (isMobile) onClose();
  };
  // 자료 패널이 보여 주는 답. 비우면 최신 답을 따라간다. 칩을 누르면 그 답에 고정된다.
  const [refTurnId, setRefTurnId] = useState<number | undefined>(undefined);
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
  /** 상성 카드 + 내 챔피언 시점 해설. 재료는 사람이 검증한 지식 카드만. */
  const deliverMatchup = (question: string, mine: ChampionCard, enemy: ChampionCard, notice?: string) => {
    if (!data) return;
    const answer = buildCompareCard([mine, enemy], question, undefined, { matchup: true, notes: matchupNotes(data, mine, enemy) });
    const prompt = buildCommentaryPrompt(answer, patch);
    if (canUseModel && advisor.consented && prompt) {
      const tips = buildMatchupTips(data, mine, enemy);
      advisor.sendWithAnswer(question, [advisorSystemPrompt(lang), tips, prompt].filter(Boolean).join("\n\n"), answer, notice);
    } else {
      advisor.answerWithoutModel(question, answer, notice);
    }
  };

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

  /** 대화에서 가장 최근에 다룬 아이템. "쇼진의 창 효과" 다음의 "거기 둔화 있어?" 가 여기 기댄다. */
  const recentItem = (): string | undefined => {
    for (let i = advisor.turns.length - 1; i >= 0; i -= 1) {
      const answer = advisor.turns[i].answer;
      if (answer?.kind === "item") return answer.itemId;
    }
    return undefined;
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
        deliverMatchup(question, mine, champions[0], usedNotice);
        return;
      }
    }
    // "오공이랑 말파이트랑 싸우면 누가 유리해?" — 둘을 다 말했고 싸움을 묻는다. 먼저 말한
    // 쪽이 내 챔피언이다. 능력치 비교표가 아니라 상성 카드와 시점 있는 해설, 그리고 VS 링크.
    if (champions.length === 2 && asksMatchup(question)) {
      deliverMatchup(question, champions[0], champions[1], usedNotice);
      return;
    }

    // 4. 이름이 아예 없다. 아이템·게임 규칙 이름이면 그것이 답이다. 맥락 챔피언을 붙이기
    //    전에 본다 — 말파이트 표를 보며 "쇼진의 창 효과" 를 물으면 아이템 질문이다.
    if (champions.length === 0) {
      const itemAnswer = buildItemCard(data, question, recentItem());
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
          deliver(question, { kind: "champion", card, view: "skills", notes: championNotes(data, card, "combo") }, usedNotice);
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

  // 자료 패널에 올릴 답. 카드로 그릴 만한 종류(스킬·챔피언·비교)만. 규칙은 짧아 대화 안에 둔다.
  const isReference = (turn: AdvisorTurn): boolean =>
    turn.role === "assistant" &&
    !!turn.answer &&
    (turn.answer.kind === "spell" ||
      turn.answer.kind === "champion" ||
      turn.answer.kind === "compare" ||
      turn.answer.kind === "item");
  const referenceTurns = advisor.turns.filter(isReference);
  const latestReference = referenceTurns[referenceTurns.length - 1];
  const refTurn = referenceTurns.find((turn) => turn.id === refTurnId) ?? latestReference;
  // 새 답이 오면 고정을 풀어 최신 답을 따라간다.
  useEffect(() => {
    setRefTurnId(undefined);
  }, [lastAssistantId]);
  const showReference = (turnId: number) => {
    setRefTurnId(turnId);
    if (!wide) {
      setView("card");
      return;
    }
    // 넓은 화면이라도 패널을 접어 뒀으면 눌러도 아무 일이 없어 보인다. 접혀 있으면 펼친다.
    if (!referenceOpen) toggleReference();
  };

  const referenceTitle = (answer: AdvisorAnswer): { title: string; kind: string } => {
    switch (answer.kind) {
      case "spell":
        return { title: `${answer.championName} · ${answer.spell.slot} ${answer.spell.name}`, kind: copy.card.spell };
      case "champion":
        return {
          title: answer.card.name,
          kind: answer.focus
            ? `${copy.card.skills} · ${FOCUS_LABEL[answer.focus]}`
            : answer.view === "skills"
              ? copy.card.skills
              : copy.card.champion,
        };
      case "compare":
        return { title: answer.cards.map((card) => card.name).join(" vs "), kind: answer.matchup ? copy.card.matchupTool : copy.card.compare };
      case "item":
        return { title: answer.itemName, kind: copy.card.item };
      default:
        return { title: "", kind: "" };
    }
  };

  const linkLabel = (link: ReturnType<typeof answerLinks>[number]): string => {
    switch (link.kind) {
      case "vs":
        return fill(copy.card.goVs, { a: link.names[0], b: link.names[1] });
      case "runes":
        return copy.card.goRunes;
      case "summoner":
        return copy.card.goSummoner;
      case "item":
        return fill(copy.card.goItem, { name: link.name });
    }
  };

  // 자료 패널의 탭 줄(R1). 이 대화에서 나온 카드가 자료별로 하나씩, 최근에 나온 것이 오른쪽.
  // 같은 자료가 다시 나오면 탭을 새로 만들지 않고 오른쪽 끝으로 옮긴다.
  const referenceTabs = (() => {
    const byKey = new Map<string, AdvisorTurn>();
    for (const turn of referenceTurns) {
      const key = answerKey(turn.answer!);
      byKey.delete(key);
      byKey.set(key, turn);
    }
    return [...byKey.values()];
  })();
  const activeTabKey = refTurn?.answer ? answerKey(refTurn.answer) : undefined;
  /** 탭 이름. 300px 에 여섯 개쯤 들어가야 하니 아이콘 + 한두 글자. */
  const tabLabel = (answer: AdvisorAnswer): string => {
    switch (answer.kind) {
      case "spell":
        return answer.spell.slot;
      case "champion":
        return answer.focus ? FOCUS_SHORT[answer.focus] : answer.view === "skills" ? copy.card.skills : copy.card.champion;
      case "compare":
        return answer.matchup ? copy.card.matchupTool : copy.card.compare;
      case "item":
        return answer.itemName;
      default:
        return "";
    }
  };
  /** 탭·칩 앞에 붙는 그림. 챔피언 답은 챔피언 아이콘, 아이템 답은 아이템 아이콘. */
  const answerIcons = (answer: AdvisorAnswer): string[] =>
    answer.kind === "item"
      ? [itemIconUrl(ddragonVersion, answer.itemId)]
      : answerChampionIds(answer).slice(0, 2).map((id) => championIconUrl(ddragonVersion, id));
  const referenceTabStrip = referenceTabs.length > 1 && (
    <div className="flex gap-1 overflow-x-auto border-b px-2 pt-1.5 text-[11px] [scrollbar-width:thin]">
      {referenceTabs.map((turn) => {
        const answer = turn.answer!;
        const active = answerKey(answer) === activeTabKey;
        return (
          <button
            key={answerKey(answer)}
            type="button"
            onClick={() => setRefTurnId(turn.id)}
            ref={active ? (node) => node?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
            title={`${referenceTitle(answer).title} · ${referenceTitle(answer).kind}`}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-t-md border-b-2 px-2 py-1.5 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 ${
              active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex -space-x-1">
              {answerIcons(answer).map((src) => (
                <img key={src} src={src} alt="" width={14} height={14} className="h-3.5 w-3.5 rounded-sm ring-1 ring-background" />
              ))}
            </span>
            {tabLabel(answer)}
          </button>
        );
      })}
    </div>
  );

  const drawerWidth = advisorDrawerWidth(viewportWidth, referenceOpen, storedWidth);
  // 보여 줄 카드가 없으면(동의 화면, 빈 대화) 패널을 두지 않는다. 첫 카드가 오면 그때 넓어진다.
  const showingConsent = canUseModel && !advisor.consented && !skippedModel;
  const showReferencePanel = wide && referenceOpen && view === "chat" && referenceTurns.length > 0 && !showingConsent;
  useEffect(() => {
    onWidthChange?.(drawerWidth);
  }, [drawerWidth, onWidthChange]);

  const percent =
    advisor.progress.totalBytes > 0
      ? Math.min(100, Math.round((advisor.progress.loadedBytes / advisor.progress.totalBytes) * 100))
      : 0;

  return (
    <div
      role="dialog"
      aria-label={copy.title}
      className="fixed inset-0 z-50 flex overflow-hidden bg-background shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[var(--drawer-w)] md:border-l"
      style={{ "--drawer-w": `${drawerWidth}px` } as React.CSSProperties}
    >
      {/*
        자료 패널(L1). 대화는 오른쪽에 글로만 흐르고, 답의 카드는 여기 한 자리에서 갱신된다.
        같은 오공 카드가 열 번 나와도 여기 하나다. 표를 보면서 다음 질문을 칠 수 있다.
      */}
      {showReferencePanel && (
        <aside
          className="relative hidden shrink-0 flex-col border-r bg-muted/30 md:flex"
          style={{ width: `${referenceWidth}px` }}
        >
          {/*
            왼쪽 가장자리를 끌어 폭을 바꾼다. 최소 폭보다 더 줄이려 하면 그 자리에서 닫는다.
            방향키로도 움직인다 — 가장자리를 정확히 집기 어려운 사람에게는 그것이 유일한 길이다.
          */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={copy.card.resizeReference}
            aria-valuenow={referenceWidth}
            aria-valuemin={REFERENCE_MIN_WIDTH}
            aria-valuemax={REFERENCE_MAX_WIDTH}
            tabIndex={0}
            onPointerDown={startResize}
            onPointerMove={moveResize}
            onPointerUp={endResize}
            onPointerCancel={endResize}
            onKeyDown={resizeByKey}
            className={`absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 ${
              resizing ? "bg-primary/40" : "hover:bg-primary/20"
            }`}
          />
          <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
            <span className="font-semibold">{copy.card.reference}</span>
            {refTurn?.answer && (
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {referenceTitle(refTurn.answer).title} · {referenceTitle(refTurn.answer).kind}
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={toggleReference} aria-label={copy.card.collapseReference}>
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
          {referenceTabStrip}
          <div className="flex-1 overflow-y-auto p-3">
            {refTurn?.answer ? (
              <AdvisorAnswerCard answer={refTurn.answer} ddragonVersion={ddragonVersion} patch={patch} onPickChampion={pickChampion} onNavigate={onNavigate} />
            ) : (
              <p className="text-xs text-muted-foreground">{copy.card.referenceEmpty}</p>
            )}
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          {view !== "chat" && (
            <Button variant="ghost" size="icon" className="-ml-2 h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => setView("chat")} aria-label={copy.storage.back}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <span className="shrink-0 text-sm font-semibold">
            {showStorage ? copy.storage.title : showHistory ? copy.history.title : view === "card" ? copy.card.reference : copy.title}
          </span>
          {/* 카드 화면은 대화를 덮으므로 지금 무엇을 보고 있는지 머리에 적는다. */}
          {view === "card" && refTurn?.answer && (
            <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
              › {referenceTitle(refTurn.answer).title} · {referenceTitle(refTurn.answer).kind}
            </span>
          )}
          {view === "chat" && advisor.status === "generating" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {copy.status.generating}
            </span>
          )}
        </div>
        {view === "chat" && !showingConsent && (
          <div className="flex items-center gap-1">
            {/*
              자료. 넓은 화면에서는 왼쪽 패널을 접고 펴고, 좁은 화면에서는 카드 화면을 연다.
              대화 안의 칩을 찾지 않고도 자료로 바로 가는 길이다.
            */}
            {referenceTurns.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => (wide ? toggleReference() : setView("card"))}
                aria-label={copy.card.toggleReference}
                aria-pressed={wide ? referenceOpen : undefined}
                className={wide && referenceOpen ? "text-primary hover:bg-primary/10 hover:text-primary" : "text-muted-foreground hover:text-foreground"}
              >
                {wide && referenceOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </Button>
            )}
            {/* 대화는 지우는 것이 아니라 새로 시작한다. 지난 대화는 기록에 남아 다시 열 수 있다. */}
            {advisor.turns.length > 0 && (
              <Button variant="ghost" size="icon" disabled={busy} onClick={history.startNew} aria-label={copy.history.newChat} className="text-muted-foreground hover:text-foreground">
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => setView("history")} aria-label={copy.history.open}>
              <History className="h-4 w-4" />
            </Button>
            {/* 3GB 는 받아 두면 계속 남는다. 지울 길을 눈에 보이는 곳에 둔다. */}
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={() => setView("storage")} aria-label={copy.storage.open}>
              <HardDrive className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={onClose} aria-label={copy.close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {(view !== "chat" || showingConsent) && (
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" onClick={onClose} aria-label={copy.close}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </header>

      {showStorage ? (
        <AdvisorStorage
          onDelete={advisor.deleteModel}
          // 모델 없이 쓰기로 했던 사람이 마음을 바꾸는 길. 동의 화면이 다시 뜨지 않으므로 여기서 받는다.
          onDownload={canUseModel && !advisor.consented ? () => {
            setSkippedModel(false);
            advisor.accept();
            setView("chat");
          } : undefined}
        />
      ) : view === "card" ? (
        // 좁은 화면에서 자료 칩을 눌렀을 때. 카드가 대화를 덮고, 뒤로 가면 대화다.
        <>
        {referenceTabStrip}
        <div className="flex-1 overflow-y-auto p-4">
          {refTurn?.answer ? (
            <AdvisorAnswerCard answer={refTurn.answer} ddragonVersion={ddragonVersion} patch={patch} onPickChampion={pickChampion} onNavigate={onNavigate} />
          ) : (
            <p className="text-xs text-muted-foreground">{copy.card.referenceEmpty}</p>
          )}
        </div>
        </>
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
      ) : showingConsent ? (
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
                      className="rounded-md border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-accent-foreground"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {advisor.turns.map((turn, index) => {
              // 직전 답과 같은 자료면 칩만 흐리게. "오공 Q 쿨, W 쿨" 은 카드 두 장이 아니다.
              const previousAnswer = advisor.turns
                .slice(0, index)
                .reverse()
                .find((entry) => entry.role === "assistant" && entry.answer)?.answer;
              const sameAsPrevious =
                Boolean(turn.answer && previousAnswer && answerKey(turn.answer) === answerKey(previousAnswer));
              // 같은 챔피언을 이어 물으면 "VS 화면으로 이동" 이 답마다 붙는다. 직전 답에 있던 링크는 뺀다.
              const previousLinkTargets = new Set(previousAnswer ? answerLinks(previousAnswer).map((link) => link.to) : []);
              const links = turn.answer ? answerLinks(turn.answer).filter((link) => !previousLinkTargets.has(link.to)) : [];
              // 자료 칩과 같은 줄에 둔다. 따로 두면 버튼이 두 줄로 쌓여 어지럽다.
              const linkButtons = links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={onNavigate}
                  className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  {linkLabel(link)}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ));
              const commentary = turn.content ? (
                <div className="border-l-2 border-border pl-2.5 text-[13px] leading-relaxed">
                  <span className="block text-[11px] text-muted-foreground">{copy.card.commentary}</span>
                  <AdvisorMarkdown text={turn.content} />
                </div>
              ) : busy && turn.id === lastAssistantId ? (
                <span className="flex items-center gap-2 pl-2.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {copy.card.commentaryPending}
                </span>
              ) : null;
              return (
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
                {turn.answer && isReference(turn) ? (
                  // 카드는 자료 패널에 있다(L1). 대화에는 질문이 짚은 사실 한 줄, 해설, 자료 칩만.
                  <div className="space-y-2">
                    {turn.answer.kind === "spell" && turn.answer.headline && (
                      <div className="border-l-2 border-foreground pl-2.5">
                        <div className="text-[15px] font-semibold tabular-nums">{turn.answer.headline.value}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {turn.answer.spell.slot} {turn.answer.spell.name} · {turn.answer.headline.label}
                        </div>
                      </div>
                    )}
                    {turn.answer.kind === "spell" && turn.answer.highlighted.length > 0 && (
                      <div className="space-y-1 rounded-md bg-muted px-2.5 py-2 text-[13px] font-semibold leading-relaxed">
                        {turn.answer.highlighted.map((sentence) => (
                          <p key={sentence}>{sentence}</p>
                        ))}
                      </div>
                    )}
                    {turn.answer.kind === "spell" && !turn.answer.headline && turn.answer.highlighted.length === 0 && (
                      // "W는?" 처럼 사실을 짚지 않았으면 스킬이 무엇을 하는지 한 줄. 표는 자료 패널에.
                      <p className="text-[13px] leading-relaxed">{spellSummary(turn.answer.spell)}</p>
                    )}
                    {turn.answer.kind === "item" && (
                      // A3: 판정이 있으면 그것이 답이고, 없으면 효과 이름 한 줄 + 설명.
                      // 능력치 표와 가격은 카드에 있다.
                      <div className="space-y-2">
                        {/* 다른 답의 헤드라인과 같은 꼴 — 세로선 하나와 굵기로 짚는다. */}
                        {turn.answer.verdicts.map((verdict) => (
                          <div key={verdict.tag} className="border-l-2 border-foreground pl-2.5">
                            <div className="text-[15px] font-semibold">
                              {verdict.yes ? copy.card.verdictYes : copy.card.verdictNo}
                            </div>
                            <p className="text-[13px] leading-relaxed">
                              {verdict.evidence ?? fill(copy.card.itemNoTag, { name: turn.answer!.kind === "item" ? turn.answer!.itemName : "", tag: verdict.tag })}
                            </p>
                          </div>
                        ))}
                        {turn.answer.verdicts.length === 0 && (
                          <>
                            <div className="border-l-2 border-foreground pl-2.5">
                              <div className="text-[15px] font-semibold">{itemHeadline(turn.answer)}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {fill(copy.card.itemEffectCount, { name: turn.answer.itemName, n: turn.answer.effects.length })}
                              </div>
                            </div>
                            <ul className="space-y-1 text-[13px] leading-relaxed">
                              {turn.answer.effects.map((effect) => (
                                <li key={`${effect.name}${effect.text}`}>
                                  {effect.name && (
                                    <span className="font-semibold">
                                      {effect.name}
                                      {effect.active && <span className="ml-1 text-[11px] font-normal text-muted-foreground">({copy.card.itemActive})</span>}
                                      {effect.text ? " — " : ""}
                                    </span>
                                  )}
                                  {effect.text}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                    {turn.answer.kind === "compare" && turn.answer.headline && (
                      <div className="border-l-2 border-foreground pl-2.5">
                        <div className="text-[15px] font-semibold tabular-nums">{turn.answer.headline.value}</div>
                        <div className="text-[11px] text-muted-foreground">{turn.answer.headline.label}</div>
                      </div>
                    )}
                    {commentary}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => showReference(turn.id)}
                        aria-label={copy.card.openCard}
                        className={`flex min-w-0 max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${
                          wide && refTurn?.id === turn.id ? "border-primary bg-primary/5" : "bg-background"
                        } ${sameAsPrevious ? "text-muted-foreground" : ""}`}
                      >
                        <span className="flex shrink-0 -space-x-1.5">
                          {answerIcons(turn.answer).map((src) => (
                            <img key={src} src={src} alt="" width={18} height={18} className="h-[18px] w-[18px] rounded ring-1 ring-background" />
                          ))}
                        </span>
                        <span className="truncate font-medium">{referenceTitle(turn.answer).title}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {sameAsPrevious ? copy.card.sameReference : referenceTitle(turn.answer).kind}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-primary" />
                      </button>
                      {linkButtons}
                    </div>
                  </div>
                ) : turn.answer ? (
                  // 규칙·오타 후보·글은 짧아서 대화 안에 그대로 둔다.
                  <div className="space-y-2">
                    <AdvisorAnswerCard
                      answer={turn.answer}
                      ddragonVersion={ddragonVersion}
                      patch={patch}
                      onPickChampion={pickChampion}
                      onNavigate={onNavigate}
                    />
                    {commentary}
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
                {/* 카드 없는 답(규칙)의 바로 가기. 카드가 있는 답은 자료 칩 옆에 이미 붙였다. */}
                {turn.role === "assistant" && linkButtons.length > 0 && !isReference(turn) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">{linkButtons}</div>
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
                          : "text-muted-foreground transition-colors hover:text-foreground"
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
                          : "text-muted-foreground transition-colors hover:text-foreground"
                      }
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              );
            })}
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
              className="max-h-32 min-h-9 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-hidden transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40"
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
    </div>
  );
}
