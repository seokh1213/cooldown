import React from "react";
import Body from "@/components/features/Body";
import { Champion } from "@/types";

interface CooldownPageProps {
  lang: string;
  championList: Champion[] | null;
  selectedChampions: Champion[];
  setChampions: (list: Champion[]) => void;
}

function CooldownPage({
  lang,
  championList,
  selectedChampions,
  setChampions,
}: CooldownPageProps) {
  return (
    <Body
      lang={lang}
      championList={championList}
      selectedChampions={selectedChampions}
      setChampions={setChampions}
    />
  );
}

export default CooldownPage;

