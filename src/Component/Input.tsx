import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import styled from "styled-components";
import ChampionThumbnail from "./ChampionThumbnail";
import { CHAMP_ICON_URL } from "../api";
import { Champion } from "../types";

const FlexDiv = styled.div<{ clicked?: boolean }>`
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  width: min(750px, calc(100% - 20px));
  box-shadow: 1px 1px 5px rgba(0, 0, 0, 0.3);
  margin-top: 30px;
  position: fixed;
  z-index: 1;
  left: calc(50% - min(375px, calc(50% - 10px)));
`;
const TextInput = styled.input<{ clicked?: boolean }>`
  box-sizing: border-box;
  border-radius: 5px;
  display: block;
  width: 100%;
  padding: 10px;
  height: 50px;
  border: 0;
  caret-color: gray;
  font-size: 1.25em;

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
  height: 508px;
  background-color: rgba(255, 255, 255, 0.96);
  border-radius: 5px;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-top: 1px solid #c8cacb;
`;

interface InputProps {
  championList: Champion[] | null;
  selectedChampions: Champion[];
  setChampions: (champions: Champion[]) => void;
}

function Input({
  championList,
  selectedChampions,
  setChampions,
}: InputProps) {
  const [value, setValue] = useState("");
  const [clicked, setClicked] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const handlerBlur = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (containerRef.current && !containerRef.current.contains(target)) {
      setClicked(false);
      document.body.onclick = null;
    }
  }, []);

  useEffect(() => {
    document.body.onclick = handlerBlur as any;
    return () => {
      document.body.onclick = null;
    };
  }, [handlerBlur]);

  const handleClick = useCallback(() => {
    if (!clicked) {
      document.body.onclick = handlerBlur as any;
    }
    setClicked(true);
  }, [clicked, handlerBlur]);

  const addChampion = useCallback(
    (champion: Champion, selected: boolean) => {
      setChampions(
        selected
          ? selectedChampions.filter((c) => c.id !== champion.id)
          : [...selectedChampions, champion]
      );
    },
    [selectedChampions, setChampions]
  );

  const filteredChampions = useMemo(() => {
    if (!championList) return [];
    
    if (value === "") {
      return [
        ...selectedChampions,
        ...championList.filter(
          (champ) => !selectedChampions.some((c) => c.id === champ.id)
        ),
      ];
    }

    const lowerValue = value.toLowerCase();
    return championList.filter(
      (champ) =>
        champ.name.toLowerCase().includes(lowerValue) ||
        (champ.hangul && champ.hangul.includes(lowerValue))
    );
  }, [championList, selectedChampions, value]);

  return (
    <FlexDiv ref={containerRef} onClick={handleClick} clicked={clicked}>
      <TextInput
        type="text"
        placeholder="Champion Name"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        clicked={clicked}
      />

      {clicked && (
        <ChampionList>
          {championList ? (
            filteredChampions.map((champion) => (
              <ChampionThumbnail
                addChampion={addChampion}
                data={champion}
                key={champion.id}
                name={champion.name}
                selected={selectedChampions.some((c) => c.id === champion.id)}
                thumbnailSrc={CHAMP_ICON_URL(champion.version || "", champion.id)}
              />
            ))
          ) : (
            <div>Sorry not yet loading.</div>
          )}
        </ChampionList>
      )}
    </FlexDiv>
  );
}

export default React.memo(Input);
