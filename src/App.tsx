import React, { useState, useEffect, useCallback } from "react";
import { getVersion, getChampionList } from "./api";
import { createGlobalStyle } from "styled-components";
import Nav from "./Component/Nav";
import Body from "./Component/Body";
import { Champion } from "./types";

const GlobalStyle = createGlobalStyle`
  #root{
    font-family:"Noto Sans KR","Malgun Gothic";
    display: flex;
    width: 100%;
    flex-direction: column;
    align-items:center;
  }
  img {
    box-shadow:3px 3px 5px rgba(0,0,0,0.3);
  }
`;

/* Todo: Tip list

  Duration
    Red, Blue: 2m
    Barone, Elder dragon: 3m

  Regen Time
    Inhibitor: 5m
  
   Spell time, Ward time
*/

function App() {
  const [lang, setLang] = useState<string>("ko_KR");
  const [version, setVersion] = useState<string>("10.8.1");
  const [championList, setChampionList] = useState<Champion[] | null>(null);
  const [selectedChampions, setSelectedChampions] = useState<Champion[]>([]);

  const initData = useCallback(async () => {
    try {
      const latestVersion = await getVersion();
      setVersion(latestVersion);
      const champions = await getChampionList(latestVersion, lang);
      setChampionList(champions);
    } catch (error) {
      console.error("Failed to initialize data:", error);
    }
  }, [lang]);

  useEffect(() => {
    initData();
  }, [initData]);

  const handleLangChange = useCallback((newLang: string) => {
    setLang(newLang);
    setSelectedChampions([]);
  }, []);

  const handleSetChampions = useCallback((list: Champion[]) => {
    setSelectedChampions(list);
  }, []);

  return (
    <>
      <GlobalStyle />
      <Nav
        version={version}
        lang={lang}
        selectHandler={handleLangChange}
      />
      <Body
        lang={lang}
        championList={championList}
        selectedChampions={selectedChampions}
        setChampions={handleSetChampions}
      />
    </>
  );
}

export default App;
