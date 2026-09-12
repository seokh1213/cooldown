import { passiveIconUrl } from "@/data/assets/riotAssetUrls";
import type { AbilityV2 } from "@/data/contracts/championData";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import { AbilityStructuredDetails } from "@/components/features/ChampionComparison/AbilityStructuredDetails";
import type { VsSideKey } from "./vsState";
import { AbilityFormDetails } from "@/components/features/ChampionComparison/AbilityFormDetails";

export function VsAbilityCell(props: {
  ability?: AbilityV2; championName: string; side: VsSideKey; slot: "P"; version: string;
}) {
  const { ability } = props;
  return (
    <div data-testid={"vs-" + props.side + "-P"} className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        {ability && <img src={passiveIconUrl(props.version, ability.iconFile)} alt="" width={28} height={28} className="size-7 shrink-0 rounded" data-skill-icon />}
        <h3 className="text-[13px] font-medium">{ability?.name ?? "—"}</h3>
        <span className={"ml-auto shrink-0 text-[11px] " + (props.side === "mine" ? "text-blue-700 dark:text-blue-300" : "text-rose-700 dark:text-rose-300")}>{props.championName}</span>
      </div>
      {ability && <div data-ability-body><SafeBlockHtml html={ability.bodyHtml || ability.summary} className="break-words text-[13px] leading-relaxed text-foreground/85" /></div>}
    </div>
  );
}

export function VsAbilityBody({ ability }: { ability: AbilityV2 }) {
  if (ability.forms) return <div data-ability-body><AbilityFormDetails forms={ability.forms} /></div>;
  return (
    <div data-ability-body className="mt-3 border-t border-border/60 pt-3">
      <SafeBlockHtml
        html={ability.bodyHtml || ability.summary}
        className="break-words text-sm leading-relaxed [&_img]:max-w-full"
      />
      <AbilityStructuredDetails
        rankValues={ability.rankValues}
        scalings={ability.scalings}
        conditions={ability.conditions}
        diagnostics={ability.diagnostics}
        simulation={ability.simulation}
      />
    </div>
  );
}
