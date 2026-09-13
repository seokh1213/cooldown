import { useState } from "react";
import { ArrowLeftRight, Check, Copy, RotateCcw } from "lucide-react";
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

function VsHeader(props: {
  patchVersion: string;
  copied: boolean;
  onShare: () => void;
  onReset: () => void;
  onSwap: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="min-w-0 px-0.5">
        <h1 className="sr-only">
          {t.comparison.title}
        </h1>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">{t.comparison.description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="mr-2 text-xs tabular-nums text-muted-foreground">
          {props.patchVersion}
        </span>
        <Button variant="ghost" size="icon" aria-label={t.comparison.swap} onClick={props.onSwap}>
          <ArrowLeftRight aria-hidden="true" className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={props.onShare}
          className="gap-1.5"
        >
          {props.copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
          {t.pages.simulation.share}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.encyclopedia.reset}
          onClick={props.onReset}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
        </Button>
      </div>
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
      <VsHeader
        patchVersion={props.patchVersion}
        copied={Boolean(shared?.success)}
        onShare={copyLink}
        onReset={() => update(parseVsState(""))}
        onSwap={() => update({ mine: state.opponent, opponent: state.mine })}
      />
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
            ? t.pages.simulation.copySuccess
            : t.pages.simulation.copyFailed)}
      </div>
      <VsComparison
        state={state}
        patchVersion={props.patchVersion}
        sources={props.sources}
        locale={props.lang}
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
