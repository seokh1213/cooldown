import React, { useState, useCallback } from "react";
import styled from "styled-components";

const FlexDiv = styled.div`
  display: flex;
  height: fit-content;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  margin: 10px;
`;

const SquareContainer = styled.div`
  position: relative;
  width: 90px;
  height: 90px;
`;

const Square = styled.img<{ loaded: boolean }>`
  width: 90px;
  height: 90px;
  border-radius: 12px;
  background-color: black;
  border: 0;
  margin-bottom: 8px;
  box-sizing: border-box;
  opacity: ${(props) => (props.loaded ? 1 : 0)};
  transition: opacity 0.2s ease-in-out;
`;

const Placeholder = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 90px;
  height: 90px;
  border-radius: 12px;
  background-color: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 0.7em;
`;

interface ChampionSquareProps {
  name: string;
  squareSrc: string;
}

function ChampionSquare({ name, squareSrc }: ChampionSquareProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  return (
    <FlexDiv>
      <SquareContainer>
        {!isLoaded && <Placeholder>...</Placeholder>}
        <Square
          src={squareSrc}
          alt={name}
          loaded={isLoaded}
          loading="lazy"
          onLoad={handleLoad}
        />
      </SquareContainer>
      <div style={{ whiteSpace: "nowrap", color: "#676869" }}>{name}</div>
    </FlexDiv>
  );
}

export default React.memo(ChampionSquare);
