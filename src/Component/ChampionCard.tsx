import React, { useState, useEffect, useCallback, useMemo } from "react";
import styled from "styled-components";
import { SPLASH_IMG_URL, CHAMP_ICON_URL, getChampionInfo } from "../api";
import ContentLoader from "react-content-loader";
import SplashImage from "./SplashImage";
import ChampionSquare from "./ChampionSquare";
import SkillTable from "./SkillTable";
import { Champion } from "../types";

const Card = styled.div`
  width: 425px;
  background-color: white;
  border: 1px solid #bbb;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  box-shadow: 3px 3px 5px rgba(0, 0, 0, 0.1);
`;

const ChampionLoader = React.memo(() => (
  <ContentLoader viewBox="0 0 400 350" speed={3}>
    <rect x="0" y="0" rx="5" ry="5" width="100%" height="180" />
    <rect x="300" y="190" rx="2" ry="2" width="100" height="15" />
    <rect x="20" y="220" rx="10" ry="10" width="120" height="120" />
    <rect x="20" y="220" rx="5" ry="5" width="120" height="120" />
    <rect x="180" y="220" rx="5" ry="5" width="40" height="40" />
    <rect x="230" y="220" rx="5" ry="5" width="40" height="40" />
    <rect x="280" y="220" rx="5" ry="5" width="40" height="40" />
    <rect x="330" y="220" rx="5" ry="5" width="40" height="40" />
    <rect x="180" y="280" rx="5" ry="5" width="190" height="60" />
  </ContentLoader>
));

ChampionLoader.displayName = "ChampionLoader";

interface ChampionCardProps {
  lang: string;
  champion: Champion;
}

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
    return (
      <Card>
        <ChampionLoader />
      </Card>
    );
  }

  return (
    <Card>
      <SplashImage
        src={splashImageUrl}
        name={skinName}
        changeHandler={changeHandler}
        nextSkinSrc={nextSkinUrl}
        prevSkinSrc={prevSkinUrl}
      />
      <div style={{ display: "flex" }}>
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
