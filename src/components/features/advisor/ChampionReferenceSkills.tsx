import { useTranslation } from "@/i18n";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { focusLabel, spellFocusValue, spellOneLiner, spellSummary, type Fact } from "@/lib/advisor/answer";
import { spellFacts } from "@/lib/advisor/spellAnswer";
import type { SpellFact } from "@/lib/knowledge/facts";
import { toChampion } from "@/data/mappers/championMapper";
import { AdvisorSkillTrigger } from "./AdvisorSkillTrigger";
import { Disclosure, KvTable } from "./AnswerCardFrame";
import { SpellTickInfo } from "./SpellTickInfo";
import { tickHeading } from "@/lib/knowledge/abilityTicks";
import { AdvisorMarkdown } from "./AdvisorMarkdown";

export function ChampionReferenceSkills({ answer, detail, selectedSpells = [], patch, ddragonVersion }: {
  answer: Extract<AdvisorAnswer, { kind: "champion" }>; detail?: ChampionDetailV2;
  selectedSpells?: Extract<AdvisorAnswer, { kind: "spell" }>[]; patch: string; ddragonVersion: string;
}) {
  const { t, lang } = useTranslation();
  const { card } = answer;
  const full = detail ? toChampion(detail) : undefined;
  const rows = card.spells.map((spell, index) => ({
    label: `${spell.slot} ${spell.name}`,
    labelContent: <AdvisorSkillTrigger championId={card.id} championName={card.name} spell={spell}
      skill={index > 0 ? full?.spells?.[index - 1] : undefined} passive={index === 0 ? full?.passive : undefined}
      resource={detail?.champion.resource} patch={patch} ddragonVersion={ddragonVersion} />,
    hit: selectedSpells.some(selected => selected.spell.slot === spell.slot),
    value: <>
      {answer.focus && answer.focus !== "ticks" && <div className="mb-1 font-semibold">{focusLabel(answer.focus, lang)}: {spellFocusValue(spell, answer.focus, lang) || "—"}</div>}
      <div>{answer.view || answer.focus ? spellSummary(spell, true) : spellOneLiner(spell, lang)}</div>
      <SkillDetails spell={spell} facts={spellFacts(spell, lang)}
        tickRequested={answer.focus === "ticks"}
        selected={selectedSpells.filter(selected => selected.spell.slot === spell.slot)} />
    </>,
  }));
  return <div data-reference-skills>
    <div className="mb-1 text-[11px] font-medium text-muted-foreground">{t.advisor.card.skills}</div>
    <KvTable rows={rows} />
  </div>;
}

/** 모든 스킬의 수치와 전문을 제공한다. 현재 질문의 결론만 선택한 행에 표시한다. */
function SkillDetails({ spell, facts, selected, tickRequested }: {
  spell: SpellFact; facts: Fact[]; selected: Extract<AdvisorAnswer, { kind: "spell" }>[];
  tickRequested?: boolean;
}) {
  const { t, lang } = useTranslation();
  const otherFacts = facts.filter(fact => fact.label !== tickHeading(lang));
  return <div className="mt-1.5 space-y-1 text-xs font-normal">
    {selected.flatMap(answer => answer.headline && answer.headline.label !== tickHeading(lang) ? [answer.headline] : []).map(fact =>
      <p key={`${fact.label}:${fact.value}`} className="font-semibold text-primary">{fact.label}: {fact.value}</p>)}
    {[...new Set(selected.flatMap(answer => answer.highlighted))].map(sentence => <AdvisorMarkdown key={sentence} text={sentence} />)}
    <SpellTickInfo ticks={spell.ticks} requested={tickRequested || selected.some(answer => answer.focus === "ticks")} />
    {otherFacts.length > 0 && <Disclosure summary={t.skillTooltip.skillInfo}>
      <KvTable rows={otherFacts} />
    </Disclosure>}
    {spell.text && <Disclosure summary={t.advisor.card.fullText}>{spell.text}</Disclosure>}
  </div>;
}
