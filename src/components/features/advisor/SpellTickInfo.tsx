import { useTranslation } from "@/i18n";
import { tickHeading, tickText, type SpellTicks } from "@/lib/knowledge/abilityTicks";
import { Disclosure } from "./AnswerCardFrame";

export function SpellTickInfo({ ticks, requested = false }: { ticks?: SpellTicks; requested?: boolean }) {
  const { lang } = useTranslation();
  if (!requested && (!ticks || ticks.status === "not_documented" || !ticks.sources.length)) return null;
  const sourceLabel = { ko_KR: "틱 근거", en_US: "Tick sources", zh_CN: "跳数来源" }[lang];
  return <div data-spell-ticks className="space-y-1 text-xs [&_summary]:flex [&_summary]:min-h-11 [&_summary]:items-center dark:[&_summary]:text-foreground">
    <div className="font-medium">{tickHeading(lang)}</div>
    <div className="whitespace-pre-line">{tickText(ticks, lang)}</div>
    {ticks && ticks.sources.length > 0 && <Disclosure summary={sourceLabel}>
      <div className="flex flex-wrap gap-x-3">
        {ticks.sources.map((source, index) => <a key={source} href={source} target="_blank" rel="noreferrer"
          className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 focus-visible:outline focus-visible:outline-2 dark:text-foreground">
          {sourceLabel} {index + 1}
        </a>)}
      </div>
    </Disclosure>}
  </div>;
}
