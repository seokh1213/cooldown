import React, { useCallback, useState, useEffect } from "react";
import { Champion } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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
        className="cursor-pointer rounded-full shrink-0 p-0 h-auto w-auto hover:bg-transparent"
        onClick={handleClick}
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
              "absolute inset-0 w-full h-full rounded-full bg-black/5 border-0 box-border object-cover",
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
          {/* 선택 인디케이터 - 최소한의 강조 */}
          {(isLocallySelected || selected) && (
            <div 
              className="absolute inset-0 rounded-full pointer-events-none z-10"
              style={{
                boxShadow: 'inset 0 0 0 2px hsl(var(--primary))'
              }}
            />
          )}
        </div>
      </Button>
      <div className="text-xs md:text-sm whitespace-nowrap mt-0.5">{name}</div>
    </div>
  );
}

export default React.memo(ChampionThumbnail);
