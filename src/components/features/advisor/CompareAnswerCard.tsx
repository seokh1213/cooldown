/**
 * 둘 이상을 견주는 답 카드. 열이 챔피언, 행이 사실이다. 상성이면 상성 노트를 덧붙인다.
 */
import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";
import { ChampionIcon } from "@/components/ui/champion-icon";
import type { AdvisorAnswer, CompareRow, MatchupNotes } from "@/lib/advisor/answer";
import type { ChampionCard } from "@/lib/knowledge/facts";
import { josa } from "@/lib/knowledge/text";
import { Frame, NoteList, PatchLinkFooter } from "./AnswerCardFrame";
import { MatchupReferenceCard } from "./MatchupReferenceCard";

export function CompareAnswerCard({
  answer,
  ddragonVersion,
  patch,
  onNavigate,
  presentation = "full",
}: {
  answer: Extract<AdvisorAnswer, { kind: "compare" }>;
  ddragonVersion: string;
  patch: string;
  onNavigate?: () => void;
  presentation?: "full" | "reference";
}) {
  const { t } = useTranslation();
  const copy = t.advisor.card;
  const { cards } = answer;
  const [first, second] = cards;
  const vsLink = second ? `/vs?a=${first.id}&t=${second.id}` : `/vs?a=${first.id}`;
  if (presentation === "reference" && answer.matchup) {
    return <MatchupReferenceCard answer={answer} ddragonVersion={ddragonVersion} patch={patch} onNavigate={onNavigate} />;
  }
  return (
    <Frame
      icon={
        <div className="flex shrink-0 -space-x-2">
          {cards.map((card) => (
            <ChampionIcon
              key={card.id}
              id={card.id}
              ddragonVersion={ddragonVersion}
              className="block h-7 w-7 rounded-md ring-2 ring-background"
            />
          ))}
        </div>
      }
      title={cards.map((card) => card.name).join(" vs ")}
      subtitle={
        answer.matchup && second
          ? // 한국어는 받침에 맞춰 조사를 붙인다("가렌으로", "럭스로"). 다른 언어 문구는 {a} 를 쓴다.
            fill(copy.matchup, { a: first.name, aWith: josa(first.name, "로/으로"), b: second.name })
          : answer.slot
            ? `${answer.slot}`
            : answer.level
              ? fill(copy.atLevel, { n: answer.level })
              : undefined
      }
      tool={answer.matchup ? copy.matchupTool : copy.compare}
      footer={<PatchLinkFooter patch={patch} to={vsLink} label={cards.length > 2 ? fill(copy.goVs, { a: first.name, b: second.name }) : copy.openInVs} onNavigate={onNavigate} />}
    >
      {answer.headline && (
        <div className="mb-2 rounded-md bg-muted px-2.5 py-2 text-[13px] leading-relaxed">
          <span className="text-muted-foreground">{answer.headline.label}</span>
          <span className="ml-2 font-semibold tabular-nums">{answer.headline.value}</span>
        </div>
      )}
      <CompareTable cards={cards} rows={answer.rows} />
      {/* 상성 노트. "누가 유리해" 의 실전 답은 능력치 표가 아니라 여기 있다. */}
      {answer.matchup && second && answer.notes && (answer.notes.mine.length > 0 || answer.notes.enemy.length > 0) && (
        <MatchupNoteBlock mine={first} enemy={second} notes={answer.notes} />
      )}
    </Frame>
  );
}

function CompareTable({ cards, rows }: { cards: ChampionCard[]; rows: CompareRow[] }) {
  const hasHit = rows.some((row) => row.hit);
  return (
    <div className="max-w-full overflow-x-auto [scrollbar-width:thin]" tabIndex={cards.length > 2 ? 0 : undefined}>
      <table className="w-full border-collapse text-[13px]" style={cards.length > 2 ? { minWidth: `${160 + cards.length * 120}px` } : undefined}>
        <thead>
          <tr className="border-b text-[11px] text-muted-foreground">
            <th className="w-[28%] py-1 pr-2 text-left font-medium" />
            {cards.map((card) => (
              <th key={card.id} className="py-1 pr-2 text-left font-medium">
                {card.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const dim = hasHit && !row.hit;
            return (
              <tr key={row.label} className={`border-b last:border-b-0 ${dim ? "text-muted-foreground" : ""}`}>
                <td className={`py-1.5 pr-2 align-top ${row.hit ? "font-semibold" : "text-muted-foreground"}`}>{row.label}</td>
                {row.values.map((value, i) => {
                  // VS 화면과 같은 규칙: 이긴 쪽 굵게, 진 쪽 회색, 동률은 보통.
                  const won = row.winner === i;
                  const lost = row.winner !== undefined && !won;
                  return (
                    <td
                      key={cards[i].id}
                      className={`py-1.5 pr-2 align-top tabular-nums ${won ? "font-semibold" : ""} ${lost && !dim ? "text-muted-foreground" : ""}`}
                    >
                      {value || "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatchupNoteBlock({ mine, enemy, notes }: { mine: ChampionCard; enemy: ChampionCard; notes: MatchupNotes }) {
  const { t } = useTranslation();
  const copy = t.advisor.card;
  return (
    <div className="mt-3 space-y-2.5 border-t pt-2.5">
      {notes.enemy.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">{fill(copy.againstNotes, { name: enemy.name })}</div>
          <NoteList items={notes.enemy} />
        </div>
      )}
      {notes.mine.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">{fill(copy.playingNotes, { name: mine.name })}</div>
          <NoteList items={notes.mine} />
        </div>
      )}
      <div className="text-[11px] text-muted-foreground">{copy.notesSource}</div>
    </div>
  );
}
