import type { AbilityForm } from "@/data/contracts/championData";
import { formIconUrl } from "@/data/assets/riotAssetUrls";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import { useTranslation } from "@/i18n";
import { AbilityStructuredDetails } from "./AbilityStructuredDetails";

/**
 * 변신 스킬의 형태별 설명. 표에서는 두 아이콘을 대각선으로 겹쳐 A/B 딱지를 붙이는데,
 * 여기서는 형태마다 온전한 아이콘에 같은 딱지를 달아 표의 반쪽과 설명 절이 눈으로 이어지게 한다.
 */
export function AbilityFormDetails({ forms, ddragonVersion }: { forms: AbilityForm[]; ddragonVersion: string }) {
  const { t } = useTranslation();
  return (
    <div className="divide-y divide-border" data-form-details>
      {forms.map((form) => (
        <section key={form.key} className="py-3 first:pt-0 last:pb-0" data-ability-form={form.key}>
          <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <span className="relative inline-block size-9 shrink-0 overflow-hidden rounded bg-muted" data-form-icon={form.key}>
              <img src={formIconUrl(ddragonVersion, form.iconPath)} alt="" decoding="async" className="size-full object-cover shadow-none" style={{ boxShadow: "none" }} />
              <span aria-hidden="true" className="absolute bottom-0 left-0 bg-black/80 px-0.5 text-[9px] leading-3 text-white">{form.key}</span>
            </span>
            <span className="min-w-0">{form.key} · {form.label} — {form.name}</span>
          </h3>
          <p className="mb-2 text-xs text-muted-foreground">{t.comparison.cooldownNote} · {form.cooldownSeconds.length ? form.cooldownSeconds.join(" / ") + " " + t.comparison.seconds : "—"}</p>
          {form.tooltipRankSource === "R" && <p className="mb-2 text-xs text-muted-foreground">{t.comparison.formRankNote}</p>}
          <SafeBlockHtml html={form.bodyHtml} className="break-words text-sm leading-relaxed" />
          {form.levelValues && form.levelValues.length > 0 && (
            <div className="mt-3">
              <AbilityStructuredDetails levelValues={form.levelValues} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
