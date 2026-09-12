import type { AbilityForm } from "@/data/contracts/championData";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import { useTranslation } from "@/i18n";

export function AbilityFormDetails({ forms }: { forms: AbilityForm[] }) {
  const { t } = useTranslation();
  return (
    <div className="divide-y divide-border" data-form-details>
      {forms.map((form) => (
        <section key={form.key} className="py-3 first:pt-0 last:pb-0" data-ability-form={form.key}>
          <h3 className="mb-1.5 text-sm font-semibold">{form.key} · {form.label} — {form.name}</h3>
          <p className="mb-2 text-xs text-muted-foreground">{t.comparison.cooldownNote} · {form.cooldownSeconds.length ? form.cooldownSeconds.join(" / ") + " " + t.comparison.seconds : "—"}</p>
          {form.tooltipRankSource === "R" && <p className="mb-2 text-xs text-muted-foreground">{t.comparison.formRankNote}</p>}
          <SafeBlockHtml html={form.bodyHtml} className="break-words text-sm leading-relaxed" />
        </section>
      ))}
    </div>
  );
}
