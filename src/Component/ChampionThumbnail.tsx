import React from "react";
import styled from "styled-components";
import { Champion } from "../types";

const FlexDiv = styled.div`
  display: flex;
  height: fit-content;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 10px;
`;
const Thumbnail = styled.img<{ selected?: boolean }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: black;
  border: 0;
  &:hover {
    box-shadow: 1px 1px 10px #3c110d;
  }
  margin-bottom: 3px;
  box-sizing: border-box;
  ${(props) => (props.selected ? "border:4px solid #2ecc71" : "")}
`;

interface ChampionThumbnailProps {
  addChampion: (champion: Champion, selected: boolean) => void;
  data: Champion;
  name: string;
  thumbnailSrc: string;
  selected: boolean;
}

export default function ChampionThumbnail({
  addChampion,
  data,
  name,
  thumbnailSrc,
  selected,
}: ChampionThumbnailProps) {
  return (
    <FlexDiv>
      <div
        style={{ cursor: "pointer" }}
        onClick={() => addChampion(data, selected)}
      >
        <Thumbnail selected={selected} src={thumbnailSrc} alt={name} />
      </div>
      <div style={{ fontSize: "1em", whiteSpace: "nowrap" }}>{name}</div>
    </FlexDiv>
  );
}


