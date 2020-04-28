import React, { useState } from "react";
import styled from "styled-components";
import ChampionThumbnail from "./ChampionThumbnail";
import { CHAMP_ICON_URL } from "../api";

const FlexDiv = styled.div`
  margin-top: 30px;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  width: 100%;
  box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.3);
  margin-bottom: 15px;
  position: relative;
`;
const TextInput = styled.input`
  box-sizing: border-box;
  border-radius: 5px;
  display: block;
  width: 100%;
  padding: 10px;
  height: 40px;
  border: 0;
  caret-color: gray;
  font-size: 1em;
  ${(props) =>
    props.clicked
      ? "border-bottom-left-radius: 0;border-bottom-right-radius: 0;"
      : ""}

  &:focus {
    outline: none;
  }
`;

const ChampionList = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  overflow: auto;
  box-sizing: border-box;
  width: 100%;
  height: 420px;
  background-color: rgba(255, 255, 255, 0.96);
  border-radius: 5px;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-top: 1px solid #c8cacb;
`;

export default function Input({
  championList,
  selectedChampions,
  setChampions,
}) {
  const [value, setValue] = useState("");
  const [clicked, setClicked] = useState(true);

  document.body.onclick = (e) => {
    if (
      !e.path.filter((node) =>
        typeof node.className === "string"
          ? node.className.includes(FlexDiv.styledComponentId)
          : false
      )[0]
    ) {
      setClicked(false);
      document.body.onclick = null;
    }
  };

  const handleClick = () => {
    if (!clicked) {
      document.body.onclick = (e) => {
        if (
          !e.path.filter((node) =>
            typeof node.className === "string"
              ? node.className.includes(FlexDiv.styledComponentId)
              : false
          )[0]
        ) {
          setClicked(false);
          document.body.onclick = null;
        }
      };
    }
    setClicked(true);
  };

  const addChampion = (champion, selected) => {
    setChampions(
      selected
        ? selectedChampions.filter((c) => c !== champion)
        : [...selectedChampions, champion]
    );
  };
  const listToThumbnail = (data, idx) => (
    <ChampionThumbnail
      addChampion={addChampion}
      data={data}
      key={idx}
      name={data.name}
      selected={selectedChampions.includes(data)}
      thumbnailSrc={CHAMP_ICON_URL(data.version, data.id)}
    />
  );
  const search = (value) => {
    return championList.filter((champ) =>
      champ.name.toLowerCase().includes(value)
    );
  };

  return (
    <FlexDiv onClick={handleClick}>
      <TextInput
        type="text"
        placeholder="Champion Name"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        clicked={clicked}
      />

      {clicked ? (
        championList ? (
          <ChampionList>
            {value !== ""
              ? search(value).map(listToThumbnail)
              : [
                  ...selectedChampions,
                  ...championList.filter(
                    (champ) => !selectedChampions.includes(champ)
                  ),
                ].map(listToThumbnail)}
          </ChampionList>
        ) : (
          "Sorry not yet loading."
        )
      ) : (
        ""
      )}
    </FlexDiv>
  );
}
