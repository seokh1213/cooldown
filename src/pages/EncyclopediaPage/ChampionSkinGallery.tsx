import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { championSplashUrl } from "@/data/assets/riotAssetUrls";
import type { ChampionProfile } from "@/data/contracts/championProfile";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

function SplashImage({ src, name }: { src: string; name: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  return (
    <div className="relative aspect-[1215/717] overflow-hidden rounded-md bg-muted">
      {status !== "loaded" && (
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          {status === "error" ? t.championProfile.imageError : t.championSelector.loading}
          {status === "error" && <Button size="sm" variant="outline" onClick={() => { setStatus("loading"); setAttempt((value) => value + 1); }}>{t.app.retry}</Button>}
        </div>
      )}
      {status !== "error" && <img key={attempt} src={src} alt={name} width={1215} height={717} onLoad={() => setStatus("loaded")} onError={() => setStatus("error")} className={"relative h-full w-full object-contain " + (status === "loaded" ? "opacity-100" : "opacity-0")} data-skin-splash />}
    </div>
  );
}

export function ChampionSkinGallery({ champion }: { champion: ChampionProfile["champion"] }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const skin = champion.skins[index];
  const skinName = (name: string) => name === "default" ? t.championProfile.defaultSkin : name;
  if (!skin) return <p className="py-8 text-sm text-muted-foreground">{t.championProfile.noSkins}</p>;
  const name = skinName(skin.name);
  return (
    <section aria-label={t.championProfile.skins} className="min-w-0">
      <SplashImage key={champion.id + ":" + skin.num} src={championSplashUrl(champion.id, skin.num)} name={champion.name + " · " + name} />
      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="champion-skin" className="shrink-0 text-xs font-medium">{t.championProfile.skins}</label>
        <select id="champion-skin" value={index} onChange={(event) => setIndex(Number(event.target.value))} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary">
          {champion.skins.map((option, position) => <option key={option.num} value={position}>{skinName(option.name)}</option>)}
        </select>
        <Button variant="outline" size="icon" disabled={index === 0} aria-label={t.championProfile.previous} onClick={() => setIndex(index - 1)}><ChevronLeft aria-hidden="true" className="size-4" /></Button>
        <Button variant="outline" size="icon" disabled={index === champion.skins.length - 1} aria-label={t.championProfile.next} onClick={() => setIndex(index + 1)}><ChevronRight aria-hidden="true" className="size-4" /></Button>
      </div>
      <p aria-live="polite" className="mt-2 text-right text-xs text-muted-foreground tabular-nums">{index + 1} / {champion.skins.length} · {name}</p>
    </section>
  );
}
