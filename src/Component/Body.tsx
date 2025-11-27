import React from "react";
import styled from "styled-components";
import Input from "./Input";
import ChampionCard from "./ChampionCard";
import { Champion } from "../types";

const Content = styled.div`
  width: 1311px;
  display: flex;
  margin: 0 auto;
  flex-direction: column;
`;
const ChampionCards = styled.div`
  margin-top: 110px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
`;

interface BodyProps {
  championList: Champion[] | null;
  lang: string;
  selectedChampions: Champion[];
  setChampions: (list: Champion[]) => void;
}

function Body({
  championList,
  lang,
  selectedChampions,
  setChampions,
}: BodyProps) {
  return (
    <Content>
      <Input
        selectedChampions={selectedChampions}
        setChampions={setChampions}
        championList={championList}
      />
      <ChampionCards>
        {selectedChampions.map((champion) => (
          <ChampionCard lang={lang} key={champion.id} champion={champion} />
        ))}
      </ChampionCards>
    </Content>
  );
}

export default React.memo(Body);
