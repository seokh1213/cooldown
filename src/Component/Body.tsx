import React from "react";
import Input from "./Input";
import ChampionCard from "./ChampionCard";
import { Champion } from "../types";

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
    <div className="w-full max-w-[1311px] mx-auto flex flex-col">
      <Input
        selectedChampions={selectedChampions}
        setChampions={setChampions}
        championList={championList}
      />
      <div className="mt-[110px] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {selectedChampions.map((champion) => (
          <ChampionCard lang={lang} key={champion.id} champion={champion} />
        ))}
      </div>
    </div>
  );
}

export default React.memo(Body);
