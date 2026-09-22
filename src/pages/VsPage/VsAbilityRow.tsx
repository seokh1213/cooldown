import { ChampionIcon } from "@/components/ui/champion-icon";
import { AbilityIcon } from "@/components/ui/ability-icon";
import type { AbilityV2, ChampionDetailV2 } from "@/data/contracts/championData";
import { SafeBlockHtml } from "@/components/ui/safe-html";
import { AbilityStructuredDetails } from "@/components/features/ChampionComparison/AbilityStructuredDetails";
import { AbilityFormDetails } from "@/components/features/ChampionComparison/AbilityFormDetails";
import { AbilityFormIcon } from "@/components/features/ChampionComparison/AbilityFormIcon";
import type { VsSideKey } from "./vsState";

const LIST_SLOTS = ["P", "Q", "W", "E", "R"] as const;
type ListSlot = (typeof LIST_SLOTS)[number];

// Desktop places both champions' items for one slot on the same grid row so long texts never push
// Q next to W. Literal class names keep Tailwind's scanner happy.
const COLUMN_CLASS: Record<VsSideKey, string> = { mine: "sm:col-start-1", opponent: "sm:col-start-2" };
const ROW_CLASS = ["sm:row-start-1", "sm:row-start-2", "sm:row-start-3", "sm:row-start-4", "sm:row-start-5", "sm:row-start-6"];

function abilityIcon(ability: AbilityV2, slot: ListSlot, championId: string, version: string, label: string) {
  if (ability.forms) return <AbilityFormIcon forms={ability.forms} label={label} ddragonVersion={version} className="size-7 rounded" />;
  return (
    <AbilityIcon
      championId={championId}
      slot={slot}
      ddragonVersion={version}
      className="block size-7 shrink-0 rounded shadow-none"
    />
  );
}

/** One ability, always open: icon, slot and name, then the full description. */
export function VsAbilityItem(props: { ability?: AbilityV2; slot: ListSlot; side: VsSideKey; championId: string; championName: string; version: string; className?: string }) {
  const { ability, slot } = props;
  return (
    <div
      data-testid={slot === "P" ? "vs-" + props.side + "-P" : undefined}
      data-ability-info data-side={props.side} data-slot={slot}
      className={"flex min-w-0 items-start gap-2.5 border-b border-border/50 py-3 " + (props.className ?? "")}
    >
      <div className="mt-0.5 flex shrink-0 flex-col items-center gap-1">
        {ability ? abilityIcon(ability, slot, props.championId, props.version, props.championName + " " + slot) : <span className="size-7 rounded bg-muted" />}
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

/**
 * Every ability of one champion, passive first, always open. Rendered as grid children of the parent:
 * stacked champion by champion on a phone, slot by slot across two columns on a desktop.
 */
export function VsSkillList(props: { side: VsSideKey; detail: ChampionDetailV2; version: string }) {
  const { champion } = props.detail;
  const column = COLUMN_CLASS[props.side];
  return (
    <>
      <div className={"flex min-w-0 items-center gap-2 self-end border-b border-border pb-2 " + column + " " + ROW_CLASS[0] + (props.side === "opponent" ? " mt-8 sm:mt-0" : "")}>
        <ChampionIcon id={champion.id} ddragonVersion={props.version} className="block size-6 rounded shadow-none" />
        <span className="text-[13px] font-semibold">{champion.name}</span>
      </div>
      {LIST_SLOTS.map((slot, index) => (
        <VsAbilityItem key={slot} slot={slot} side={props.side} ability={champion.abilities[slot]} championId={champion.id} championName={champion.name} version={props.version} className={column + " " + ROW_CLASS[index + 1]} />
      ))}
    </>
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
