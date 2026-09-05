import ChampionSelector from "@/components/features/ChampionSelector";
import type { Champion } from "@/types";
import type { NormalizedItem } from "@/types/combatNormalized";
import { SimulationItemPicker } from "./SimulationItemPicker";

interface SimulationSelectorsProps {
  champions: Champion[];
  attacker: Champion | null;
  target: Champion | null;
  attackerOpen: boolean;
  targetOpen: boolean;
  itemOpen: boolean;
  itemSlot: number | null;
  selectedItemId: string | null;
  items: readonly NormalizedItem[];
  ddragonVersion: string;
  onAttackerOpenChange: (open: boolean) => void;
  onTargetOpenChange: (open: boolean) => void;
  onItemOpenChange: (open: boolean) => void;
  onSelectAttacker: (champion: Champion) => void;
  onSelectTarget: (champion: Champion) => void;
  onSelectItem: (itemId: string | null) => void;
}

export function SimulationSelectors(props: SimulationSelectorsProps) {
  return (
    <>
      <ChampionSelector
        championList={props.champions}
        selectedChampions={props.attacker ? [props.attacker] : []}
        onSelect={props.onSelectAttacker}
        selectionMode="single"
        onClose={() => props.onAttackerOpenChange(false)}
        open={props.attackerOpen}
        onOpenChange={props.onAttackerOpenChange}
      />
      <ChampionSelector
        championList={props.champions}
        selectedChampions={props.target ? [props.target] : []}
        onSelect={props.onSelectTarget}
        selectionMode="single"
        onClose={() => props.onTargetOpenChange(false)}
        open={props.targetOpen}
        onOpenChange={props.onTargetOpenChange}
      />
      <SimulationItemPicker
        open={props.itemOpen}
        activeSlotIndex={props.itemSlot}
        selectedItemId={props.selectedItemId}
        items={props.items}
        ddragonVersion={props.ddragonVersion}
        onOpenChange={props.onItemOpenChange}
        onSelect={props.onSelectItem}
      />
    </>
  );
}
