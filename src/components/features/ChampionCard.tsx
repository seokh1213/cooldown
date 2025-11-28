import React, { useState, useEffect, useCallback, useMemo } from "react";
import { SPLASH_IMG_URL, CHAMP_ICON_URL, getChampionInfo } from "@/services/api";
import SplashImage from "./SplashImage";
import ChampionSquare from "./ChampionSquare";
import SkillTable from "./SkillTable";
import { Champion } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChampionCardProps {
  lang: string;
  champion: Champion;
  onRemove?: () => void;
}

const ChampionLoader = React.memo(() => (
  <Card className="w-full max-w-md mx-auto flex flex-col p-0">
    <Skeleton className="w-full h-[180px] rounded-t-md" />
    <div className="p-4 space-y-4">
      <Skeleton className="h-4 w-[100px] ml-auto" />
      <div className="flex gap-4">
        <Skeleton className="w-[120px] h-[120px] rounded-lg" />
        <div className="flex-1 grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-[40px] rounded" />
          ))}
        </div>
      </div>
    </div>
  </Card>
));

ChampionLoader.displayName = "ChampionLoader";

function ChampionCard({ lang, champion, onRemove }: ChampionCardProps) {
  const [championInfo, setChampionInfo] = useState<Champion | null>(null);
  const [skinIdx, setSkin] = useState(1);

  useEffect(() => {
    let cancelled = false;
    getChampionInfo(champion.version || "", lang, champion.id).then((data) => {
      if (!cancelled) {
        setChampionInfo(data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [champion.version, lang, champion.id]);

  const changeHandler = useCallback(
    (inc: number) => {
      if (!championInfo?.skins) return;
      const totalSkins = championInfo.skins.length;
      setSkin((prevIdx) => {
        let newIdx = prevIdx + inc;
        if (newIdx >= totalSkins) newIdx = 0;
        if (newIdx < 0) newIdx = totalSkins - 1;
        return newIdx;
      });
    },
    [championInfo]
  );

  const splashImageUrl = useMemo(() => {
    if (!championInfo?.skins?.[skinIdx]) return "";
    return SPLASH_IMG_URL(
      `${championInfo.id}_${championInfo.skins[skinIdx].num}`
    );
  }, [championInfo, skinIdx]);

  const nextSkinUrl = useMemo(() => {
    if (!championInfo?.skins) return undefined;
    const nextIdx = skinIdx + 1 >= championInfo.skins.length ? 0 : skinIdx + 1;
    return SPLASH_IMG_URL(
      `${championInfo.id}_${championInfo.skins[nextIdx].num}`
    );
  }, [championInfo, skinIdx]);

  const prevSkinUrl = useMemo(() => {
    if (!championInfo?.skins) return undefined;
    const prevIdx = skinIdx - 1 < 0 ? championInfo.skins.length - 1 : skinIdx - 1;
    return SPLASH_IMG_URL(
      `${championInfo.id}_${championInfo.skins[prevIdx].num}`
    );
  }, [championInfo, skinIdx]);

  const skinName = useMemo(() => {
    if (!championInfo?.skins?.[skinIdx]) return "";
    return championInfo.skins[skinIdx].name === "default"
      ? championInfo.name
      : championInfo.skins[skinIdx].name;
  }, [championInfo, skinIdx]);

  const champIconUrl = useMemo(
    () => CHAMP_ICON_URL(champion.version || "", champion.id),
    [champion.version, champion.id]
  );

  if (!championInfo) {
    return <ChampionLoader />;
  }

  return (
    <Card className={cn(
      "w-full max-w-md mx-auto flex flex-col p-0",
      "shadow-sm border-border/50",
      "group hover:shadow-lg hover:shadow-primary/5 hover:border-primary/30",
      "transition-all duration-300 ease-out",
      "hover:-translate-y-1"
    )}>
      <div className="relative overflow-hidden rounded-t-md">
        <SplashImage
          src={splashImageUrl}
          name={skinName}
          changeHandler={changeHandler}
          nextSkinSrc={nextSkinUrl}
          prevSkinSrc={prevSkinUrl}
        />
        {onRemove && (
          <Button
            variant="destructive"
            size="icon"
            onClick={onRemove}
            className={cn(
              "absolute top-3 right-3 z-10",
              "opacity-0 group-hover:opacity-100",
              "transition-all duration-200",
              "h-9 w-9 bg-destructive/95 hover:bg-destructive",
              "shadow-lg shadow-destructive/30",
              "hover:scale-110 active:scale-95"
            )}
            aria-label={`Remove ${championInfo.name}`}
            title={`${championInfo.name} 제거`}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex p-2 bg-card border-t border-border/50">
        <ChampionSquare name={championInfo.name} squareSrc={champIconUrl} />
        <SkillTable
          championInfo={championInfo}
          version={champion.version || ""}
        />
      </div>
    </Card>
  );
}

export default React.memo(ChampionCard);
