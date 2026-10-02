import { AbilityIcon } from "@/components/ui/ability-icon";
import { IMAGE_VERSION } from "@/data/generated/assetVersion";
import type { PatchSkillInfo } from "@/data/contracts/patchSkills";

export function PatchSkillIcon({ championId, section, info, className }: {
  championId: string; section: string; info?: PatchSkillInfo; className: string;
}) {
  if (!info?.icons?.length) return <AbilityIcon championId={championId} slot={section}
    ddragonVersion={IMAGE_VERSION} className={`${className} shrink-0 rounded`} />;
  return <span aria-hidden="true" data-skill-icon className={`grid shrink-0 overflow-hidden rounded ${info.icons.length > 1 ? "grid-cols-2" : "grid-cols-1"} ${className}`}>
    {info.icons.map(icon => <img key={icon.file} src={`${import.meta.env.BASE_URL}${icon.file}`} alt=""
      data-patch-spell-icon={icon.spellId} decoding="async" className="size-full object-cover shadow-none!" />)}
  </span>;
}
