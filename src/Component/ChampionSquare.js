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
const Square = styled.img`
  width: 90px;
  height: 90px;
  border-radius: 12px;
  background-color: black;
  border: 0;
  margin-bottom: 8px;
  box-sizing: border-box;
`;

export default function ChampionSquare({ name, squareSrc }) {
  return (
    <FlexDiv>
      <Square src={squareSrc} alt={name} />
      <div style={{ whiteSpace: "nowrap", color: "#676869" }}>{name}</div>
    </FlexDiv>
  );
}
