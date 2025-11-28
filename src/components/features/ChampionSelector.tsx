import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Champion } from "@/types";
import { CHAMP_ICON_URL } from "@/services/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ChampionThumbnail from "./ChampionThumbnail";

interface ChampionSelectorProps {
  championList: Champion[] | null;
  selectedChampions: Champion[];
  onSelect: (champion: Champion) => void;
  onClose?: () => void;
  slotIndex?: number;
}

function ChampionSelector({
  championList,
  selectedChampions,
  onSelect,
  onClose,
  slotIndex,
}: ChampionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // If onClose is provided, this is a modal-style selector
  const isModal = !!onClose;

  const filteredChampions = useMemo(() => {
    if (!championList) return [];
    if (!searchValue) return championList;

    const lowerValue = searchValue.toLowerCase();
    return championList.filter(
      (champ) =>
        champ.name.toLowerCase().includes(lowerValue) ||
        (champ.hangul && champ.hangul.includes(lowerValue)) ||
        champ.id.toLowerCase().includes(lowerValue)
    );
  }, [championList, searchValue]);

  const availableChampions = useMemo(() => {
    return filteredChampions.filter(
      (champ) => !selectedChampions.some((c) => c.id === champ.id)
    );
  }, [filteredChampions, selectedChampions]);

  const handleBlur = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
        setSearchValue("");
        setFocusedIndex(-1);
      }
    },
    []
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleBlur);
      return () => {
        document.removeEventListener("mousedown", handleBlur);
      };
    }
  }, [isOpen, handleBlur]);

  const handleSelect = useCallback(
    (champion: Champion) => {
      onSelect(champion);
      setIsOpen(false);
      // Don't clear search value to preserve user's search context
      // setSearchValue("");
      setFocusedIndex(-1);
      document.body.style.overflow = "";
      onClose?.();
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if ((!isOpen && !isModal) || !championList) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) =>
          prev < availableChampions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        const champion = availableChampions[focusedIndex];
        if (champion) {
          handleSelect(champion);
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
        // Don't clear search value - preserve user's search context
        // setSearchValue("");
        setFocusedIndex(-1);
        document.body.style.overflow = "";
        onClose?.();
      }
    },
    [isOpen, isModal, championList, availableChampions, focusedIndex, handleSelect, onClose]
  );

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-champion-item]");
      if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedIndex]);

  // Save scroll position to sessionStorage
  const SCROLL_POSITION_KEY = "championSelectorScrollPosition";

  useEffect(() => {
    if (isModal) {
      setIsOpen(true);
      // Prevent body scroll when modal is open
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      
      // Restore scroll position immediately (before images load)
      const restoreScroll = () => {
        if (listRef.current) {
          const savedPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
          if (savedPosition) {
            const position = parseInt(savedPosition, 10);
            // 즉시 설정 (부드러운 스크롤 없이)
            listRef.current.scrollTop = position;
          }
        }
      };

      // 즉시 실행
      restoreScroll();
      
      // requestAnimationFrame으로 한 번 더 (DOM이 완전히 준비된 후)
      requestAnimationFrame(() => {
        restoreScroll();
        inputRef.current?.focus();
      });

      // 이미지 로드 후에도 한 번 더 (레이아웃이 안정된 후)
      setTimeout(() => {
        restoreScroll();
      }, 200);

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    } else {
      setIsOpen(false);
    }
  }, [isModal]);

  // Save scroll position when scrolling
  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement || !isModal || !isOpen) return;

    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      // 디바운스: 스크롤이 끝난 후에만 저장
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        sessionStorage.setItem(SCROLL_POSITION_KEY, listElement.scrollTop.toString());
      }, 100);
    };

    listElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(scrollTimeout);
      listElement.removeEventListener("scroll", handleScroll);
    };
  }, [isModal, isOpen]);

  if (!isModal) {
    return (
      <div ref={containerRef} className="w-full">
        <button
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className={cn(
            "w-full flex flex-col items-center justify-center space-y-2",
            "text-muted-foreground hover:text-foreground transition-colors",
            "py-4"
          )}
        >
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <span className="text-sm font-medium">챔피언 선택</span>
        </button>

        {isOpen && (
          <>
            {/* Mobile overlay */}
            <div
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => {
                setIsOpen(false);
                setSearchValue("");
                document.body.style.overflow = "";
                onClose?.();
              }}
              aria-hidden="true"
            />
            
            {/* Selector Panel */}
            <div className={cn(
              "fixed inset-0 z-50 md:absolute md:inset-auto md:top-full md:left-0 md:right-0 md:mt-2 md:z-10 md:rounded-lg md:border md:border-border md:shadow-lg bg-card md:max-h-[60vh] flex flex-col",
              isModal && "md:relative md:inset-0 md:mt-0 md:rounded-lg md:border md:shadow-lg"
            )}>
            {/* Search Header */}
            <div className="p-4 border-b border-border flex items-center gap-2 sticky top-0 bg-card z-10">
              <Search className="h-5 w-5 text-muted-foreground shrink-0" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="챔피언 검색..."
                value={searchValue}
                onChange={(e) => {
                  setSearchValue(e.target.value);
                  setFocusedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                className="flex-1"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setIsOpen(false);
                  setSearchValue("");
                  document.body.style.overflow = "";
                  onClose?.();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Champion List */}
            <div
              ref={listRef}
              className="flex-1 overflow-auto p-4"
              style={{ maxHeight: "calc(100vh - 120px)" }}
            >
              {championList ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                  {availableChampions.map((champion, index) => {
                    const isFocused = focusedIndex === index;
                    return (
                      <div
                        key={champion.id}
                        data-champion-item
                        className={cn(
                          isFocused && "ring-2 ring-primary ring-offset-1 rounded-md"
                        )}
                      >
                        <ChampionThumbnail
                          addChampion={(champ) => handleSelect(champ)}
                          data={champion}
                          name={champion.name}
                          selected={false}
                          thumbnailSrc={CHAMP_ICON_URL(
                            champion.version || "",
                            champion.id
                          )}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  로딩 중...
                </div>
              )}
            </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Modal style selector
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={() => {
          setIsOpen(false);
          setSearchValue("");
          document.body.style.overflow = "";
          onClose?.();
        }}
        aria-hidden="true"
      />
      
      {/* Selector Panel - Desktop: centered modal, Mobile: full screen */}
      <div
        ref={containerRef}
        className="fixed inset-0 z-[101] flex items-center justify-center p-4 md:p-6 pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full h-full md:w-[600px] md:h-[500px] lg:w-[800px] lg:h-[600px] bg-card rounded-lg md:rounded-xl border border-border shadow-xl flex flex-col overflow-hidden pointer-events-auto transform transition-transform">
          {/* Search Header */}
          <div className="p-4 border-b border-border flex items-center gap-2 shrink-0 bg-card">
            <Search className="h-5 w-5 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="챔피언 검색..."
              value={searchValue}
              onChange={(e) => {
                setSearchValue(e.target.value);
                setFocusedIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              className="flex-1"
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                setIsOpen(false);
                setSearchValue("");
                document.body.style.overflow = "";
                onClose?.();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Champion List - 모바일: 반응형, PC/태블릿: 고정 크기 */}
          <div
            ref={listRef}
            className="overflow-y-auto overflow-x-hidden p-4 flex-1 min-h-0 md:flex-none md:w-[600px] md:h-[427px] lg:w-[800px] lg:h-[527px]"
          >
            {championList ? (
              availableChampions.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                  {availableChampions.map((champion, index) => {
                    const isFocused = focusedIndex === index;
                    return (
                      <div
                        key={champion.id}
                        data-champion-item
                        className={cn(
                          isFocused && "ring-2 ring-primary ring-offset-1 rounded-md"
                        )}
                      >
                        <ChampionThumbnail
                          addChampion={(champ) => handleSelect(champ)}
                          data={champion}
                          name={champion.name}
                          selected={false}
                          thumbnailSrc={CHAMP_ICON_URL(
                            champion.version || "",
                            champion.id
                          )}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground min-h-[200px] space-y-2">
                  <Search className="h-12 w-12 opacity-50" />
                  <p className="text-base font-medium">
                    {searchValue ? "검색 결과가 없습니다" : "모든 챔피언이 선택되었습니다"}
                  </p>
                </div>
              )
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground min-h-[200px]">
                로딩 중...
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default React.memo(ChampionSelector);
