import { useEffect, RefObject } from "react";
import {
  APP_STORAGE_KEYS,
  readSessionStorage,
  writeSessionStorage,
} from "@/data/storage/appStorage";

export function useScrollPosition(
  listRef: RefObject<HTMLDivElement | null>,
  isModal: boolean,
  isOpen: boolean
) {
  // Restore scroll position when dialog opens
  useEffect(() => {
    if (!isModal || !isOpen) return;

    // Restore scroll position immediately (before images load)
    const restoreScroll = () => {
      if (listRef.current) {
        const savedPosition = readSessionStorage(APP_STORAGE_KEYS.championSelectorScroll);
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
    });

    // 이미지 로드 후에도 한 번 더 (레이아웃이 안정된 후)
    setTimeout(() => {
      restoreScroll();
    }, 200);
  }, [isModal, isOpen, listRef]);

  // Save scroll position when scrolling
  useEffect(() => {
    const listElement = listRef.current;
    if (!listElement || !isModal || !isOpen) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;
    const handleScroll = () => {
      // 디바운스: 스크롤이 끝난 후에만 저장
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        writeSessionStorage(
          APP_STORAGE_KEYS.championSelectorScroll,
          listElement.scrollTop.toString(),
        );
      }, 100);
    };

    listElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(scrollTimeout);
      listElement.removeEventListener("scroll", handleScroll);
    };
  }, [isModal, isOpen, listRef]);
}
