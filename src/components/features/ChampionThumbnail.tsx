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
    <div className="flex flex-col items-center justify-center m-2.5 h-fit">
      <div className="cursor-pointer" onClick={handleClick}>
        <div className="relative w-20 h-20">
          {!isLoaded && !hasError && (
            <div className="absolute top-0 left-0 w-20 h-20 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs">
              ...
            </div>
          )}
          <img
            className={cn(
              "w-20 h-20 rounded-full bg-black border-0 mb-1 box-border transition-opacity duration-200",
              "hover:shadow-lg hover:shadow-red-900/50",
              selected && "border-4 border-green-500",
              isLoaded ? "opacity-100" : "opacity-0"
            )}
            src={thumbnailSrc}
            alt={name}
            loading="lazy"
            onLoad={handleLoad}
            onError={handleError}
          />
        </div>
      </div>
      <div className="text-base whitespace-nowrap">{name}</div>
    </div>
  );
}

export default React.memo(ChampionThumbnail);
