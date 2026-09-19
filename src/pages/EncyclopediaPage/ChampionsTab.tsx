import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import ChampionSelector from "@/components/features/ChampionSelector";
import { Button } from "@/components/ui/button";
import { championIconUrl } from "@/data/assets/riotAssetUrls";
import { useChampionSearch } from "@/hooks/useChampionSearch";
import { useTranslation } from "@/i18n";
import { ChampionSkinGallery } from "./ChampionSkinGallery";
import { useChampionProfile } from "./useChampionProfile";
import type { EncyclopediaPageProps } from "./types";

export function ChampionsTab(props: EncyclopediaPageProps) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [selecting, setSelecting] = useState(false);
  const [search, setSearch] = useState("");
  const champions = useChampionSearch(props.championList, search);
  const selected = props.championList?.find((champion) => champion.id === params.get("champion"));
  const identity = useMemo(() => ({ patchVersion: props.patchVersion, sources: props.sources }), [props.patchVersion, props.sources]);
  const { profile, error, retry } = useChampionProfile(selected?.id ?? "", identity, props.lang);
  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("champion", id);
    setParams(next);
    setSelecting(false);
  };
  return (
    <div className="py-4" data-champions-tab>
      {selected && (
        <Button variant="ghost" size="sm" className="mb-3 -ml-2 gap-1.5 text-muted-foreground" onClick={() => {
          const next = new URLSearchParams(params);
          next.delete("champion");
          setParams(next);
        }}>
          <ArrowLeft aria-hidden="true" className="size-4" />{t.championProfile.backToList}
        </Button>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {selected ? (
          <button type="button" onClick={() => setSelecting(true)} aria-label={t.comparison.select} className="flex items-center gap-3 rounded text-left focus-visible:outline-2 focus-visible:outline-primary">
            <img src={championIconUrl(props.ddragonVersion, selected.id)} alt="" width={48} height={48} className="size-12 rounded" />
            <span><h1 className="text-xl font-semibold">{selected.name}</h1><span className="text-sm text-muted-foreground">{selected.title}</span></span>
            <ChevronDown aria-hidden="true" className="ml-2 size-4 text-muted-foreground" />
          </button>
        ) : (
          <div><h1 className="text-lg font-semibold">{t.championProfile.tab}</h1><p className="mt-1 text-sm text-muted-foreground">{t.championProfile.intro}</p></div>
        )}
        <span className="text-xs text-muted-foreground">{props.patchVersion}</span>
      </div>
      {!selected && (
        <div>
          <label className="mb-4 flex max-w-md items-center gap-2 rounded-md border border-input px-3 focus-within:ring-2 focus-within:ring-primary">
            <Search aria-hidden="true" className="size-4 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label={t.comparison.select} placeholder={t.comparison.select} className="w-full bg-transparent py-2.5 text-base md:text-sm outline-none" />
          </label>
          <div className="grid grid-cols-5 gap-x-2 gap-y-3 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-16" data-champion-grid>
            {champions.map((champion) => (
              <button key={champion.id} type="button" onClick={() => select(champion.id)} className="group flex min-w-0 flex-col items-center gap-1.5 rounded py-1 text-center focus-visible:outline-2 focus-visible:outline-primary">
                <img src={championIconUrl(props.ddragonVersion, champion.id)} alt="" width={44} height={44} loading="lazy" className="size-11 rounded group-hover:ring-2 group-hover:ring-primary" />
                <span className="text-[11px] leading-tight group-hover:text-primary">{champion.name}</span>
              </button>
            ))}
          </div>
          {!champions.length && <p role="status" className="py-6 text-sm text-muted-foreground">{t.championSelector.noResults}</p>}
        </div>
      )}
      {selected && !profile && <div role="status" className="py-16 text-center text-sm text-muted-foreground">{error ? <>{t.app.loadError}<Button onClick={retry} variant="outline" size="sm" className="ml-3">{t.app.retry}</Button></> : t.championSelector.loading}</div>}
      {profile && (
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]" data-champion-profile={profile.champion.id}>
          <ChampionSkinGallery key={profile.champion.id + ":" + props.lang} champion={profile.champion} />
          <section aria-label={t.championProfile.story} className="border-t border-border pt-5 lg:border-t-0 lg:pt-0">
            <h2 className="text-base font-semibold">{t.championProfile.story}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t.championProfile.officialBio}</p>
            <p data-champion-lore className="mt-4 whitespace-pre-line text-sm leading-7 text-foreground/85">{profile.champion.lore || t.championProfile.noStory}</p>
          </section>
        </div>
      )}
      {selecting && <ChampionSelector championList={props.championList} selectedChampions={[]} selectionMode="single" open onClose={() => setSelecting(false)} onOpenChange={setSelecting} onSelect={(champion) => select(champion.id)} />}
    </div>
  );
}
