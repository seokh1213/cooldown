import React, { useCallback, useState, useEffect } from "react";
import { Champion } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Check } from "lucide-react";

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
  // 즉시 피드백을 위한 로컬 선택 상태
  const [isLocallySelected, setIsLocallySelected] = useState(selected);

  // prop이 변경되면 로컬 상태 동기화
  useEffect(() => {
    setIsLocallySelected(selected);
  }, [selected]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 즉시 로컬 상태 업데이트 (네트워크 응답 전에 피드백 제공)
    setIsLocallySelected(!selected);
    addChampion(data, selected);
  }, [addChampion, data, selected]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 즉시 로컬 상태 업데이트 (네트워크 응답 전에 피드백 제공)
    setIsLocallySelected(!selected);
    addChampion(data, selected);
  }, [addChampion, data, selected]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center m-1 h-fit">
      <Button
        variant="ghost"
        className="cursor-pointer rounded-full shrink-0 p-0 h-auto w-auto hover:bg-transparent relative touch-manipulation"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        aria-label={selected ? `Deselect ${name}` : `Select ${name}`}
        aria-pressed={selected}
      >
        {/* 고정 크기 컨테이너 - 레이아웃 시프트 방지, overflow-hidden으로 scale 시 보더가 벗어나지 않도록 */}
        <div className="relative w-12 h-12 md:w-14 md:h-14 shrink-0 overflow-hidden rounded-full">
          {/* Skeleton placeholder - 고정 크기로 레이아웃 시프트 방지 */}
          {!isLoaded && !hasError && (
            <Skeleton className="absolute inset-0 rounded-full" />
          )}
          {/* Blur placeholder - 이미지가 로드되기 전까지 */}
          {!isLoaded && !hasError && (
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-muted via-muted/80 to-muted/60 blur-sm" />
          )}
          {/* Actual image - 고정 크기로 레이아웃 시프트 방지 */}
          <img
            className={cn(
              "absolute inset-0 w-full h-full rounded-full bg-black/5 border-0 box-border transition-all duration-200 ease-out object-cover",
              // 선택된 상태가 아닐 때만 hover 효과 적용
              !selected && !isLocallySelected && "hover:scale-105",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
            src={thumbnailSrc}
            alt={name}
            loading="lazy"
            decoding="async"
            width="56"
            height="56"
            onLoad={handleLoad}
            onError={handleError}
          />
          {/* 선택 인디케이터 - 가시성 향상을 위한 외부 ring */}
          {(isLocallySelected || selected) && (
            <div 
              className="absolute inset-0 rounded-full pointer-events-none z-10"
              style={{
                boxShadow: 'inset 0 0 0 2px hsl(var(--primary)), 0 0 0 3px hsl(var(--primary) / 0.3)'
              }}
            />
          )}
        </div>
        {/* 체크마크 아이콘 - 컨테이너 밖에 배치하여 잘리지 않도록 */}
        {(isLocallySelected || selected) && (
          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 md:w-5 md:h-5 bg-primary rounded-full flex items-center justify-center pointer-events-none z-20 shadow-lg border-2 border-background">
            <Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-primary-foreground stroke-[3]" />
          </div>
        )}
      </Button>
      <div className="text-xs md:text-sm whitespace-nowrap mt-0.5">{name}</div>
    </div>
  );
}

export default React.memo(ChampionThumbnail);
