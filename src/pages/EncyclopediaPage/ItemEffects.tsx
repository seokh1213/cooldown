import { SafeBlockHtml, SafeInlineHtml } from "@/components/ui/safe-html";
import { useTranslation } from "@/i18n";
import type {
  NormalizedItem,
  NormalizedItemEffect,
} from "@/types/combatNormalized";
import { formatItemNumber, itemDamageFormula } from "./itemFormula";
import { getItemStatLines } from "./itemCatalogModel";

function EffectFormula({ effect }: { effect: NormalizedItemEffect }) {
  const { t, lang } = useTranslation();
  const labels = t.itemDetail;
  const damage = effect.damage;
  const health = effect.healthDamage;
  if (!damage && !health) return null;
  const formula = damage
    ? itemDamageFormula(
        damage,
        {
          baseAttackDamage: labels.baseAttackDamage,
          attackDamage: t.stats.attackDamage,
          abilityPower: t.stats.abilityPower,
          targetMaxHealth: labels.targetMaxHealth,
        },
        lang,
      )
    : "";
  const damageType = damage?.damageType ?? health!.damageType;
  const typeLabel =
    damageType === "physical"
      ? labels.physical
      : damageType === "magical"
        ? labels.magical
        : labels.true;
  return (
    <div className="mt-3 border-l-2 border-primary/60 bg-muted/40 px-3 py-2.5 text-xs leading-relaxed">
      <div className="mb-1 text-muted-foreground">
        {damage?.durationSeconds ? labels.totalDamage : labels.damage} ·{" "}
        {typeLabel}
      </div>
      {damage && <p className="font-medium tabular-nums">{formula}</p>}
      {health && (
        <dl className="space-y-1">
          {(["melee", "ranged"] as const).map((range) => (
            <div key={range}>
              <dt className="inline text-muted-foreground">
                {labels[range]}:{" "}
              </dt>
              <dd className="inline font-medium">
                {labels.targetCurrentHealth} ×{" "}
                {formatItemNumber(health[range] * 100, lang)}%
              </dd>
            </div>
          ))}
        </dl>
      )}
      {damage?.durationSeconds && (
        <p className="mt-1 text-muted-foreground">
          {labels.duration} {formatItemNumber(damage.durationSeconds, lang)}
          {t.common.seconds}
        </p>
      )}
      {damage?.conditions?.length ? (
        <p className="mt-2 text-muted-foreground">
          {damage.conditions
            .map(
              (condition) =>
                t.pages.simulation.conditionLabels[condition] ?? condition,
            )
            .join(" · ")}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {labels.formulaNote}
      </p>
    </div>
  );
}

export function ItemEffects({ item }: { item: NormalizedItem }) {
  const { t, lang } = useTranslation();
  const structured = item.statDescriptions !== undefined;
  const stats = structured
    ? item.statDescriptions!
    : getItemStatLines(item, lang);
  return (
    <div className="space-y-5">
      {stats.length > 0 && (
        <section aria-label={t.itemDetail.stats}>
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">
            {t.itemDetail.stats}
          </h3>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm leading-relaxed">
            {stats.map((line, index) => (
              <li key={index}>
                {structured ? <SafeInlineHtml html={line} /> : line}
              </li>
            ))}
          </ul>
        </section>
      )}
      {item.effects.length > 0 && (
        <section
          aria-label={t.itemDetail.effects}
          className="divide-y divide-border/60"
        >
          {item.effects.map((effect) => (
            <article key={effect.id} className="py-4 first:pt-0 last:pb-0">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {effect.name || t.itemDetail.effects}
                </h3>
                {effect.name && (
                  <span className="text-[11px] text-muted-foreground">
                    {effect.kind === "active"
                      ? t.itemDetail.active
                      : effect.kind === "aura"
                        ? t.itemDetail.aura
                        : t.itemDetail.passive}
                  </span>
                )}
              </div>
              <SafeBlockHtml
                html={effect.description}
                className="text-sm leading-7 text-foreground/85 [&_br+br]:block [&_br+br]:content-[''] [&_br+br]:mb-2"
              />
              {effect.cooldownSeconds !== undefined && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.itemDetail.cooldown}{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatItemNumber(effect.cooldownSeconds, lang)}
                    {t.common.seconds}
                  </span>
                </p>
              )}
              <EffectFormula effect={effect} />
              {effect.unresolved && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t.itemDetail.missingFormula}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
      {!structured && item.effects.length === 0 && item.description && (
        <SafeBlockHtml html={item.description} className="text-sm leading-7" />
      )}
      {structured && item.description && (
        <details className="border-t border-border/60 pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {t.itemDetail.original}
          </summary>
          <SafeBlockHtml
            html={item.description}
            className="mt-3 text-xs leading-relaxed text-muted-foreground"
          />
        </details>
      )}
    </div>
  );
}
