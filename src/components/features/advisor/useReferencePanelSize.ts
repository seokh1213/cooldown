/**
 * 자료 패널(넓은 화면에서 대화 왼쪽에 붙는 카드 자리)을 접고 펴기와 폭 — 가장자리를 끌거나 방향키로 정하고, 기기에 남긴다.
 */
import { useRef, useState } from "react";
import {
  REFERENCE_MAX_WIDTH,
  REFERENCE_MIN_WIDTH,
  advisorDrawerWidth,
  clampReferenceWidth,
  referencePanelWidth,
} from "@/hooks/useWideViewport";

/** 자료 패널을 접어 둔 것을 기억하는 열쇠. 기기마다. */
const REFERENCE_OPEN_KEY = "cooldown.advisor.reference-open";
/** 끌어서 정한 자료 패널 폭. */
const REFERENCE_WIDTH_KEY = "cooldown.advisor.reference-width";
/** 방향키로 한 번에 움직이는 폭. */
const RESIZE_STEP = 24;

function readReferenceWidth(): number | undefined {
  try {
    const stored = Number(localStorage.getItem(REFERENCE_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
}

function readReferenceOpen(): boolean {
  try {
    return localStorage.getItem(REFERENCE_OPEN_KEY) !== "false";
  } catch {
    return true;
  }
}

export function useReferencePanelSize(viewportWidth: number) {
  // 접을 수 있고, 접은 상태는 기기에 남는다.
  const [referenceOpen, setReferenceOpen] = useState(readReferenceOpen);
  const setReferenceOpenPersisted = (open: boolean) => {
    setReferenceOpen(open);
    try {
      localStorage.setItem(REFERENCE_OPEN_KEY, String(open));
    } catch {
      // 기억 못 해도 이번 세션에서는 동작한다
    }
  };
  const toggleReference = () => setReferenceOpenPersisted(!referenceOpen);

  // 자료 패널 폭. 사용자가 가장자리를 끌어 정하고, 그 값은 기기에 남는다.
  const [storedWidth, setStoredWidth] = useState(readReferenceWidth);
  const referenceWidth = clampReferenceWidth(storedWidth ?? referencePanelWidth(viewportWidth), viewportWidth);
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const applyWidth = (width: number, persist: boolean) => {
    const next = clampReferenceWidth(width, viewportWidth);
    setStoredWidth(next);
    if (!persist) return;
    try {
      localStorage.setItem(REFERENCE_WIDTH_KEY, String(next));
    } catch {
      // 기억 못 해도 이번 세션에서는 동작한다
    }
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 포인터를 잡지 못해도 끌기는 된다. 손이 가장자리를 벗어나면 끝날 뿐이다.
    }
    dragRef.current = { startX: event.clientX, startWidth: referenceWidth };
    setResizing(true);
  };

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // 패널은 드로어 왼쪽에 붙어 있다. 왼쪽으로 끌수록 넓어진다.
    const raw = drag.startWidth + (drag.startX - event.clientX);
    // 최소 폭보다 더 줄이려 하면 그 자리에서 닫는다. 끌다 말고 손을 떼게 하지 않는다.
    if (raw < REFERENCE_MIN_WIDTH - RESIZE_STEP) {
      endResize(event);
      setReferenceOpenPersisted(false);
      return;
    }
    applyWidth(raw, false);
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setResizing(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // 이미 놓였으면 그만이다
    }
    applyWidth(referenceWidth, true);
  };

  const resizeByKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") applyWidth(referenceWidth + RESIZE_STEP, true);
    else if (event.key === "ArrowRight") {
      if (referenceWidth <= REFERENCE_MIN_WIDTH) setReferenceOpenPersisted(false);
      else applyWidth(referenceWidth - RESIZE_STEP, true);
    } else if (event.key === "Home") applyWidth(REFERENCE_MAX_WIDTH, true);
    else if (event.key === "End") applyWidth(REFERENCE_MIN_WIDTH, true);
    else return;
    event.preventDefault();
  };

  return {
    referenceOpen,
    toggleReference,
    referenceWidth,
    resizing,
    drawerWidth: advisorDrawerWidth(viewportWidth, referenceOpen, storedWidth),
    resizeHandlers: {
      onPointerDown: startResize,
      onPointerMove: moveResize,
      onPointerUp: endResize,
      onPointerCancel: endResize,
      onKeyDown: resizeByKey,
    },
  };
}
