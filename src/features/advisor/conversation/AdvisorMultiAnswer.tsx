import type { AdvisorTurn } from "@/features/advisor/session/useAdvisorTurns";
import type { AdvisorAnswer } from "@/features/advisor/answers/answer";
import { groupReferenceAnswers, isReferenceAnswer } from "@/features/advisor/answers/referenceGroups";
import { referenceKey } from "@/features/advisor/answers/referenceIdentity";
import { AdvisorAnswerCard } from "../answers/AdvisorAnswerCard";
import { CompareAnswerCard } from "../answers/CompareAnswerCard";
import { AdvisorMarkdown } from "../answers/AdvisorMarkdown";
import { ReferenceChip } from "../reference/AdvisorReferenceChip";

interface AdvisorMultiAnswerProps {
  turn: AdvisorTurn;
  asReference: boolean;
  shownReferenceKey?: string;
  ddragonVersion: string;
  patch: string;
  navigation?: React.ReactNode;
  onShowReference: (turnId: number, answer?: AdvisorAnswer) => void;
  onPickChampion: (championId: string) => void;
  onNavigate: () => void;
}

export function AdvisorMultiAnswer({ turn, asReference, shownReferenceKey, ddragonVersion, patch, navigation, onShowReference, onPickChampion, onNavigate }: AdvisorMultiAnswerProps) {
  const groups = groupReferenceAnswers(turn.answers ?? []);
  const inline = groups.filter(group => !asReference || !isReferenceAnswer(group.answer));
  const references = asReference ? groups.filter(group => isReferenceAnswer(group.answer)) : [];
  return <div className="space-y-3">
    {inline.length > 0 && <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))" }}>
      {inline.map(({ key, answer, answers }) => answer.kind === "compare" && answer.matchup
        ? <CompareAnswerCard key={key} answer={answer} ddragonVersion={ddragonVersion} patch={patch} onNavigate={onNavigate} presentation="reference" />
        : <AdvisorAnswerCard key={key} answer={answer} answers={answers} ddragonVersion={ddragonVersion} patch={patch} onPickChampion={onPickChampion} onNavigate={onNavigate} />)}
    </div>}
    {navigation && <div className="flex flex-wrap gap-1.5">{navigation}</div>}
    <div className="text-sm leading-7"><AdvisorMarkdown text={turn.content} /></div>
    {references.length > 0 && <div className="flex flex-wrap items-center gap-1.5">
      {references.map(({ key, answer }) => <ReferenceChip key={key} answer={answer}
        active={shownReferenceKey === referenceKey(answer, turn.source)} sameAsPrevious={false}
        ddragonVersion={ddragonVersion} onClick={() => onShowReference(turn.id, answer)} />)}
    </div>}
  </div>;
}
