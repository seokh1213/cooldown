import React, { useState, useCallback, useRef, useEffect } from "react";
import { Champion } from "@/types";
import { CHAMP_ICON_URL } from "@/services/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import ChampionThumbnail from "./ChampionThumbnail";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { useChampionSearch } from "@/hooks/useChampionSearch";
import { useScrollPosition } from "@/hooks/useScrollPosition";

interface ChampionSelectorProps {
  championList: Champion[] | null;
  selectedChampions: Champion[];
  onSelect: (champion: Champion) => void;
  onClose?: () => void;
  slotIndex?: number;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function ChampionSelector({
  championList,
  selectedChampions,
  onSelect,
  onClose,
  slotIndex: _slotIndex,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: ChampionSelectorProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  // Controlled 모드일 때는 controlledOpen을 사용, undefined가 아닌 경우에만 true로 간주
  const isOpen = isControlled ? Boolean(controlledOpen) : internalOpen;
  const setIsOpen = isControlled ? (controlledOnOpenChange || (() => {})) : setInternalOpen;
  const [searchValue, setSearchValue] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // If onClose is provided, this is a modal-style selector
  const isModal = onClose !== undefined;
  const handleClose = onClose || (() => {});

  const availableChampions = useChampionSearch(championList, searchValue);

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
    // 모달일 때는 handleBlur를 사용하지 않음 (overlay의 onClick으로 처리)
    if (isOpen && !isModal) {
      document.addEventListener("mousedown", handleBlur);
      return () => {
        document.removeEventListener("mousedown", handleBlur);
      };
    }
  }, [isOpen, handleBlur, isModal]);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearchValue("");
      setFocusedIndex(-1);
      if (onClose) {
        onClose();
      }
    }
    if (controlledOnOpenChange) {
      controlledOnOpenChange(open);
    }
  }, [onClose, controlledOnOpenChange]);

  const handleSelect = useCallback(
    (champion: Champion, isSelected: boolean) => {
      console.log('[ChampionSelector] handleSelect called', { champion: champion.name, isSelected, isModal });
      // 이미 선택된 챔피언이면 선택 해제, 아니면 선택
      console.log('[ChampionSelector] Calling onSelect');
      onSelect(champion);
      // 모달일 때는 절대 닫지 않고 계속 열어둠
      if (isModal) {
        console.log('[ChampionSelector] Modal mode - keeping open');
        // 모달일 때는 검색어와 포커스만 초기화하지 않음 (계속 선택 가능하도록)
        setFocusedIndex(-1);
        // 모달 상태는 유지 (setIsOpen이나 onClose 호출하지 않음)
      } else {
        console.log('[ChampionSelector] Non-modal mode - closing');
        // 모달이 아닐 때만 닫기
        setIsOpen(false);
        setFocusedIndex(-1);
        document.body.style.overflow = "";
        handleClose();
      }
    },
    [onSelect, onClose, isModal]
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
          const isSelected = selectedChampions.some((c) => c.id === champion.id);
          handleSelect(champion, isSelected);
        }
      } else if (e.key === "Escape") {
        handleOpenChange(false);
      }
    },
    [isOpen, isModal, championList, availableChampions, focusedIndex, handleSelect, handleOpenChange, selectedChampions]
  );

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-champion-item]");
      if (items[focusedIndex]) {
        items[focusedIndex].scrollIntoView({ block: "nearest" });
      }
    }
  }, [focusedIndex]);

  useEffect(() => {
    // Controlled 모드일 때는 외부에서 open 상태를 관리하므로 이 effect를 실행하지 않음
    if (isControlled) {
      return;
    }
    // Uncontrolled 모드일 때만 isModal에 따라 상태 설정
    if (isModal) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [isModal, isControlled, setIsOpen]);

  // 스크롤 위치 관리
  useScrollPosition(listRef, isModal, isOpen);

  // 모달 열릴 때 input 포커스
  useEffect(() => {
    if (isModal && isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isModal, isOpen]);

  if (!isModal) {
    return (
      <div ref={containerRef} className="w-full">
        <Button
          onClick={() => {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          variant="ghost"
          className={cn(
            "w-full flex flex-col items-center justify-center space-y-2",
            "text-muted-foreground hover:text-foreground",
            "py-4 h-auto"
          )}
        >
          <div className="w-12 h-12 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
            <Search className="w-6 h-6" />
          </div>
          <span className="text-sm font-medium">챔피언 선택</span>
        </Button>

        {isOpen && (
          <>
            {/* Mobile overlay */}
            <div
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => {
                setIsOpen(false);
                setSearchValue("");
                document.body.style.overflow = "";
                handleClose();
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
                className="h-8 w-8 shrink-0 hover:bg-muted hover:text-foreground"
                onClick={() => {
                  setIsOpen(false);
                  setSearchValue("");
                  document.body.style.overflow = "";
                  handleClose();
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
                    const isSelected = selectedChampions.some((c) => c.id === champion.id);
                    return (
                      <div
                        key={champion.id}
                        data-champion-item
                        className={cn(
                          isFocused && "ring-2 ring-primary ring-offset-1 rounded-md"
                        )}
                      >
                        <ChampionThumbnail
                          addChampion={(champ, selected) => handleSelect(champ, selected)}
                          data={champion}
                          name={champion.name}
                          selected={isSelected}
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

  // Modal style selector using shadcn-ui Dialog
  // Controlled 모드일 때는 open prop이 false면 아무것도 렌더링하지 않음
  if (isControlled && !isOpen) {
    return null;
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          ref={containerRef}
          className="fixed inset-0 left-0 top-0 translate-x-0 translate-y-0 md:inset-auto md:left-[50%] md:top-[50%] md:translate-x-[-50%] md:translate-y-[-50%] w-full h-full md:w-[600px] md:h-[500px] lg:w-[800px] lg:h-[600px] p-0 flex flex-col overflow-hidden max-w-none md:max-w-[600px] lg:max-w-[800px] max-h-none md:max-h-[500px] lg:max-h-[600px] rounded-none md:rounded-xl z-50 border bg-background shadow-lg"
          onInteractOutside={() => {
            // Allow closing when clicking outside (overlay)
            handleOpenChange(false);
          }}
          onEscapeKeyDown={() => {
            handleOpenChange(false);
          }}
        >
        <VisuallyHidden>
          <DialogTitle>챔피언 선택</DialogTitle>
          <DialogDescription>비교할 챔피언을 선택하세요</DialogDescription>
        </VisuallyHidden>
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
            className="h-8 w-8 shrink-0 hover:bg-muted hover:text-foreground"
            onClick={() => handleOpenChange(false)}
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
                  const isSelected = selectedChampions.some((c) => c.id === champion.id);
                  return (
                    <div
                      key={champion.id}
                      data-champion-item
                      className={cn(
                        isFocused && "ring-2 ring-primary ring-offset-1 rounded-md"
                      )}
                    >
                      <ChampionThumbnail
                        addChampion={(champ, selected) => handleSelect(champ, selected)}
                        data={champion}
                        name={champion.name}
                        selected={isSelected}
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
                    {searchValue ? "검색 결과가 없습니다" : "챔피언 목록이 비어있습니다"}
                  </p>
              </div>
            )
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground min-h-[200px]">
              로딩 중...
            </div>
          )}
        </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}

export default React.memo(ChampionSelector);
