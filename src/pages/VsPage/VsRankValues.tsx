import { useTranslation } from "@/i18n";
import type { AbilityV2 } from "@/data/contracts/championData";
import { rankCooldowns } from "./vsCooldownTable";

function RankSequence(props: {
  values: (number | null)[];
  kind: "cooldown" | "recharge";
}) {
  const { t, lang } = useTranslation();
  const formatter = new Intl.NumberFormat(lang.replace("_", "-"), {
    maximumFractionDigits: 3,
  });
  return (
    <ol aria-label={t.comparison.rank} className="flex flex-wrap items-baseline gap-x-0.5 gap-y-0.5 tabular-nums">
      {props.values.map((value, index) => (
        <li key={index} className="inline-flex items-baseline gap-0.5">
          <span
            data-cooldown={props.kind === "cooldown" ? "" : undefined}
            data-recharge={props.kind === "recharge" ? "" : undefined}
            data-rank={index + 1}
            aria-label={props.kind === "recharge" ? t.common.rechargeTime : t.comparison.rank + " " + (index + 1)}
            title={t.comparison.rank + " " + (index + 1)}
            className={props.kind === "cooldown" ? "text-sm font-semibold leading-6 sm:text-xl sm:leading-7" : "text-sm font-medium"}
          >
            {value === null ? "—" : formatter.format(value)}
          </span>
          {index < props.values.length - 1 && (
            <span aria-hidden="true" className="text-xs font-normal text-muted-foreground/60 sm:mx-0.5">/</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function VsRankValues({ ability }: { ability: AbilityV2 }) {
  const { t } = useTranslation();
  const cooldowns = rankCooldowns({
    ability, columns: ability.maxRank, values: ability.cooldownSeconds,
  });
  const recharge = rankCooldowns({
    ability, columns: ability.maxRank, values: ability.rechargeSeconds ?? [],
  });
  return (
    <div className="mt-1.5 sm:ml-10">
      <RankSequence values={cooldowns} kind="cooldown" />
      {recharge.some((value) => value !== null) && (
        <div className="mt-1.5">
          <p className="mb-0.5 text-[11px] text-muted-foreground">
            {t.common.rechargeTime} · {t.comparison.seconds}
            {ability.maxCharges ? " · " + t.common.max + " " + ability.maxCharges : ""}
          </p>
          <RankSequence values={recharge} kind="recharge" />
        </div>
      )}
    </div>
  );
}
