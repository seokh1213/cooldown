import React, { useState } from "react";
import styled from "styled-components";
import Input from "./Input";
import ChampionCard from "./ChampionCard";

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

export default function Body({ championList, lang }) {
  const [selectedChampions, setChampions] = useState([]);

  return (
    <Content>
      <Input
        selectedChampions={selectedChampions}
        setChampions={setChampions}
        championList={championList}
      />
      <ChampionCards>
        {selectedChampions.map((champion, idx) => (
          <ChampionCard lang={lang} key={idx} champion={champion} />
        ))}
      </ChampionCards>
    </Content>
  );
}
