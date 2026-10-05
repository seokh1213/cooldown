import { useTranslation } from "@/i18n";
import type { ChampionDetailV2 } from "@/data/contracts/championData";
import type { AdvisorAnswer } from "@/lib/advisor/answer";
import { focusLabel, spellFocusValue, spellOneLiner, spellSummary } from "@/lib/advisor/answer";
import { toChampion } from "@/data/mappers/championMapper";
import { AdvisorSkillTrigger } from "./AdvisorSkillTrigger";
import { Disclosure, KvTable } from "./AnswerCardFrame";

export function ChampionReferenceSkills({ answer, detail, selectedSpell, patch, ddragonVersion }: {
  answer: Extract<AdvisorAnswer, { kind: "champion" }>; detail?: ChampionDetailV2;
  selectedSpell?: Extract<AdvisorAnswer, { kind: "spell" }>; patch: string; ddragonVersion: string;
}) {
  const { t, lang } = useTranslation();
  const { card } = answer;
  const full = detail ? toChampion(detail) : undefined;
  const focused = selectedSpell?.spell.slot;
  const rows = card.spells.map((spell, index) => ({
    label: `${spell.slot} ${spell.name}`,
    labelContent: <AdvisorSkillTrigger championId={card.id} championName={card.name} spell={spell}
      skill={index > 0 ? full?.spells?.[index - 1] : undefined} passive={index === 0 ? full?.passive : undefined}
      resource={detail?.champion.resource} patch={patch} ddragonVersion={ddragonVersion} />,
    hit: spell.slot === focused,
    value: <>
      {answer.focus && <div className="mb-1 font-semibold">{focusLabel(answer.focus, lang)}: {spellFocusValue(spell, answer.focus, lang) || "—"}</div>}
      <div>{answer.view || answer.focus ? spellSummary(spell) : spellOneLiner(spell, lang)}</div>
      {selectedSpell && spell.slot === focused && <SelectedSpellDetails answer={selectedSpell} />}
    </>,
  }));
  return <div data-reference-skills>
    <div className="mb-1 text-[11px] font-medium text-muted-foreground">{t.advisor.card.skills}</div>
    <KvTable rows={rows} />
  </div>;
}

/** 선택한 스킬의 결론은 보이고, 세부 수치와 전문은 열어서 확인한다. */
function SelectedSpellDetails({ answer }: { answer: Extract<AdvisorAnswer, { kind: "spell" }> }) {
  const { t } = useTranslation();
  return <div className="mt-1.5 space-y-1 text-xs font-normal">
    {answer.headline && <p className="font-semibold text-primary">{answer.headline.label}: {answer.headline.value}</p>}
    {answer.highlighted.map(sentence => <p key={sentence}>{sentence}</p>)}
    {answer.facts.length > 0 && <Disclosure summary={t.skillTooltip.skillInfo}>
      <KvTable rows={answer.facts} />
    </Disclosure>}
    {answer.spell.text && <Disclosure summary={t.advisor.card.fullText}>{answer.spell.text}</Disclosure>}
  </div>;
}
