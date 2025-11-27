import React, { useState, useEffect, useCallback, useMemo } from "react";
import { SPLASH_IMG_URL, CHAMP_ICON_URL, getChampionInfo } from "../api";
import SplashImage from "./SplashImage";
import ChampionSquare from "./ChampionSquare";
import SkillTable from "./SkillTable";
import { Champion } from "../types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ChampionCardProps {
  lang: string;
  champion: Champion;
}

const ChampionLoader = React.memo(() => (
  <Card className="w-[425px] flex flex-col p-0">
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

function ChampionCard({ lang, champion }: ChampionCardProps) {
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
    <Card className="w-[425px] flex flex-col p-0 shadow-md">
      <SplashImage
        src={splashImageUrl}
        name={skinName}
        changeHandler={changeHandler}
        nextSkinSrc={nextSkinUrl}
        prevSkinSrc={prevSkinUrl}
      />
      <div className="flex p-2">
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
