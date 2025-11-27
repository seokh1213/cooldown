/**
 * 이미지 preload 유틸리티
 */
export const preloadImage = (src: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
};

/**
 * 여러 이미지를 preload
 */
export const preloadImages = async (srcs: string[]): Promise<void> => {
  await Promise.allSettled(srcs.map(preloadImage));
};

/**
 * 이미지 로드 상태를 관리하는 hook을 위한 타입
 */
export interface ImageLoadState {
  loading: boolean;
  error: boolean;
  loaded: boolean;
}

