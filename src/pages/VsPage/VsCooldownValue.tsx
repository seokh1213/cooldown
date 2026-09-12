import { useTranslation } from "@/i18n";
import { isShorterCooldown } from "./vsCooldownTable";
import type { VsSideKey } from "./vsState";

export function VsCooldownValue(props: {
  value: number | null; peer: number | null; kind: "cooldown" | "recharge";
  side: VsSideKey; slot: string; rank: number; format: (value: number) => string;
}) {
  const { t } = useTranslation();
  const shorter = isShorterCooldown(props.value, props.peer);
  const color = shorter ? "bg-emerald-500/10 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300" : props.value === null ? "text-muted-foreground/50" : "";
  return (
    <span
      data-cooldown={props.kind === "cooldown" ? "" : undefined}
      data-recharge={props.kind === "recharge" ? "" : undefined}
      data-side={props.side} data-slot={props.slot} data-rank={props.rank} data-shorter={shorter || undefined}
      title={shorter ? t.comparison.shorter : undefined}
      className={"inline-block rounded px-1 " + color + (props.kind === "cooldown" ? " min-w-8 text-base font-semibold leading-6" : " font-medium")}
    >
      {props.value === null ? "—" : props.format(props.value)}
    </span>
  );
}
