import React, { useCallback, useState } from "react";
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

const ImageContainer = styled.div`
  position: relative;
  width: 80px;
  height: 80px;
`;

const Thumbnail = styled.img<{ selected?: boolean; loaded: boolean }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: black;
  border: 0;
  opacity: ${(props) => (props.loaded ? 1 : 0)};
  transition: opacity 0.2s ease-in-out;
  &:hover {
    box-shadow: 1px 1px 10px #3c110d;
  }
  margin-bottom: 3px;
  box-sizing: border-box;
  ${(props) => (props.selected ? "border:4px solid #2ecc71" : "")}
`;

const Placeholder = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 0.7em;
`;

interface ChampionThumbnailProps {
  addChampion: (champion: Champion, selected: boolean) => void;
  data: Champion;
  name: string;
  thumbnailSrc: string;
  selected: boolean;
}

function ChampionThumbnail({
  addChampion,
  data,
  name,
  thumbnailSrc,
  selected,
}: ChampionThumbnailProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleClick = useCallback(() => {
    addChampion(data, selected);
  }, [addChampion, data, selected]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <FlexDiv>
      <div style={{ cursor: "pointer" }} onClick={handleClick}>
        <ImageContainer>
          {!isLoaded && !hasError && <Placeholder>...</Placeholder>}
          <Thumbnail
            selected={selected}
            src={thumbnailSrc}
            alt={name}
            loaded={isLoaded}
            loading="lazy"
            onLoad={handleLoad}
            onError={handleError}
          />
        </ImageContainer>
      </div>
      <div style={{ fontSize: "1em", whiteSpace: "nowrap" }}>{name}</div>
    </FlexDiv>
  );
}

export default React.memo(ChampionThumbnail);
