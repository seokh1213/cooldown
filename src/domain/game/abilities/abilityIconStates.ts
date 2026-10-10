import definitions from "../../../../dev/data/overrides/abilityIconStates.json";

interface IconVariant {
  key: "A" | "B";
  iconPath: string;
  labels: Record<"ko_KR" | "en_US" | "zh_CN", string>;
}

interface AbilityIconState {
  spellId: string;
  thumbnailName?: string;
  defaultIconPath?: string;
  variants?: IconVariant[];
  reason?: string;
}

export const ABILITY_ICON_STATES = definitions as Record<string, AbilityIconState>;

export function spellIconStates(spellId: string): AbilityIconState | undefined {
  return Object.values(ABILITY_ICON_STATES).find(state => state.spellId === spellId);
}
