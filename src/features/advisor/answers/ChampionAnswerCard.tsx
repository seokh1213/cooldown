/**
 * 챔피언 한 명의 답 카드
 *
 *   공식 역할군 + 능력치·성장치 + 스킬 한 줄씩
 */
import { useTranslation } from "@/shared/i18n";
import { fill } from "@/shared/i18n/fill";
import { ChampionIcon } from "@/shared/ui/champion-icon";
import type { AdvisorAnswer } from "@/features/advisor/answers/answer";
import type { SelectedNotes } from "@/features/advisor/retrieval/noteSelect";
import { translateRange, translateTag } from "@/features/advisor/answers/promptLocale";
import type { ChampionCard } from "@/domain/knowledge/facts";
import { Frame, NoteList, PatchLinkFooter } from "./AnswerCardFrame";
import { ChampionReferenceStats } from "../reference/ChampionReferenceStats";
import { ChampionReferenceSkills } from "../reference/ChampionReferenceSkills";
import { useAdvisorChampionDetail } from "../reference/useAdvisorChampionDetail";
import { useHistoryReference } from "../history/HistoryReference";

export function ChampionAnswerCard({
  answer,
  ddragonVersion: currentDdragonVersion,
  patch: currentPatch,
  onNavigate,
  selectedSpells,
}: {
  answer: Extract<AdvisorAnswer, { kind: "champion" }>;
  ddragonVersion: string;
  patch: string;
  onNavigate?: () => void;
  selectedSpells?: Extract<AdvisorAnswer, { kind: "spell" }>[];
}) {
  const { t, lang } = useTranslation();
  const turn = useHistoryReference();
  const patch = turn?.source?.patch ?? currentPatch;
  const ddragonVersion = turn?.source?.ddragonVersion ?? currentDdragonVersion;
  const copy = t.advisor.card;
  const { card } = answer;
  const detail = useAdvisorChampionDetail(patch, turn?.source?.locale ?? lang, card.id, ddragonVersion);
  const subtitle = [
    ...card.roleTags.map((role) => t.championProfile.roleNames[role.toLowerCase()]),
    translateRange(card.riot?.attackType ?? card.rangeType, lang),
  ]
    .filter(Boolean)
    .join(" · ");
  const header = (
    <ChampionIcon id={card.id} ddragonVersion={ddragonVersion} className="block h-9 w-9 shrink-0 rounded-md" />
  );
  const footer = <PatchLinkFooter patch={patch} to={`/vs?a=${card.id}`} label={copy.openInVs} onNavigate={onNavigate} />;
  const skillsView = answer.view === "skills" || Boolean(answer.focus);
  return (
    <Frame
      icon={header}
      title={
        <>
          {card.name}
          {card.title && <span className="ml-1.5 font-normal text-muted-foreground">{card.title}</span>}
        </>
      }
      subtitle={subtitle}
      tool={copy.champion}
      footer={footer}
    >
      {!skillsView && (
        <ChampionReferenceStats card={card} detail={detail} query={answer.statQuery} />
      )}
      <div className={skillsView ? "" : "mt-3"}>
        <ChampionReferenceSkills answer={answer} detail={detail} selectedSpells={selectedSpells} patch={patch} ddragonVersion={ddragonVersion} />
      </div>
      {!skillsView && card.mechanics.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {card.mechanics.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-2 py-px text-[11px] text-muted-foreground">
              {translateTag(tag, lang)}
            </span>
          ))}
        </div>
      )}
      {answer.notes && (answer.notes.playing.length > 0 || answer.notes.against.length > 0) && (
        <ChampionNotes card={card} notes={answer.notes} />
      )}
    </Frame>
  );
}

/*
  사람이 검증한 운용 노트. 수치·태그가 아니라 이것이 실전에 쓰는 말이다.

  **물은 쪽을 먼저 놓는다.** "말파 상대법" 을 물었는데 "말파로 플레이할 때" 가
  먼저 나오면 읽는 사람이 관점을 뒤집어 읽는다. 어느 쪽을 물었는지는
  `noteSelect` 가 조사로 가려 `perspective` 에 담아 준다.
*/
function ChampionNotes({ card, notes }: { card: ChampionCard; notes: SelectedNotes }) {
  const { t } = useTranslation();
  const copy = t.advisor.card;
  return (
    <div className="mt-3 space-y-2.5 border-t pt-2.5">
      {(notes.perspective === "against"
        ? ([
            ["against", notes.against, copy.againstNotes],
            ["playing", notes.playing, copy.playingNotes],
          ] as const)
        : ([
            ["playing", notes.playing, copy.playingNotes],
            ["against", notes.against, copy.againstNotes],
          ] as const)
      ).map(([key, list, label]) =>
        list.length > 0 ? (
          <div key={key}>
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">{fill(label, { name: card.name })}</div>
            <NoteList items={list} />
          </div>
        ) : null,
      )}
      <div className="text-[11px] text-muted-foreground">{copy.notesSource}</div>
    </div>
  );
}
