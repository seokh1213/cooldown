/**
 * 자료 패널(L1) — 대화는 오른쪽에 글로만 흐르고, 답의 카드는 이 한 자리에서 갱신된다.
 * 좁은 화면에서는 같은 탭 줄과 카드가 대화를 덮는 카드 화면으로 뜬다.
 */
import { PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemIcon } from "@/components/ui/item-icon";
import { ChampionIcon } from "@/components/ui/champion-icon";
import { useTranslation } from "@/i18n";
import type { Translations } from "@/i18n/translations";
import { REFERENCE_MAX_WIDTH, REFERENCE_MIN_WIDTH } from "@/hooks/useWideViewport";
import type { AdvisorTurn } from "@/hooks/useAdvisorTurns";
import { answerChampionIds, type AdvisorAnswer } from "@/lib/advisor/answer";
import { referenceKey } from "@/lib/advisor/referenceIdentity";
export { referenceTabsOf } from "@/lib/advisor/referenceIdentity";
import { AdvisorAnswerCard } from "./AdvisorAnswerCard";
import type { useReferencePanelSize } from "./useReferencePanelSize";

export function referenceTitle(answer: AdvisorAnswer, copy: Translations["advisor"]): { title: string; kind: string } {
  switch (answer.kind) {
    case "spell":
      return { title: answer.championName, kind: copy.card.skills };
    case "champion":
      return {
        title: answer.card.name,
        kind: answer.focus || answer.view === "skills" ? copy.card.skills : copy.card.champion,
      };
    case "compare":
      return { title: answer.cards.map((card) => card.name).join(" vs "), kind: answer.matchup ? copy.card.matchupTool : copy.card.compare };
    case "item":
      return { title: answer.itemName, kind: copy.card.item };
    default:
      return { title: "", kind: "" };
  }
}

/** 챔피언 탭은 이름으로 구분하고, 같은 챔피언의 스킬·조회 항목도 함께 표시한다. */
function tabLabel(answer: AdvisorAnswer, copy: Translations["advisor"]): string {
  switch (answer.kind) {
    case "spell":
      return `${answer.championName} · ${copy.card.skills}`;
    case "champion":
      return answer.focus || answer.view === "skills" ? `${answer.card.name} · ${copy.card.skills}` : answer.card.name;
    case "compare":
      return answer.matchup ? copy.card.matchupTool : copy.card.compare;
    case "item":
      return answer.itemName;
    default:
      return "";
  }
}

/** 탭·칩 앞에 붙는 그림. 챔피언 답은 챔피언 아이콘, 아이템 답은 아이템 아이콘. 아이템은 낱장 주소, 챔피언은 시트에서 자른다. */
export function AnswerIcons({ answer, ddragonVersion, className }: { answer: AdvisorAnswer; ddragonVersion: string; className: string }) {
  return answer.kind === "item" ? (
    <ItemIcon id={answer.itemId} ddragonVersion={ddragonVersion} className={`block ${className}`} />
  ) : (
    answerChampionIds(answer)
      .slice(0, 2)
      .map((id) => <ChampionIcon key={id} id={id} ddragonVersion={ddragonVersion} className={`block ${className}`} />)
  );
}

interface ReferenceTabsProps {
  tabs: AdvisorTurn[];
  activeKey: string | undefined;
  onSelect: (turnId: number) => void;
  ddragonVersion: string;
}

export function ReferenceTabs({ tabs, activeKey, onSelect, ddragonVersion }: ReferenceTabsProps) {
  const { t } = useTranslation();
  const copy = t.advisor;
  if (tabs.length <= 1) return null;
  return (
    <div className="flex gap-1 overflow-x-auto border-b px-2 pt-1.5 text-[11px] [scrollbar-width:thin]">
      {tabs.map((turn) => {
        const answer = turn.answer!;
        const active = referenceKey(answer) === activeKey;
        return (
          <button
            key={referenceKey(answer)}
            type="button"
            onClick={() => onSelect(turn.id)}
            ref={active ? (node) => node?.scrollIntoView({ block: "nearest", inline: "nearest" }) : undefined}
            title={`${referenceTitle(answer, copy).title} · ${referenceTitle(answer, copy).kind}`}
            aria-pressed={active}
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-t-md border-b-2 px-2 py-1.5 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 ${
              active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex -space-x-1">
              <AnswerIcons answer={answer} ddragonVersion={ddragonVersion} className="h-3.5 w-3.5 rounded-sm ring-1 ring-background" />
            </span>
            {tabLabel(answer, copy)}
          </button>
        );
      })}
    </div>
  );
}

interface ReferenceCardProps {
  answer: AdvisorAnswer | undefined;
  ddragonVersion: string;
  patch: string;
  onPickChampion: (championId: string) => void;
  onNavigate: () => void;
}

interface ReferenceAsideProps extends ReferenceCardProps {
  size: Pick<ReturnType<typeof useReferencePanelSize>, "referenceWidth" | "resizing" | "resizeHandlers" | "toggleReference">;
  tabs: React.ReactNode;
}

/*
  자료 패널(L1). 대화는 오른쪽에 글로만 흐르고, 답의 카드는 여기 한 자리에서 갱신된다.
  같은 오공 카드가 열 번 나와도 여기 하나다. 표를 보면서 다음 질문을 칠 수 있다.
*/
export function ReferenceAside({ size, tabs, answer, ddragonVersion, patch, onPickChampion, onNavigate }: ReferenceAsideProps) {
  const { t } = useTranslation();
  const copy = t.advisor;
  return (
    <aside
      className="relative hidden shrink-0 flex-col border-r bg-muted/30 md:flex"
      style={{ width: `${size.referenceWidth}px` }}
    >
      {/*
        왼쪽 가장자리를 끌어 폭을 바꾼다. 최소 폭보다 더 줄이려 하면 그 자리에서 닫는다.
        방향키로도 움직인다 — 가장자리를 정확히 집기 어려운 사람에게는 그것이 유일한 길이다.
      */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={copy.card.resizeReference}
        aria-valuenow={size.referenceWidth}
        aria-valuemin={REFERENCE_MIN_WIDTH}
        aria-valuemax={REFERENCE_MAX_WIDTH}
        tabIndex={0}
        {...size.resizeHandlers}
        className={`absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/40 ${
          size.resizing ? "bg-primary/40" : "hover:bg-primary/20"
        }`}
      />
      <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
        <span className="font-semibold">{copy.card.reference}</span>
        {answer && (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {referenceTitle(answer, copy).title} · {referenceTitle(answer, copy).kind}
          </span>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" onClick={size.toggleReference} aria-label={copy.card.collapseReference}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>
      {tabs}
      <div className="flex-1 overflow-y-auto overscroll-contain p-3">
        <ReferenceCard answer={answer} ddragonVersion={ddragonVersion} patch={patch} onPickChampion={onPickChampion} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}

/** 자료 패널·카드 화면의 카드. 고른 답이 없으면 비었다고 적는다. */
export function ReferenceCard({ answer, ddragonVersion, patch, onPickChampion, onNavigate }: ReferenceCardProps) {
  const { t } = useTranslation();
  return answer ? (
    <AdvisorAnswerCard key={referenceKey(answer)} answer={answer} ddragonVersion={ddragonVersion} patch={patch} onPickChampion={onPickChampion} onNavigate={onNavigate} />
  ) : (
    <p className="text-xs text-muted-foreground">{t.advisor.card.referenceEmpty}</p>
  );
}
