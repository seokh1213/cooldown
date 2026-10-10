import { useMemo, useRef } from "react";
import type { AbilityV2 } from "@/domain/game/contracts/championData";
import { toSpell } from "@/infrastructure/mappers/championMapper";
import { AbilityIcon } from "@/shared/ui/ability-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { useTranslation } from "@/shared/i18n";
import type { VsSideKey } from "./vsState";
import { AbilityFormIcon } from "@/shared/ui/ability-form-icon";
import { SkillTooltipContent } from "@/features/champions/comparison/SkillTooltipContent";
import { SKILL_LETTERS } from "@/features/champions/comparison/constants";
import { getCooldownText, getCostText } from "@/features/champions/comparison/utils";

/**
 * 툴팁과 대화창의 속은 쿨타임 화면과 같은 `SkillTooltipContent` 다. 아이콘·이름·쿨타임·비용 머리,
 * 설명, 레벨별 수치·계수·조건까지 한 벌이라 화면마다 다르게 보이지 않는다.
 * 아래 스킬 설명 목록(`VsAbilityRow`)은 표와 다른 글이라 그대로 둔다.
 */
export function VsSkillContent({ ability, slot, version, mobile }: { ability: AbilityV2; slot: string; version: string; mobile: boolean }) {
  const { lang } = useTranslation();
  const spell = useMemo(() => toSpell(ability), [ability]);
  const skillIdx = Math.max(0, (SKILL_LETTERS as readonly string[]).indexOf(slot));
  return <SkillTooltipContent skill={spell} skillIdx={skillIdx} ddragonVersion={version} cooldownText={getCooldownText(spell, lang)} costText={getCostText(spell, lang)} mobile={mobile} />;
}

/**
 * Icon and slot letter only; the name lives in the tooltip and the champion in the row above.
 * 모바일은 탭하면 곧장 대화창이라 툴팁을 두지 않는다. 두면 대화창을 닫을 때 돌아온 포커스가 툴팁을 연다.
 */
export function VsMatrixSkill(props: {
  side: VsSideKey; slot: string; name: string; championId: string; ability?: AbilityV2;
  version: string; boxClass: string; mobile: boolean; onSelect: (ability: AbilityV2, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  const { side, slot, name, championId, ability, version, boxClass, mobile, onSelect } = props;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trigger = (
    <button ref={triggerRef} type="button" disabled={!ability} onClick={(event) => ability && onSelect(ability, event.currentTarget)} aria-label={name + " " + slot + " " + t.comparison.details} className="block w-full min-w-0 px-0.5 pb-2 pt-2.5 hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:cursor-default">
      <span className={boxClass + " gap-1"}>
      {ability?.forms ? <AbilityFormIcon forms={ability.forms} label={name + " " + slot} ddragonVersion={version} className="size-7 sm:size-8" /> : ability ? <AbilityIcon championId={championId} slot={slot} ddragonVersion={version} className="block size-7 shrink-0 rounded shadow-none sm:size-8" /> : <span className="size-7 shrink-0 rounded bg-muted sm:size-8" />}
      <span className="text-[11px] leading-3 text-muted-foreground">{slot}</span>
      <span className="sr-only">{name} · {t.comparison[side]} · {ability?.name ?? "—"}</span>
      </span>
    </button>
  );
  // 두 챔피언은 가운데 빈 열이 가른다(VsCooldownMatrix). 여기서는 경계를 신경 쓰지 않는다.
  return (
    <th id={"vs-" + side + "-" + slot} data-testid={"vs-" + side + "-" + slot} scope="col" className="border-b border-border/60 p-0 align-top font-normal">
      {mobile || !ability ? trigger : (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm space-y-3 p-4 text-left font-normal">
            <VsSkillContent ability={ability} slot={slot} version={version} mobile={false} />
            <div className="flex justify-end pt-1">
              <button type="button" className="text-[11px] text-primary hover:underline" onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (triggerRef.current) onSelect(ability, triggerRef.current); }}>
                {t.skillTooltip.viewDetail}
              </button>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </th>
  );
}
