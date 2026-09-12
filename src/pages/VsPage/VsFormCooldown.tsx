import type { AbilityV2 } from "@/data/contracts/championData";
import type { VsSideKey } from "./vsState";
import { VsCooldownValue } from "./VsCooldownValue";
import { formCooldownAtRank, comparisonCooldownAtRank } from "./vsCooldownTable";

export function VsFormCooldown(props: {
  ability: AbilityV2; peer?: AbilityV2; rank: number;
  side: VsSideKey; slot: string; format: (value: number) => string;
}) {
  const forms = props.ability.forms?.map((form) => ({ form, value: formCooldownAtRank(props.ability, form, props.rank) })) ?? [];
  if (forms.every(({ value }) => value === null)) {
    return <VsCooldownValue value={null} peer={null} kind="cooldown" side={props.side} slot={props.slot} rank={props.rank} format={props.format} />;
  }
  return <div className="flex items-center justify-center gap-1.5">
    {forms.map(({ form, value }) => <div key={form.key} data-form-cooldown={form.key} title={form.label} className="flex items-baseline justify-center gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground">{form.key}</span>
      <VsCooldownValue value={value} peer={comparisonCooldownAtRank(props.peer, props.rank, form.key)} kind="cooldown" side={props.side} slot={props.slot} rank={props.rank} format={props.format} />
    </div>)}
  </div>;
}
