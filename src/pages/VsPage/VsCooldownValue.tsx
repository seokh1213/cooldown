import { useTranslation } from "@/i18n";
import { isShorterCooldown } from "./vsCooldownTable";
import type { VsSideKey } from "./vsState";

/** Shorter wins weight, longer loses ink, a tie or an unopposed value stays plain. No fills, no hue. */
export function VsCooldownValue(props: {
  value: number | null; peer: number | null; kind: "cooldown" | "recharge";
  side: VsSideKey; slot: string; rank: number; format: (value: number) => string;
}) {
  const { t } = useTranslation();
  const shorter = isShorterCooldown(props.value, props.peer);
  const longer = isShorterCooldown(props.peer, props.value);
  const tone = props.value === null
    ? "text-muted-foreground/35"
    : shorter
      ? "font-semibold text-foreground"
      : longer
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <span
      data-cooldown={props.kind === "cooldown" ? "" : undefined}
      data-recharge={props.kind === "recharge" ? "" : undefined}
      data-side={props.side} data-slot={props.slot} data-rank={props.rank} data-shorter={shorter || undefined}
      title={shorter ? t.comparison.shorter : undefined}
      className={"inline-block tabular-nums " + tone + (props.kind === "cooldown" ? " text-[13px] leading-[18px] sm:text-[15px] sm:leading-5" : " text-[11px]")}
    >
      {props.value === null ? "—" : props.format(props.value)}
    </span>
  );
}
