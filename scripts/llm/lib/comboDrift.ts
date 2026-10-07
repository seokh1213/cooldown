import type { ChampionCard } from "../../../src/lib/knowledge/facts";
import type { ComboGuideFile } from "../../../src/lib/knowledge/comboGuide";
import { abilityTextHash } from "./comboNotes";
import { normalizeTooltipText } from "./tooltipFingerprint";

export function comboDrift(guides: ComboGuideFile, previous: ChampionCard[], next: ChampionCard[]) {
  return guides.champions.flatMap(guide => {
    const before = previous.find(card => card.id === guide.champion), after = next.find(card => card.id === guide.champion);
    if (after && abilityTextHash(after) === guide.abilityTextHash) return [];
    const slots = after?.spells.flatMap(spell => {
      const old = before?.spells.find(entry => entry.slot === spell.slot);
      return old?.text === spell.text ? [] : [{ slot: spell.slot, before: old?.text ?? null, after: spell.text,
        numericOnly: Boolean(old && normalizeTooltipText(old.text) === normalizeTooltipText(spell.text)) }];
    }) ?? [];
    return [{ champion: guide.champion, previousHash: guide.abilityTextHash, nextHash: after ? abilityTextHash(after) : null,
      baselineVerified: Boolean(before && abilityTextHash(before) === guide.abilityTextHash), slots,
      patterns: guide.patterns, laning: guide.laning ?? null,
      status: "needs-review", warning: "numericOnly는 분류용입니다. 지속시간·거리·조건 수치 변경도 검수가 필요합니다." }];
  });
}
