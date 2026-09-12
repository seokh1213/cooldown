import type { ChampionSpell } from "@/types";
import { useTranslation } from "@/i18n";

/** Both layouts use the same A/B ordering as the shared icon and tooltip. */
export function SkillRankCooldown(props: { skill: ChampionSpell; rank: number; cooldown: string }) {
  const { t, lang } = useTranslation();
  const format = new Intl.NumberFormat(lang.replace("_", "-"), { maximumFractionDigits: 3 });
  if (!props.skill.forms) return <>{props.cooldown !== "" ? props.cooldown + t.common.seconds : "-"}</>;
  const forms = props.skill.forms.map((form) => {
    const values = form.cooldownSeconds;
    const value = props.rank <= props.skill.maxrank ? values[values.length === 1 ? 0 : props.rank - 1] : undefined;
    return { ...form, value: value !== undefined && Number.isFinite(value) && value >= 0 ? value : null };
  });
  return <span data-skill-rank={props.skill.id} data-rank={props.rank} className="flex flex-col gap-0.5 tabular-nums">
    {forms.every((form) => form.value === null) ? "—" : forms.map((form) => (
      <span key={form.key} data-rank-form={form.key} title={form.label} className="whitespace-nowrap">
        <span className="mr-0.5 text-[0.8em] font-normal text-muted-foreground">{form.key}</span>
        <span data-form-value>{form.value === null ? "—" : format.format(form.value) + t.common.seconds}</span>
      </span>
    ))}
  </span>;
}
