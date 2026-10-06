/**
 * 롤 지식 질의 패널
 *
 * 화면 오른쪽 아래에 떠 있고, 동의 전에는 동의 화면을, 그 뒤에는 대화를 보여 준다.
 * 모델 적재는 수십 초가 걸리므로 진행률을 파일 합계로 계속 보여 준다.
 */
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";
import type { AdvisorData } from "@/lib/advisor/context";
import { referenceKey } from "@/lib/advisor/referenceIdentity";
import type { ChampionCard } from "@/lib/knowledge/facts";
import { usePageContext } from "@/hooks/usePageContext";
import { WIDE_VIEWPORT_MIN, useViewportWidth } from "@/hooks/useWideViewport";
import type { UseAdvisorResult } from "@/hooks/useAdvisor";
import type { UseAdvisorHistoryResult } from "@/hooks/useAdvisorHistory";
import { AdvisorConsent } from "./AdvisorConsent";
import { AdvisorHistory } from "./AdvisorHistory";
import { AdvisorStorage } from "./AdvisorStorage";
import { AdvisorHeader, type AdvisorView } from "./AdvisorHeader";
import { ReferenceAside, ReferenceCard, ReferenceTabs, referenceTabsOf } from "./AdvisorReference";
import { AdvisorConversation } from "./AdvisorConversation";
import { AdvisorComposer } from "./AdvisorComposer";
import { useAskAdvisor } from "./useAskAdvisor";
import { useReferencePanelSize } from "./useReferencePanelSize";
import { useDrawerWheelTrap } from "./useDrawerWheelTrap";
import { useMobileAdvisorViewport } from "./useMobileAdvisorViewport";
import { useReferenceSelection } from "./useReferenceSelection";
import { HistoryReference, HistorySaveFailure } from "./HistoryReference";

interface AdvisorPanelProps {
  advisor: UseAdvisorResult;
  /** 챔피언·규칙 자료. 위젯이 받아 둔다. 아직 없으면 모델만으로 답한다. */
  data: AdvisorData | null;
  dataError: boolean;
  onRetryData: () => void;
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

/** "모델 없이 써보기" 를 고른 것을 기억하는 열쇠. */
const MODEL_SKIPPED_KEY = "cooldown.advisor.model-skipped";

function readModelSkipped(): boolean {
  try {
    return localStorage.getItem(MODEL_SKIPPED_KEY) === "true";
  } catch {
    return false;
  }
}

function formatMb(bytes: number): string {
  return (bytes / 1048576).toFixed(0);
}

export function AdvisorPanel({ advisor, data, dataError, onRetryData, history, patch, ddragonVersion, canUseModel, onClose, onWidthChange }: AdvisorPanelProps) {
  const { t } = useTranslation();
  const copy = t.advisor;
  const [draft, setDraft] = useState("");
  // 동의 화면을 건너뛰고 코드 답변만으로 쓰는 선택. 기기에 남는다 — 새로 고칠 때마다
  // 모델(570MB)을 받겠느냐고 다시 묻는 것은 거절한 사람에게 성가시다. 저장 공간 화면에서 다시 받을 수 있다.
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
  const [view, setView] = useState<AdvisorView>("chat");
  // 넓은 화면(≥1280)이면 왼쪽에 자료 패널을 붙여 대화는 글로만 흐르게 한다(L1).
  const viewportWidth = useViewportWidth();
  const wide = viewportWidth >= WIDE_VIEWPORT_MIN;
  const isMobile = viewportWidth < 768;
  // 지금 화면에 떠 있는 챔피언·탭. 이름을 생략한 질문과 빈 화면 예시가 여기에 기댄다.
  const context = usePageContext();
  const referenceSize = useReferencePanelSize(viewportWidth, context.route);
  const { referenceOpen, toggleReference, drawerWidth } = referenceSize;
  // 모바일은 드로어가 전체 화면이라 "화면으로 이동" 을 눌러도 뒤에서만 바뀐다. 이동하면 닫는다.
  const onNavigate = () => {
    if (isMobile) onClose();
  };
  // 생성 중에 보내려 했는지. 조용히 먹히면 고장으로 보여서 한 줄 알린다.
  const [pressedWhileBusy, setPressedWhileBusy] = useState(false);
  const { ask, showDoc, askPerspective, pickChampion } = useAskAdvisor({ advisor, data, patch, championIds: context.championIds, canUseModel });

  // 답을 찾는 중(판정기·노트)과 코드 답을 흘려 보이는 중에도 바쁘다. 그 사이 새 질문이 끼면 자리가 엉킨다.
  const busy = advisor.status === "generating" || advisor.working;
  // 모델이 아직 안 올라왔으면 진행률을 계속 보여 준다.
  // 적재 중에 질문을 받으면 상태가 generating 으로 바뀌는데, 그때 진행률을 감추면
  // 사용자는 몇 분 동안 도는 점만 보게 된다.
  const loading =
    canUseModel &&
    !advisor.modelReady &&
    advisor.consented &&
    advisor.status !== "idle" &&
    advisor.status !== "error";

  const scrollRef = useRef<HTMLDivElement>(null);
  /*
   * 새 답이 오면 그 답의 **머리**를 화면 위로 맞춘다.
   *
   * 예전에는 턴이 바뀔 때마다 맨 아래로 붙였다. 짧은 답일 때는 그게 맞았는데,
   * 해설이 길어진 지금은 도착하자마자 끝으로 밀려나 첫 문장을 못 본다. 스트리밍
   * 중에도 계속 끌려 내려가 읽던 자리를 잃는다.
   *
   * 그래서 턴이 **늘어났을 때만** 새 답의 첫 줄로 맞추고, 그 뒤 글자가 차오르는
   * 동안에는 건드리지 않는다. 읽는 자리는 사용자가 정한다.
   */
  const lastTurnRef = useRef<HTMLDivElement | null>(null);
  const turnCount = advisor.turns.length;
  useEffect(() => {
    const node = lastTurnRef.current;
    const box = scrollRef.current;
    if (!node || !box) return;
    // 사용자가 보낸 줄이 위에 보이도록 조금 여유를 둔다.
    const top = node.offsetTop - 12;
    box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [turnCount]);

  const submit = () => {
    const question = draft.trim();
    if (!question || history.restoring) return;
    if (busy) {
      setPressedWhileBusy(true);
      return;
    }
    setPressedWhileBusy(false);
    void ask(question);
    setDraft("");
  };

  // 빈 화면과 입력창 안내는 화면 맥락을 따른다. 말파이트 표를 보고 있으면 말파이트 예시.
  const contextCards = data
    ? context.championIds.map((id) => data.cardById.get(id)).filter((card): card is ChampionCard => Boolean(card))
    : [];
  const placeholder = contextCards.length
    ? fill(copy.card.askAbout, { name: contextCards.map((card) => card.name).join("·") })
    : copy.placeholder;
  const { isReference, referenceTurns, refTurn, selectReference, lastAssistantId } = useReferenceSelection(advisor.turns, wide);
  const showReference = (turnId: number) => {
    selectReference(turnId);
    if (!wide) {
      setView("card");
      return;
    }
    // 넓은 화면이라도 패널을 접어 뒀으면 눌러도 아무 일이 없어 보인다. 접혀 있으면 펼친다.
    if (!referenceOpen) toggleReference();
  };
  const referenceTabStrip = (
    <ReferenceTabs
      tabs={referenceTabsOf(referenceTurns)}
      activeKey={refTurn?.answer ? referenceKey(refTurn.answer, refTurn.source) : undefined}
      onSelect={selectReference}
      ddragonVersion={ddragonVersion}
    />
  );

  // 보여 줄 카드가 없으면(동의 화면, 빈 대화) 패널을 두지 않는다. 첫 카드가 오면 그때 넓어진다.
  const showingConsent = canUseModel && !advisor.consented && !skippedModel;
  /*
   * 이 기기가 모델을 못 쓰는 사유. 쓸 수 있으면, 그리고 아직 어댑터를 확인하는
   * 중이면(`webgpu === null`) 아무 말도 하지 않는다. 확인이 끝나기 전에
   * "이 기기에서는 내려받지 않습니다" 를 띄우면 멀쩡한 기기에 없는 말을 하는 셈이다.
   */
  const unavailableReason =
    canUseModel || advisor.webgpu === null
      ? undefined
      : advisor.webgpu.supported && !advisor.webgpu.f16
        ? copy.modelUnavailableNoF16
        : copy.modelUnavailable;
  const showReferencePanel = wide && referenceOpen && view === "chat" && referenceTurns.length > 0 && !showingConsent;
  useEffect(() => {
    onWidthChange?.(drawerWidth);
  }, [drawerWidth, onWidthChange]);

  const drawerRef = useDrawerWheelTrap();
  useMobileAdvisorViewport(isMobile, drawerRef);

  return (
    <Dialog.Root open modal={isMobile} onOpenChange={(opened) => { if (!opened) onClose(); }}>
    <Dialog.Portal container={document.body}>
    <Dialog.Content
      asChild
      aria-describedby={undefined}
      onInteractOutside={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>("[data-advisor-launcher]")?.focus());
      }}
    >
    <div
      ref={drawerRef}
      role="dialog"
      aria-label={copy.title}
      aria-modal={isMobile || undefined}
      className="fixed inset-x-0 top-[var(--advisor-viewport-top,0px)] z-50 flex h-[var(--advisor-viewport-height,100dvh)] overflow-hidden overscroll-none bg-background shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[var(--drawer-w)] md:border-l"
      style={{ "--drawer-w": `${drawerWidth}px` } as React.CSSProperties}
    >
      <Dialog.Title className="sr-only">{copy.title}</Dialog.Title>
      {showReferencePanel && (
        <HistoryReference turn={refTurn}>
        <ReferenceAside
          size={referenceSize}
          tabs={referenceTabStrip}
          answer={refTurn?.answer}
          ddragonVersion={ddragonVersion}
          patch={patch}
          onPickChampion={pickChampion}
          onNavigate={onNavigate}
        />
        </HistoryReference>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <AdvisorHeader
        view={view}
        onViewChange={setView}
        busy={busy}
        showingConsent={showingConsent}
        cardAnswer={refTurn?.answer}
        hasReferences={referenceTurns.length > 0}
        hasTurns={advisor.turns.length > 0}
        wide={wide}
        referenceOpen={referenceOpen}
        onToggleReference={toggleReference}
        onNewChat={history.startNew}
        onClose={onClose}
      />

      {view === "storage" ? (
        <AdvisorStorage
          onDelete={advisor.deleteModel}
          // 못 받는 기기에서는 이유를 말한다. 단추도 없이 "모델이 없습니다" 만 뜨면
          // 길이 막힌 것인지 화면이 덜 그려진 것인지 알 수 없다.
          unavailable={unavailableReason}
          /*
           * 다시 받는 길. 이 화면이 그 유일한 입구다.
           *
           * 거절했거나("나중에", "모델 없이 써보기") 지운 뒤에는 동의 화면이 다시
           * 뜨지 않는다. `!consented` 로만 열어 두면 조건이 어긋날 때 길이 통째로
           * 막히므로, 모델을 쓸 수 있는 기기면 항상 열어 둔다. 실제로 받을지는
           * 이 화면이 캐시가 비었을 때만 단추를 보이는 것으로 가린다.
           */
          onDownload={canUseModel ? () => {
            setSkippedModel(false);
            advisor.accept();
            setView("chat");
          } : undefined}
        />
      ) : view === "card" ? (
        // 좁은 화면에서 자료 칩을 눌렀을 때. 카드가 대화를 덮고, 뒤로 가면 대화다.
        <>
        {referenceTabStrip}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          <HistoryReference turn={refTurn}>
          <ReferenceCard answer={refTurn?.answer} ddragonVersion={ddragonVersion} patch={patch} onPickChampion={pickChampion} onNavigate={onNavigate} />
          </HistoryReference>
        </div>
        </>
      ) : view === "history" ? (
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
          model={advisor.model}
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
            모델(570MB)을 못 받는다고 챔피언·아이템·규칙 조회까지 막을 이유는 없다.
          */}
          {/*
            모델을 못 쓰는 기기라는 안내는 **대화를 시작하기 전에만** 둔다.
            계속 붙여 두면 좁은 화면에서 60px 을 내내 먹는데, 한 번 읽으면 그 뒤로는
            답이 스스로 그 사실을 말한다(해설 없이 카드만 온다).
          */}
          {unavailableReason && advisor.turns.length === 0 && (
            <p className="border-b px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
              {/* WebGPU 는 도는데 f16 만 없는 경우에는 사유를 짚어 준다. 윈도우에서 흔하다. */}
              {unavailableReason}
            </p>
          )}
          {loading && <ModelLoadingProgress progress={advisor.progress} />}

          <AdvisorConversation
            scrollRef={scrollRef}
            lastTurnRef={lastTurnRef}
            turns={advisor.turns}
            error={advisor.error}
            loading={loading || history.restoring}
            busy={busy}
            contextCards={contextCards}
            context={context}
            isReference={isReference}
            shownReferenceId={wide ? refTurn?.id : undefined}
            lastAssistantId={lastAssistantId}
            ddragonVersion={ddragonVersion}
            patch={patch}
            onAsk={(question) => void ask(question)}
            onShowReference={showReference}
            onAskPerspective={askPerspective}
            onShowDoc={showDoc}
            onPickChampion={pickChampion}
            onNavigate={onNavigate}
          />

          {dataError && (
            <div role="alert" className="flex items-center gap-3 border-t px-4 py-3 text-sm text-muted-foreground">
              {t.app.loadError}
              <Button onClick={onRetryData} variant="outline" className="h-11">{t.app.retry}</Button>
            </div>
          )}
          <AdvisorComposer
            draft={draft}
            onDraftChange={setDraft}
            busy={busy}
            restoringHistory={history.restoring}
            restoreError={dataError}
            showBusyHint={pressedWhileBusy && busy}
            placeholder={placeholder}
            onSubmit={submit}
            onStop={advisor.stop}
          />
        </>
      )}
      <HistorySaveFailure failed={history.saveFailed} onRetry={history.retrySave} />
      </div>
    </div>
    </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  );
}

/** 모델 내려받기·적재 진행률. 파일을 다 받은 뒤에는 데우는 중이라고 적는다. */
function ModelLoadingProgress({ progress }: { progress: UseAdvisorResult["progress"] }) {
  const { t } = useTranslation();
  const copy = t.advisor;
  const percent =
    progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100))
      : 0;
  return (
    <div className="border-b px-4 py-3 text-xs text-muted-foreground">
      <div className="mb-2 flex items-center justify-between">
        <span>
          {progress.totalBytes > 0 &&
          progress.loadedBytes >= progress.totalBytes
            ? copy.status.warming
            : copy.status.downloading}
        </span>
        {progress.totalBytes > 0 && (
          <span>
            {formatMb(progress.loadedBytes)} / {formatMb(progress.totalBytes)} MB
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
  );
}
