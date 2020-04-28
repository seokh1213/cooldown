import React from "react";
import styled from "styled-components";

const FlexDiv = styled.div`
  display: flex;
  height: fit-content;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 10px;
`;
const Thumbnail = styled.img`
  width: 60px;
  height: 60px;
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

export default function ChampionThumbnail({
  addChampion,
  data,
  name,
  thumbnailSrc,
  selected,
}) {
  return (
    <FlexDiv>
      <div
        style={{ cursor: "pointer" }}
        onClick={() => addChampion(data, selected)}
      >
        <Thumbnail selected={selected} src={thumbnailSrc} alt={name} />
      </div>
      <div style={{ fontSize: "0.8em", whiteSpace: "nowrap" }}>{name}</div>
    </FlexDiv>
  );
}
