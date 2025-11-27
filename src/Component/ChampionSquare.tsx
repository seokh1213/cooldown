import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ChampionSquareProps {
  name: string;
  squareSrc: string;
}

function ChampionSquare({ name, squareSrc }: ChampionSquareProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center m-2.5 h-fit">
      <div className="relative w-[90px] h-[90px]">
        {!isLoaded && (
          <div className="absolute top-0 left-0 w-[90px] h-[90px] rounded-xl bg-muted flex items-center justify-center text-muted-foreground text-xs">
            ...
          </div>
        )}
        <img
          className={cn(
            "w-[90px] h-[90px] rounded-xl bg-black border-0 mb-2 box-border transition-opacity duration-200",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          src={squareSrc}
          alt={name}
          loading="lazy"
          onLoad={handleLoad}
        />
      </div>
      <div className="whitespace-nowrap text-muted-foreground">{name}</div>
    </div>
  );
}

export default React.memo(ChampionSquare);
