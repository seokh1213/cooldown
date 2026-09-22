import type { AbilityV2 } from "@/data/contracts/championData";
import { spellIconUrl } from "@/data/assets/riotAssetUrls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import { useTranslation } from "@/i18n";
import type { VsSideKey } from "./vsState";
import { AbilityFormIcon } from "@/components/features/ChampionComparison/AbilityFormIcon";
import { AbilityFormDetails } from "@/components/features/ChampionComparison/AbilityFormDetails";

/** Icon and slot letter only; the name lives in the tooltip and the champion in the row above. */
export function VsMatrixSkill(props: {
  side: VsSideKey; slot: string; name: string; ability?: AbilityV2;
  /** 챔피언 경계 칸의 여백. 두 챔피언은 선이 아니라 여백으로 가른다(VsCooldownMatrix). */
  version: string; groupClass: string; onSelect: (ability: AbilityV2, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  const { side, slot, name, ability, version, onSelect } = props;
  return (
    <th id={"vs-" + side + "-" + slot} data-testid={"vs-" + side + "-" + slot} scope="col" className={"border-b border-border/60 p-0 align-top font-normal" + props.groupClass}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" disabled={!ability} onClick={(event) => ability && onSelect(ability, event.currentTarget)} aria-label={name + " " + slot + " " + t.comparison.details} className="flex w-full min-w-0 flex-col items-center gap-1 px-0.5 pb-2 pt-2.5 hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-default">
            {ability?.forms ? <AbilityFormIcon forms={ability.forms} label={name + " " + slot} className="size-7 sm:size-8" /> : ability ? <img src={spellIconUrl(version, ability.id)} alt="" width={32} height={32} className="size-7 shrink-0 rounded shadow-none sm:size-8" data-skill-icon /> : <span className="size-7 shrink-0 rounded bg-muted sm:size-8" />}
            <span className="text-[11px] leading-3 text-muted-foreground">{slot}</span>
            <span className="sr-only">{name} · {t.comparison[side]} · {ability?.name ?? "—"}</span>
          </button>
        </TooltipTrigger>
        {ability && (
          <TooltipContent side="top" className="w-[min(28rem,calc(100vw-2rem))] p-4 text-left font-normal">
            <p className="mb-3 text-sm font-semibold">{name} · {slot} {ability.name}</p>
            {ability.forms ? <AbilityFormDetails forms={ability.forms} /> : <SafeBlockHtml html={ability.bodyHtml || ability.summary} className="break-words text-sm leading-relaxed" />}
          </TooltipContent>
        )}
      </Tooltip>
    </th>
  );
}
