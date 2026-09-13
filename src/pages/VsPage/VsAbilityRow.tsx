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
    <div data-testid={"vs-" + props.side + "-P"} className="flex min-w-0 items-start gap-2.5">
      {ability ? <img src={passiveIconUrl(props.version, ability.iconFile)} alt="" width={24} height={24} className="mt-0.5 size-6 shrink-0 rounded shadow-none" data-skill-icon /> : <span className="mt-0.5 size-6 shrink-0 rounded bg-muted" />}
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold leading-5">
          <span className="truncate">{ability?.name ?? "—"}</span>
          <span className="sr-only">{props.championName}</span>
        </h3>
        {ability && <div data-ability-body><SafeBlockHtml html={ability.bodyHtml || ability.summary} className="break-words text-xs leading-relaxed text-foreground/80" /></div>}
      </div>
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
