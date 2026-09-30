import { useState } from "react";
import { ArrowLeftRight, Check, RotateCcw, Share } from "lucide-react";
import ChampionSelector from "@/components/features/ChampionSelector";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/clipboard";
import { useTranslation } from "@/i18n";
import type { Champion } from "@/types";
import type {
  DataLocale,
  StaticDataSources,
} from "@/data/contracts/staticData";
import { VsComparison } from "./VsComparison";
import { useVsState } from "./useVsWorkspace";
import { parseVsState, serializeVsState, type VsSideKey } from "./vsState";

interface VsPageProps {
  lang: DataLocale;
  championList: Champion[] | null;
  patchVersion: string;
  sources: StaticDataSources;
}

/**
 * 바꾸기·공유·초기화. 쿨타임 표 제목과 같은 줄 오른쪽에 선다(`VsCooldownMatrix` 가 자리를 준다).
 * 휴대폰에서는 아이콘만 남기고, 공유는 복사 아이콘이 아니라 공유 아이콘(네모 위 화살표)이다.
 */
function VsActions(props: {
  copied: boolean;
  onShare: () => void;
  onReset: () => void;
  onSwap: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
      <Button variant="ghost" size="icon" className="size-8" aria-label={t.comparison.swap} title={t.comparison.swap} onClick={props.onSwap}>
        <ArrowLeftRight aria-hidden="true" className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" aria-label={t.comparison.share} title={t.comparison.share} onClick={props.onShare}>
        {props.copied ? <Check aria-hidden="true" className="size-4" /> : <Share aria-hidden="true" className="size-4" />}
        <span className="hidden sm:inline">{t.comparison.share}</span>
      </Button>
      <Button variant="ghost" size="icon" className="size-8" aria-label={t.encyclopedia.reset} title={t.encyclopedia.reset} onClick={props.onReset}>
        <RotateCcw aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}

export default function VsPage(props: VsPageProps) {
  const { t } = useTranslation();
  const { state, update } = useVsState(props.championList);
  const [selecting, setSelecting] = useState<VsSideKey | null>(null);
  const [share, setShare] = useState<{ state: string; success: boolean }>();
  const serialized = serializeVsState(state);
  const shared = share?.state === serialized ? share : undefined;
  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.search = serialized || "a=&t=";
    try {
      const success = await copyTextToClipboard(url.toString());
      setShare({ state: serialized, success });
    } catch {
      setShare({ state: serialized, success: false });
    }
  };
  return (
    <div className="mx-auto w-full max-w-[800px] px-2 py-4 sm:px-6 md:py-5">
      <h1 className="sr-only">{t.comparison.title}</h1>
      <div
        role="status"
        className={
          shared?.success === false
            ? "mb-3 text-xs text-destructive"
            : "sr-only"
        }
      >
        {shared &&
          (shared.success
            ? t.comparison.copySuccess
            : t.comparison.copyFailed)}
      </div>
      <VsComparison
        state={state}
        patchVersion={props.patchVersion}
        sources={props.sources}
        locale={props.lang}
        actions={
          <VsActions
            copied={Boolean(shared?.success)}
            onShare={copyLink}
            onReset={() => update(parseVsState(""))}
            onSwap={() => update({ mine: state.opponent, opponent: state.mine })}
          />
        }
        onSelect={setSelecting}
      />
      {selecting && (
        <ChampionSelector
          championList={props.championList}
          selectedChampions={[]}
          selectionMode="single"
          open
          onClose={() => setSelecting(null)}
          onOpenChange={(open) => {
            if (!open) setSelecting(null);
          }}
          onSelect={(champion) => {
            update({
              ...state,
              [selecting]: { id: champion.id },
            });
            setSelecting(null);
          }}
        />
      )}
    </div>
  );
}
