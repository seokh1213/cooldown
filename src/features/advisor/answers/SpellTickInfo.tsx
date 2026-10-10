import { useTranslation } from "@/shared/i18n";
import { tickEffectText, tickHeading, tickText, type SpellTicks } from "@/domain/knowledge/abilityTicks";

export function TickDetails({ ticks }: { ticks?: SpellTicks }) {
  const { lang } = useTranslation();
  if (!ticks || ticks.status !== "known") return <p>{tickText(ticks, lang)}</p>;
  return <div className="space-y-3">
    {ticks.effects.map((effect, index) => {
      const label = effect.label[lang];
      const metrics = tickEffectText({ ...effect, perTick: undefined, note: undefined }, lang)
        .slice(label.length + 2).split(" · ").filter(Boolean);
      return <div key={`${label}:${index}`} className="space-y-1.5">
        <p className="font-medium">{label}</p>
        <ul className="ml-4 list-disc space-y-1 pl-1 tabular-nums">
          {metrics.map(metric => <li key={metric}>{metric}</li>)}
          {effect.perTick && <li>{effect.perTick[lang]}</li>}
        </ul>
        {effect.note && <p className="text-[13px] font-normal leading-relaxed">{effect.note[lang]}</p>}
      </div>;
    })}
  </div>;
}

export function SpellTickInfo({ ticks, requested = false }: { ticks?: SpellTicks; requested?: boolean }) {
  const { lang } = useTranslation();
  if (!requested && (!ticks || ticks.status === "not_documented")) return null;
  return <div data-spell-ticks className="space-y-2 text-xs">
    <div className="font-medium">{tickHeading(lang)}</div>
    <TickDetails ticks={ticks} />
  </div>;
}
