import { AbilityFormIcon } from "@/shared/ui/icons/ability-form-icon";
import { useTranslation } from "@/shared/i18n";
import { spellIconStates } from "@/domain/game/abilities/abilityIconStates";

export function AbilityStateIcon({ spellId, label, ddragonVersion, className }: {
  spellId: string; label: string; ddragonVersion: string; className?: string;
}) {
  const { lang } = useTranslation();
  const variants = spellIconStates(spellId)?.variants;
  if (!variants?.length) return null;
  const description = [label, ...variants.map(variant => `${variant.key} ${variant.labels[lang]}`)].join(" · ");
  return <AbilityFormIcon forms={variants} label={description} ddragonVersion={ddragonVersion} className={className} />;
}
