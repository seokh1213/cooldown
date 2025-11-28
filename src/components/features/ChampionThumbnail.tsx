import React, { useCallback, useState } from "react";
import { Champion } from "@/types";
import { cn } from "@/lib/utils";

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

  const handleClick = useCallback(() => {
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
      <button
        className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded-full shrink-0"
        onClick={handleClick}
        aria-label={selected ? `Deselect ${name}` : `Select ${name}`}
        aria-pressed={selected}
      >
        {/* 고정 크기 컨테이너 - 레이아웃 시프트 방지 */}
        <div className="relative w-12 h-12 md:w-14 md:h-14 shrink-0">
          {/* Skeleton placeholder - 고정 크기로 레이아웃 시프트 방지 */}
          {!isLoaded && !hasError && (
            <div className="absolute inset-0 rounded-full bg-muted animate-pulse" />
          )}
          {/* Blur placeholder - 이미지가 로드되기 전까지 */}
          {!isLoaded && !hasError && (
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-muted via-muted/80 to-muted/60 blur-sm" />
          )}
          {/* Actual image - 고정 크기로 레이아웃 시프트 방지 */}
          <img
            className={cn(
              "absolute inset-0 w-full h-full rounded-full bg-black/5 border-0 box-border transition-opacity duration-300 ease-out object-cover",
              "hover:shadow-md hover:shadow-primary/20 hover:scale-105",
              "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1",
              selected && "border-2 border-primary ring-1 ring-primary/20",
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
        </div>
      </button>
      <div className="text-xs md:text-sm whitespace-nowrap mt-0.5">{name}</div>
    </div>
  );
}

export default React.memo(ChampionThumbnail);
