import { FORMULA_GROUPS } from "@/data/gameFormulas";
import { useTranslation } from "@/i18n";
import { SafeInlineHtml } from "@/components/ui/safe-html";
import { statIconToken } from "@/lib/spellTooltipParser/statIcons";

export function FormulasTab() {
  const { t, lang } = useTranslation();
  const copy = t.encyclopedia.formulas;

  return (
    <div className="mt-4 space-y-6">
      <p className="text-xs text-muted-foreground leading-relaxed">
        {copy.intro}
      </p>

      {FORMULA_GROUPS.map((group) => (
        <section key={group.id} className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            {group.title[lang]}
          </h2>

          <div className="grid gap-3 md:grid-cols-2">
            {group.entries.map((entry) => (
              <article
                key={entry.id}
                className="rounded-lg border border-border bg-card p-4 space-y-2.5"
              >
                <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  {entry.icon && (
                    <SafeInlineHtml
                      html={statIconToken(entry.icon)}
                      className="shrink-0"
                    />
                  )}
                  {entry.title[lang]}
                </h3>

                <p className="rounded-md bg-muted/60 px-3 py-2 font-mono text-xs leading-relaxed text-foreground overflow-x-auto whitespace-pre-wrap">
                  {entry.formula}
                </p>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {entry.description[lang]}
                </p>

                {entry.example && (
                  <p className="text-xs leading-relaxed text-muted-foreground/90 whitespace-pre-wrap">
                    <span className="font-medium text-foreground">
                      {copy.exampleLabel}
                    </span>{" "}
                    {entry.example[lang]}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground/80 leading-relaxed">
        {copy.source}
      </p>
    </div>
  );
}
