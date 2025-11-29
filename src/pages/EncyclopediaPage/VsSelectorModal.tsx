import ChampionSelector from "@/components/features/ChampionSelector";
import { Champion } from "@/types";
import { Tab, VsSelectorMode, ChampionWithInfo } from "./types";
import { useTranslation } from "@/i18n";

interface VsSelectorModalProps {
  open: boolean;
  vsSelectorMode: VsSelectorMode | null;
  tabs: Tab[];
  championList: Champion[] | null;
  selectedChampions: ChampionWithInfo[];
  onSelect: (champion: Champion) => void;
  onClose: () => void;
  onOpenChange: (open: boolean) => void;
}

export function VsSelectorModal({
  open,
  vsSelectorMode,
  tabs,
  championList,
  selectedChampions,
  onSelect,
  onClose,
  onOpenChange,
}: VsSelectorModalProps) {
  const { t } = useTranslation();

  if (!open || !vsSelectorMode) return null;

  const tab = tabs.find((t) => t.id === vsSelectorMode.tabId);
  if (!tab) return null;

  // select-second 모드일 때는 일반 탭(normal)이어도 허용
  // change-champion-a, change-champion-b 모드일 때는 VS 탭이어야 함
  if (vsSelectorMode.mode !== 'select-second' && tab.mode !== 'vs') {
    return null;
  }

  // VS 모드에서 변경할 챔피언이 아닌, 기준이 되는 챔피언을 표시
  // change-champion-a: A를 바꾸는 것 → B가 기준 (champions[1])
  // change-champion-b: B를 바꾸는 것 → A가 기준 (champions[0])
  // select-second: 두 번째 챔피언 선택 → A가 기준 (champions[0])
  const currentChampionId =
    vsSelectorMode.mode === 'change-champion-a'
      ? tab.champions[1]
      : tab.champions[0];

  if (!currentChampionId) return null;

  return (
    <ChampionSelector
      championList={championList}
      selectedChampions={selectedChampions}
      onSelect={onSelect}
      onClose={onClose}
      open={open}
      onOpenChange={onOpenChange}
      vsMode={{
        currentChampionId,
        title: t.encyclopedia.selectOpponent,
      }}
    />
  );
}

