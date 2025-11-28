import React, { useCallback, useEffect, useState } from "react";
import LeftArrow from "@/components/icons/LeftArrow";
import RightArrow from "@/components/icons/RightArrow";
import { useImagePreload } from "@/hooks/useImagePreload";
import { cn } from "@/lib/utils";

interface SplashImageProps {
  src: string;
  name: string;
  changeHandler: (inc: number) => void;
  nextSkinSrc?: string;
  prevSkinSrc?: string;
}

function SplashImage({ src, name, changeHandler, nextSkinSrc, prevSkinSrc }: SplashImageProps) {
  const { isLoaded, hasError } = useImagePreload(src);
  const [nextLoaded, setNextLoaded] = useState(false);
  const [prevLoaded, setPrevLoaded] = useState(false);

  // 다음/이전 스킨 이미지 preload
  useEffect(() => {
    if (nextSkinSrc && !nextLoaded) {
      const img = new Image();
      img.onload = () => setNextLoaded(true);
      img.src = nextSkinSrc;
    }
  }, [nextSkinSrc, nextLoaded]);

  useEffect(() => {
    if (prevSkinSrc && !prevLoaded) {
      const img = new Image();
      img.onload = () => setPrevLoaded(true);
      img.src = prevSkinSrc;
    }
  }, [prevSkinSrc, prevLoaded]);

  const handlePrevious = useCallback(() => {
    changeHandler(-1);
  }, [changeHandler]);

  const handleNext = useCallback(() => {
    changeHandler(1);
  }, [changeHandler]);

  return (
    <div className="relative w-full min-h-[250px] bg-muted rounded-md rounded-b-none overflow-hidden">
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/80 to-muted bg-[length:200%_100%] animate-[loading_1.5s_ease-in-out_infinite]" />
      )}
      <img
        className={cn(
          "w-full min-h-[250px] rounded-md rounded-b-none object-cover transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        src={src}
        alt={name}
        loading="eager"
      />
      <div className="absolute bottom-0 left-0 right-0 text-xs text-muted-foreground text-right p-0.5 capitalize bg-gradient-to-t from-black/70 to-transparent">
        {name}
      </div>
      <button
        onClick={handlePrevious}
        className="absolute top-1/2 -translate-y-1/2 left-2 p-2 rounded-md bg-black/50 hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors z-20"
        aria-label="Previous skin"
      >
        <LeftArrow
          handler={() => {}}
          style={{
            width: "20px",
            height: "40px",
            cursor: "pointer",
            pointerEvents: "none",
          }}
        />
      </button>
      <button
        onClick={handleNext}
        className="absolute top-1/2 -translate-y-1/2 right-2 p-2 rounded-md bg-black/50 hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors z-20"
        aria-label="Next skin"
      >
        <RightArrow
          handler={() => {}}
          style={{
            width: "20px",
            height: "40px",
            cursor: "pointer",
            pointerEvents: "none",
          }}
        />
      </button>
    </div>
  );
}

export default React.memo(SplashImage);
