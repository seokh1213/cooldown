import React from "react";
import Input from "./Input";
import ChampionCard from "./ChampionCard";
import { Champion } from "@/types";
import { Search } from "lucide-react";

interface BodyProps {
  championList: Champion[] | null;
  lang: string;
  selectedChampions: Champion[];
  setChampions: (list: Champion[]) => void;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 md:py-24 px-4">
      <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <Search className="w-10 h-10 text-muted-foreground" />
      </div>
      <h2 className="text-xl md:text-2xl font-semibold mb-2 text-foreground">챔피언을 선택하세요</h2>
      <p className="text-muted-foreground text-center max-w-md text-sm md:text-base">
        오른쪽 검색창에서 챔피언을 검색하고 선택하면 스킬 쿨다운을 확인할 수 있습니다.
      </p>
    </div>
  );
}

function Body({
  championList,
  lang,
  selectedChampions,
  setChampions,
}: BodyProps) {
  return (
    <div className="w-full px-4 md:px-6 lg:px-8 py-6">
      <div className="flex flex-col md:flex-row md:items-start gap-6 md:gap-8">
        {/* Main content area */}
        <div className="flex-1 w-full min-w-0 order-2 md:order-1">
          {selectedChampions.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {selectedChampions.map((champion) => (
                <ChampionCard
                  lang={lang}
                  key={champion.id}
                  champion={champion}
                  onRemove={() => {
                    setChampions(selectedChampions.filter((c) => c.id !== champion.id));
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Search input - 오른쪽에 고정 */}
        <div className="w-full md:w-[380px] md:sticky md:top-24 md:self-start md:shrink-0 order-1 md:order-2">
          <Input
            selectedChampions={selectedChampions}
            setChampions={setChampions}
            championList={championList}
          />
        </div>
      </div>
    </div>
  );
}

export default React.memo(Body);
