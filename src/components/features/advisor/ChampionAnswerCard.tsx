/**
 * 챔피언 한 명의 답 카드
 *
 *   M2-B  능력치 전부 + 스킬 한 줄씩, 극단 능력치 행만 굵게
 */
import { useTranslation } from "@/i18n";
import { fill } from "@/i18n/fill";
import { ChampionIcon } from "@/components/ui/champion-icon";
import {
  CARD_STATS,
  focusLabel,
  isExtremeGrade,
  percentileLabel,
  spellFocusValue,
  spellOneLiner,
  spellSummary,
  type AdvisorAnswer,
} from "@/lib/advisor/answer";
import type { SelectedNotes } from "@/lib/advisor/noteSelect";
import { translateRange, translateStat, translateTag } from "@/lib/advisor/promptLocale";
import type { ChampionCard } from "../../../../scripts/llm/lib/facts";
import { Frame, KvTable, NoteList, PatchLinkFooter } from "./AnswerCardFrame";

export function ChampionAnswerCard({
  answer,
  ddragonVersion,
  patch,
  onNavigate,
}: {
  answer: Extract<AdvisorAnswer, { kind: "champion" }>;
  ddragonVersion: string;
  patch: string;
  onNavigate?: () => void;
}) {
  const { t, lang } = useTranslation();
  const copy = t.advisor.card;
  const { card } = answer;
  const subtitle = [card.wiki?.subclass, translateRange(card.rangeType, lang), card.wiki?.positions?.[0]]
    .filter(Boolean)
    .join(" · ");
  const header = (
    <ChampionIcon id={card.id} ddragonVersion={ddragonVersion} className="block h-9 w-9 shrink-0 rounded-md" />
  );
  const footer = <PatchLinkFooter patch={patch} to={`/vs?a=${card.id}`} label={copy.openInVs} onNavigate={onNavigate} />;
  // "말파이트 스킬 쿨타임": 스킬 다섯 개의 그 사실만. 능력치도 운용 노트도 없다 —
  // 수치 하나를 물은 자리에 노트를 얹었더니 무엇을 답한 것인지 흐려졌다.
  if (answer.focus) {
    const focus = answer.focus;
    return (
      <Frame icon={header} title={card.name} subtitle={`${copy.skills} · ${focusLabel(focus, lang)}`} tool={copy.champion} footer={footer}>
        <KvTable
          rows={card.spells.map((spell) => ({
            label: `${spell.slot} ${spell.name}`,
            value: spellFocusValue(spell, focus, lang) || "—",
            hit: true,
          }))}
        />
      </Frame>
    );
  }
  const statRows = CARD_STATS.map((stat) => {
    const snap = card.stats[stat];
    if (!snap) return undefined;
    const { side, value } = percentileLabel(snap.percentileLv1);
    const pct = fill(side === "top" ? copy.top : copy.bottom, { n: value });
    return {
      label: translateStat(stat, lang),
      hit: isExtremeGrade(snap.gradeLv1),
      value: (
        <>
          {snap.lv1} → {snap.lv18}
          <span className="ml-1.5 text-[11px] text-muted-foreground">{pct}</span>
        </>
      ),
    };
  }).filter((row): row is NonNullable<typeof row> => Boolean(row));
  // "스킬 설명해줘" 면 한 줄 요약(무엇을 하는 스킬인지), 아니면 쿨·효과·계수 한 줄.
  const skillsView = answer.view === "skills";
  const skillRows = card.spells.map((spell) => ({
    label: `${spell.slot} ${spell.name}`,
    value: skillsView ? spellSummary(spell) : spellOneLiner(spell, lang),
    hit: skillsView,
  }));
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
        <>
          <div className="mb-1 text-[11px] font-medium text-muted-foreground">{copy.stats}</div>
          <KvTable rows={statRows} />
        </>
      )}
      <div className={`mb-1 text-[11px] font-medium text-muted-foreground ${skillsView ? "" : "mt-3"}`}>{copy.skills}</div>
      <KvTable rows={skillRows} />
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
