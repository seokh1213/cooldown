import { championIconUrl, passiveIconUrl, spellIconUrl } from "@/data/assets/riotAssetUrls";
import type { AbilityV2, ChampionDetailV2 } from "@/data/contracts/championData";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import { AbilityStructuredDetails } from "@/components/features/ChampionComparison/AbilityStructuredDetails";
import { AbilityFormDetails } from "@/components/features/ChampionComparison/AbilityFormDetails";
import { AbilityFormIcon } from "@/components/features/ChampionComparison/AbilityFormIcon";
import type { VsSideKey } from "./vsState";

const LIST_SLOTS = ["P", "Q", "W", "E", "R"] as const;
type ListSlot = (typeof LIST_SLOTS)[number];

function abilityIcon(ability: AbilityV2, slot: ListSlot, version: string, label: string) {
  if (ability.forms) return <AbilityFormIcon forms={ability.forms} label={label} className="size-7 rounded" />;
  const src = slot === "P" ? passiveIconUrl(version, ability.iconFile) : spellIconUrl(version, ability.id);
  return <img src={src} alt="" width={28} height={28} className="size-7 shrink-0 rounded shadow-none" data-skill-icon />;
}

/** One ability, always open: icon, slot and name, then the full description. */
export function VsAbilityItem(props: { ability?: AbilityV2; slot: ListSlot; side: VsSideKey; championName: string; version: string }) {
  const { ability, slot } = props;
  return (
    <div
      data-testid={slot === "P" ? "vs-" + props.side + "-P" : undefined}
      data-ability-info data-side={props.side} data-slot={slot}
      className="flex min-w-0 items-start gap-2.5 border-b border-border/50 py-3 last:border-b-0"
    >
      <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1">
        {ability ? abilityIcon(ability, slot, props.version, props.championName + " " + slot) : <span className="size-7 rounded bg-muted" />}
        <span className="text-[10px] leading-3 text-muted-foreground">{slot}</span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[13px] font-semibold leading-5">
          <span className="truncate">{ability?.name ?? "—"}</span>
          <span className="sr-only"> · {props.championName} {slot}</span>
        </h3>
        {ability && (
          <div data-ability-body className="mt-1">
            {ability.forms
              ? <AbilityFormDetails forms={ability.forms} />
              : <SafeBlockHtml html={ability.bodyHtml || ability.summary} className="break-words text-xs leading-relaxed text-foreground/80" />}
          </div>
        )}
      </div>
    </div>
  );
}

/** Every ability of one champion, passive first, laid out like a reading list rather than behind clicks. */
export function VsSkillList(props: { side: VsSideKey; detail: ChampionDetailV2; version: string }) {
  const { champion } = props.detail;
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <img src={championIconUrl(props.version, champion.id)} alt="" width={24} height={24} className="size-6 rounded shadow-none" />
        <span className="text-[13px] font-semibold">{champion.name}</span>
      </div>
      {LIST_SLOTS.map((slot) => (
        <VsAbilityItem key={slot} slot={slot} side={props.side} ability={champion.abilities[slot]} championName={champion.name} version={props.version} />
      ))}
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
