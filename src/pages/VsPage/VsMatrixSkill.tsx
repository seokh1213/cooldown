import type { AbilityV2 } from "@/data/contracts/championData";
import { spellIconUrl } from "@/data/assets/riotAssetUrls";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import { useTranslation } from "@/i18n";
import type { VsSideKey } from "./vsState";
import { AbilityFormIcon } from "@/components/features/ChampionComparison/AbilityFormIcon";
import { AbilityFormDetails } from "@/components/features/ChampionComparison/AbilityFormDetails";

export function VsMatrixSkill(props: {
  side: VsSideKey; slot: string; name: string; ability?: AbilityV2;
  version: string; onSelect: (ability: AbilityV2, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  const { side, slot, name, ability, version, onSelect } = props;
  return (
    <th id={"vs-" + side + "-" + slot} data-testid={"vs-" + side + "-" + slot} scope="col" className={"border-b border-border align-top font-normal " + (side === "opponent" ? "border-r last:border-r-0" : "")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" disabled={!ability} onClick={(event) => ability && onSelect(ability, event.currentTarget)} aria-label={name + " " + slot + " " + t.comparison.details} className="flex h-full w-full min-w-0 flex-col items-center gap-1.5 px-2 py-2.5 text-center hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default">
            <span className="flex w-full min-w-0 items-center justify-center gap-1.5">
              {ability?.forms ? <AbilityFormIcon forms={ability.forms} label={name + " " + slot} /> : ability ? <img src={spellIconUrl(version, ability.id)} alt="" width={40} height={40} className="size-10 shrink-0 rounded" data-skill-icon /> : <span className="size-10 shrink-0 rounded bg-muted" />}
              <span className="min-w-0 text-left">
                <span className={"block break-words text-xs font-semibold leading-snug " + (side === "mine" ? "text-blue-700 dark:text-blue-300" : "text-rose-700 dark:text-rose-300")}>{name}</span>
              </span>
            </span>
            <span className="sr-only">{t.comparison[side]}</span>
            <span className="w-full truncate text-[11px] leading-4 text-muted-foreground">{ability?.name ?? "—"}</span>
            {ability?.forms && <span data-form-labels className="flex flex-wrap justify-center gap-x-2 text-[10px] leading-3 text-muted-foreground">{ability.forms.map((form) => <span key={form.key} className="whitespace-nowrap">{form.key} {form.label}</span>)}</span>}
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
