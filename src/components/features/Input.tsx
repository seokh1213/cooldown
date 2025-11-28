import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import ChampionThumbnail from "./ChampionThumbnail";
import { CHAMP_ICON_URL } from "@/services/api";
import { Champion } from "@/types";
import { Input as UIInput } from "@/components/ui/input";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputProps {
  championList: Champion[] | null;
  selectedChampions: Champion[];
  setChampions: (champions: Champion[]) => void;
}

const RECENT_CHAMPIONS_KEY = "recentChampions";

function Input({
  championList,
  selectedChampions,
  setChampions,
}: InputProps) {
  const [value, setValue] = useState("");
  const [clicked, setClicked] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handlerBlur = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setClicked(false);
        setFocusedIndex(-1);
      }
    },
    []
  );

  useEffect(() => {
    if (clicked) {
      document.addEventListener("mousedown", handlerBlur);
      return () => {
        document.removeEventListener("mousedown", handlerBlur);
      };
    }
  }, [clicked, handlerBlur]);

  const handleClick = useCallback(() => {
    setClicked(true);
    inputRef.current?.focus();
  }, []);

  const getRecentChampions = useCallback((): string[] => {
    try {
      const recent = localStorage.getItem(RECENT_CHAMPIONS_KEY);
      return recent ? JSON.parse(recent) : [];
    } catch {
      return [];
    }
  }, []);

  const saveRecentChampion = useCallback((championId: string) => {
    try {
      const recent = getRecentChampions();
      const updated = [championId, ...recent.filter((id) => id !== championId)].slice(0, 5);
      localStorage.setItem(RECENT_CHAMPIONS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  }, [getRecentChampions]);

  const addChampion = useCallback(
    (champion: Champion, selected: boolean) => {
      const newList = selected
        ? selectedChampions.filter((c) => c.id !== champion.id)
        : [...selectedChampions, champion];
      
      setChampions(newList);
      
      if (!selected) {
        saveRecentChampion(champion.id);
        // Auto-close on mobile after selection
        if (window.innerWidth < 768) {
          setClicked(false);
          setValue("");
        }
      }
      
      setFocusedIndex(-1);
    },
    [selectedChampions, setChampions, saveRecentChampion]
  );

  const recentChampionIds = useMemo(() => getRecentChampions(), [getRecentChampions]);

  const filteredChampions = useMemo(() => {
    if (!championList) return [];

    if (value === "") {
      const selected = selectedChampions;
      const recent = championList.filter((champ) =>
        recentChampionIds.includes(champ.id) && !selected.some((c) => c.id === champ.id)
      );
      const others = championList.filter(
        (champ) =>
          !selected.some((c) => c.id === champ.id) &&
          !recentChampionIds.includes(champ.id)
      );
      return [...selected, ...recent, ...others];
    }

    const lowerValue = value.toLowerCase();
    return championList.filter(
      (champ) =>
        champ.name.toLowerCase().includes(lowerValue) ||
        (champ.hangul && champ.hangul.includes(lowerValue))
    );
  }, [championList, selectedChampions, value, recentChampionIds]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!clicked || !championList) return;

      const filtered = filteredChampions;
      
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => 
          prev < filtered.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        const champion = filtered[focusedIndex];
        if (champion) {
          const isSelected = selectedChampions.some((c) => c.id === champion.id);
          addChampion(champion, isSelected);
        }
      } else if (e.key === "Escape") {
        setClicked(false);
        setFocusedIndex(-1);
      }
    },
    [clicked, championList, filteredChampions, focusedIndex, selectedChampions, addChampion]
  );

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-champion-item]");
      if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedIndex]);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={cn(
        "rounded-lg flex flex-col w-full md:w-[400px] shadow-sm transition-all duration-200",
        "bg-card border border-border/50",
        clicked && "shadow-md border-primary/30 ring-2 ring-primary/10",
        "relative"
      )}
    >
      <div className="relative flex items-center">
        <Search className={cn(
          "absolute left-3 h-5 w-5 transition-colors duration-200",
          clicked ? "text-primary" : "text-muted-foreground"
        )} />
        <UIInput
          ref={inputRef}
          type="text"
          placeholder="챔피언 검색..."
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setFocusedIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setClicked(true)}
          className={cn(
            "text-base h-[50px] border-0 rounded-md pl-10 pr-4",
            "placeholder:text-muted-foreground/60",
            clicked && "rounded-b-none",
            "focus-visible:ring-0 focus-visible:ring-offset-0"
          )}
          aria-label="Search champions"
          aria-expanded={clicked}
          aria-controls="champion-list"
        />
      </div>

      {clicked && (
        <div
          ref={listRef}
          id="champion-list"
          role="listbox"
          aria-label="Champion list"
          className={cn(
            "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 overflow-auto w-full",
            "max-h-[calc(100vh-300px)] md:max-h-[508px]",
            "bg-card/98 backdrop-blur-sm rounded-md rounded-t-none border-t border-border/50",
            "shadow-lg shadow-primary/5 p-3 gap-2"
          )}
        >
          {championList ? (
            <>
              {value === "" && selectedChampions.length > 0 && (
                <div className="col-span-full text-xs font-semibold text-primary/80 px-2 py-2 mb-1">
                  선택된 챔피언
                </div>
              )}
              {value === "" && recentChampionIds.length > 0 && selectedChampions.length === 0 && (
                <div className="col-span-full text-xs font-semibold text-primary/80 px-2 py-2 mb-1">
                  최근 선택
                </div>
              )}
              {filteredChampions.map((champion, index) => {
                const isSelected = selectedChampions.some((c) => c.id === champion.id);
                const isRecent = !isSelected && recentChampionIds.includes(champion.id) && value === "";
                const isFocused = focusedIndex === index;
                
                return (
                  <div
                    key={champion.id}
                    data-champion-item
                    className={cn(
                      isFocused && "ring-2 ring-primary ring-offset-2 rounded-md"
                    )}
                  >
                    <ChampionThumbnail
                      addChampion={addChampion}
                      data={champion}
                      name={champion.name}
                      selected={isSelected}
                      thumbnailSrc={CHAMP_ICON_URL(champion.version || "", champion.id)}
                    />
                  </div>
                );
              })}
            </>
          ) : (
            <div className="col-span-full flex items-center justify-center h-full text-muted-foreground">
              Sorry not yet loading.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default React.memo(Input);
