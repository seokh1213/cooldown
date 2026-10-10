import { ChampionIcon } from "@/shared/ui/icons/champion-icon";
import { AbilityIcon } from "@/shared/ui/icons/ability-icon";
import type { AbilityV2, ChampionDetailV2 } from "@/domain/game/contracts/championData";
import { SafeBlockHtml } from "@/shared/ui/safe-html";
import { AbilityFormDetails } from "@/features/champions/comparison/tooltip/AbilityFormDetails";
import { AbilityStructuredDetails } from "@/features/champions/comparison/tooltip/AbilityStructuredDetails";
import { AbilityFormIcon } from "@/shared/ui/icons/ability-form-icon";
import { useTranslation } from "@/shared/i18n";
import type { VsSideKey } from "../workspace/vsState";
import { rankCooldowns } from "./vsCooldownTable";

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

/** 랭크별 값을 "25 / 23 / 21초" 로. 값이 없으면 undefined, 모든 랭크가 같으면 하나만 적는다. */
function rankLine(ability: AbilityV2, values: readonly number[] | undefined, format: (value: number) => string, unit: string): string | undefined {
  const ranks = rankCooldowns({ ability, values: values ?? [], columns: ability.maxRank }).filter((value): value is number => value !== null);
  if (!ranks.length) return undefined;
  const shown = ranks.every((value) => value === ranks[0]) ? [ranks[0]] : ranks;
  return `${shown.map(format).join(" / ")}${unit}`;
}

/**
 * 설명 아래 실제 쿨타임. 설명 문장만으로는 수치를 찾기 어렵다는 요청(2026-09-29)에 따라 흐린 구분선 뒤에 적는다.
 * 형태가 둘인 스킬은 형태 설명마다 이미 쿨타임 줄이 있어(`AbilityFormDetails`) 적지 않는다. 충전형은 재충전 대기시간과 최대 충전 수를 한 줄씩 더.
 */
function VsAbilityCooldowns({ ability }: { ability: AbilityV2 }) {
  const { t, lang } = useTranslation();
  if (ability.forms) return null;
  const format = new Intl.NumberFormat(lang.replace("_", "-"), { maximumFractionDigits: 3 }).format;
  const unit = ` ${t.comparison.seconds}`;
  const shown = [
    { label: t.comparison.cooldownNote, value: rankLine(ability, ability.cooldownSeconds, format, unit) },
    { label: t.common.rechargeTime, value: rankLine(ability, ability.rechargeSeconds, format, unit) },
    // 대화창 머리(getCooldownText)는 "(최대: 2개)" 를 붙이는데 여기만 빠져 있었다(2026-09-30).
    { label: t.common.maxCharges, value: ability.maxCharges ? `${ability.maxCharges}${t.common.items}` : undefined },
  ].filter((line): line is { label: string; value: string } => Boolean(line.value));
  if (!shown.length) return null;
  return (
    <dl data-ability-cooldowns className="mt-2 space-y-0.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
      {shown.map((line) => (
        <div key={line.label} className="flex flex-wrap gap-x-2">
          <dt>{line.label}</dt>
          <dd className="tabular-nums text-foreground/80">{line.value}</dd>
        </div>
      ))}
    </dl>
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
              ? <AbilityFormDetails forms={ability.forms} ddragonVersion={props.version} />
              : <SafeBlockHtml html={ability.bodyHtml || ability.summary} className="break-words text-xs leading-relaxed text-foreground/80" />}
            {!ability.forms && ability.levelValues && ability.levelValues.length > 0 && (
              <div className="mt-3">
                <AbilityStructuredDetails levelValues={ability.levelValues} />
              </div>
            )}
            <VsAbilityCooldowns ability={ability} />
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
