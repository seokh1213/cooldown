import { useEffect, useState } from "react";
import { preloadImage } from "@/lib/imageUtils";

/**
 * 이미지 preload를 관리하는 hook
 */
export function useImagePreload(src: string | null) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!src) {
      setIsLoaded(false);
      setHasError(false);
      return;
    }

    setIsLoaded(false);
    setHasError(false);

    preloadImage(src)
      .then(() => setIsLoaded(true))
      .catch(() => setHasError(true));
  }, [src]);

  return { isLoaded, hasError };
}

/**
 * 여러 이미지를 순차적으로 preload하는 hook
 */
export function useImagePreloadQueue(srcs: string[]) {
  const [preloadedSrcs, setPreloadedSrcs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadImages = async () => {
      for (const src of srcs) {
        try {
          await preloadImage(src);
          setPreloadedSrcs((prev) => new Set(prev).add(src));
        } catch (error) {
          console.warn(`Failed to preload image: ${src}`, error);
        }
      }
    };

    loadImages();
  }, [srcs]);

  return preloadedSrcs;
}

