import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import ChampionThumbnail from "./ChampionThumbnail";
import { CHAMP_ICON_URL } from "@/services/api";
import { Champion } from "@/types";
import { Input as UIInput } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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

  const handlerBlur = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setClicked(false);
      }
    },
    []
  );

  useEffect(() => {
    if (clicked) {
      // addEventListener를 사용하여 이벤트 리스너 등록
      document.addEventListener("mousedown", handlerBlur);
      return () => {
        document.removeEventListener("mousedown", handlerBlur);
      };
    }
  }, [clicked, handlerBlur]);

  const handleClick = useCallback(() => {
    setClicked(true);
  }, []);

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
    <div
      ref={containerRef}
      onClick={handleClick}
      className={cn(
        "rounded-md flex flex-col w-full max-w-[750px] shadow-md mt-8 fixed z-10 left-1/2 -translate-x-1/2",
        "bg-card border border-border"
      )}
    >
      <UIInput
        type="text"
        placeholder="Champion Name"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={cn(
          "text-xl h-[50px] border-0 rounded-md",
          clicked && "rounded-b-none"
        )}
      />

      {clicked && (
        <div
          className={cn(
            "grid grid-cols-5 overflow-auto w-full h-[508px] bg-background/96 rounded-md rounded-t-none border-t border-border p-2"
          )}
        >
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
            <div className="col-span-5 flex items-center justify-center h-full text-muted-foreground">
              Sorry not yet loading.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(Input);
