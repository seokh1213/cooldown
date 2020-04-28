import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { SPLASH_IMG_URL, CHAMP_ICON_URL, getChampionInfo } from "../api";
import ContentLoader from "react-content-loader";
import SplashImage from "./SplashImage";
import ChampionSquare from "./ChampionSquare";
import SkillTable from "./SkillTable";

const Card = styled.div`
  margin: 10px;
  width: calc(100% - 20px);
  background-color: white;
  border: 1px solid #bbb;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
`;

const ChampionLoader = () => (
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
);

export default function ChampionCard({ lang, champion }) {
  const [championInfo, setChampionInfo] = useState(null);
  const [skinIdx, setSkin] = useState(1);

  useEffect(() => {
    getChampionInfo(champion.version, lang, champion.id).then((data) =>
      setChampionInfo(data)
    );
  }, [champion.version, lang, champion.id]);

  const changeHandler = (inc) => {
    let idx = skinIdx + inc;
    idx = idx === championInfo.skins.length ? 0 : idx;
    idx = idx === -1 ? championInfo.skins.length - 1 : idx;
    console.log("Splash Image : ", idx);
    setSkin(idx);
  };
  console.log(championInfo);
  return (
    <Card>
      {championInfo ? (
        <>
          <SplashImage
            src={SPLASH_IMG_URL(
              `${championInfo.id}_${championInfo.skins[skinIdx].num}`
            )}
            name={
              championInfo.skins[skinIdx].name === "default"
                ? championInfo.name
                : championInfo.skins[skinIdx].name
            }
            changeHandler={changeHandler}
          />
          <div style={{ display: "flex" }}>
            <ChampionSquare
              name={championInfo.name}
              squareSrc={CHAMP_ICON_URL(champion.version, champion.id)}
            />
            <SkillTable
              championInfo={championInfo}
              version={champion.version}
            />
          </div>
        </>
      ) : (
        <ChampionLoader />
      )}
    </Card>
  );
}
