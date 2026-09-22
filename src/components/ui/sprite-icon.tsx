import { useMemo } from "react";

/**
 * 목록 화면의 아이콘을 **한 장에서 잘라 쓴다**
 *
 * 챔피언 목록은 173장을, 아이템 목록은 눈에 보이는 것만 해도 212장을, 룬 화면은
 * 76장을 한꺼번에 그린다. 낱장으로 받으면 그만큼 요청이 줄줄이 날아가고 그동안
 * 자리맡이 보였다가 하나씩 채워진다. CI 가 만들어 둔 스프라이트를 잘라 쓰면
 * 요청이 1건이다.
 *
 * **칸 자리는 받아 오지 않고 계산한다.** 처음에는 시트 옆에 목록 JSON 을 두고
 * 그것을 받아 자리를 정했는데, 받아 오는 동안 그릴 것이 없어 빈 칸이 보였다.
 * 재 보니 그 목록이 도착하는 데 330ms 였고 그동안 격자가 비어 있었다.
 *
 * 시트는 자료와 **같은 차례**로 붙어 있다(그 짝은 `test-thumbnails` 가 건다).
 * 그러니 화면이 이미 들고 있는 목록만으로 자리를 알 수 있다. 받을 것이 없으니
 * 기다릴 것도 없고 첫 그림에 바로 나온다.
 *
 * 상세 화면처럼 한 장만 쓰는 자리는 그대로 `<img>` 를 쓴다. 한 장 보자고 시트
 * 전체를 받을 까닭이 없다.
 */

export type SheetKind = "champion" | "item" | "rune" | "summoner";

/*
 * 시트에 박힌 칸 크기는 챔피언 96px, 아이템·룬 64px 다
 * (`scripts/generate-thumbnails.ts`). 여기서는 그 값을 쓰지 않는다 — 배경을
 * 화면에 그릴 크기로 늘려 놓고 자르므로, 원본이 몇 px 든 자리는 같다.
 */

export interface SheetState {
  url: string;
  /** 이름 → 칸 번호 */
  index: Map<string, number>;
  cols: number;
}

/**
 * 시트를 쓸 준비를 한다. 받아 오는 것이 없으므로 곧바로 쓸 수 있다.
 *
 * `ids` 는 생성기가 시트를 붙일 때 쓴 것과 같은 차례여야 한다. 하나라도 어긋나면
 * 그 뒤가 통째로 밀리는데, 눈으로는 "왜 이 아이콘이지" 싶을 뿐 고장으로 안 보인다.
 * 그래서 시험이 시트 옆 목록과 자료 차례를 맞춰 본다.
 */
export function useSpriteSheet(kind: SheetKind, ddragonVersion: string, ids: readonly string[]): SheetState {
  return useMemo(() => {
    // 룬 아이콘만 판본 밖에 둔다. 룬 자료에 판본이 없어 부르는 쪽이 값을 모른다.
    const base = kind === "rune" ? `${import.meta.env.BASE_URL}img` : `${import.meta.env.BASE_URL}img/${ddragonVersion}`;
    return {
      url: `${base}/${kind}s.webp`,
      index: new Map(ids.map((id, position) => [id, position])),
      // 생성기가 정사각에 가깝게 붙인다. 칸 수만 같으면 열 수가 저절로 맞는다.
      cols: Math.max(1, Math.ceil(Math.sqrt(ids.length))),
    };
  }, [kind, ddragonVersion, ids]);
}

interface SpriteIconProps {
  state: SheetState;
  id: string;
  /** 화면에 그릴 크기(px) */
  size: number;
  className?: string;
  alt?: string;
}

/** 시트에서 한 칸을 잘라 그린다. 칸을 못 찾으면 아무것도 그리지 않는다. */
export function SpriteIcon({ state, id, size, className, alt = "" }: SpriteIconProps) {
  const position = state.index.get(id);
  if (position === undefined) return null;
  const col = position % state.cols;
  const row = Math.floor(position / state.cols);
  const rows = Math.max(1, Math.ceil(state.index.size / state.cols));
  return (
    <span
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      data-sprite={id}
      className={className}
      style={{
        backgroundImage: `url(${state.url})`,
        backgroundSize: `${state.cols * size}px ${rows * size}px`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
        width: `${size}px`,
        height: `${size}px`,
      }}
    />
  );
}
