import { useMemo } from "react";
import { SPRITE_SHEETS } from "@/data/generated/spriteSheets";

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

/**
 * 시트 배경 주소. AVIF 를 먼저 걸고 WebP 를 남긴다.
 *
 * 합친 장은 우리가 내보내는 것 중 가장 무겁다. AVIF 사본이 챔피언 53%, 아이템 36%
 * 작다. `image-set` 의 `type()` 은 **읽을 수 있는 쪽만** 고르므로 둘을 함께 걸면
 * 브라우저가 알아서 집는다.
 *
 * 다만 `image-set` 자체를 모르는 브라우저는 그 줄을 통째로 버린다 — 인라인 스타일은
 * 한 이름에 두 값을 못 적어 `url()` 을 밑에 깔 수도 없다. 그래서 문법을 읽을 수
 * 있는지 먼저 묻고, 못 읽으면 WebP 주소를 그대로 준다. 한 번만 묻고 기억한다.
 */
let imageSetSupported: boolean | undefined;

export function sheetBackground(webpUrl: string): string {
  if (imageSetSupported === undefined) {
    imageSetSupported =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("background-image", 'image-set(url("a.avif") type("image/avif"))');
  }
  if (!imageSetSupported) return `url(${webpUrl})`;
  const avifUrl = webpUrl.replace(/\.webp$/, ".avif");
  return `image-set(url("${avifUrl}") type("image/avif"), url("${webpUrl}") type("image/webp"))`;
}

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
 * **차례는 부르는 쪽에서 오지 않는다.** 생성기가 시트를 붙이면서 적어 둔 목록을
 * 묶음에 심어 두고(`src/data/generated/spriteSheets.ts`) 그것을 본다.
 *
 * 한때는 화면이 들고 있는 목록을 그대로 자리로 삼았다. 그 목록은 **보여 줄 차례**라
 * — 즐겨찾기가 앞에 오고 그다음은 그 나라 말 가나다순 — 시트와 맞을 까닭이 없었고
 * 실제로 어긋나 있었다.
 *
 *   가렌 자리에 아트록스, 갈리오 자리에 아리
 *
 * 그림이 비지 않고 **다른 그림이** 나오므로 눈으로는 고장으로 안 보인다. 양쪽을
 * 이름순으로 맞춰 한 번 고쳤지만, 목록을 일부만 넘기면 열 수가 달라져 여전히 밀렸다.
 * 그리고 목록을 들고 있지 않은 자리(아이템 상세·고르개)는 시트를 아예 못 썼다.
 *
 * 네 시트를 합쳐 13KB(gzip 4KB)다. 그만큼을 묶음에 지고 부르는 쪽은 id 만 댄다.
 *
 * 판본마다 한 벌만 만들어 두고 나눠 쓴다. 아이템 격자는 한 화면에 이백 칸이 넘게
 * 그려지는데, 칸마다 868자리 표를 새로 지으면 그것이 곧 비용이다.
 */
const sheets = new Map<string, SheetState>();

export function sheetFor(kind: SheetKind, ddragonVersion: string): SheetState {
  const key = `${kind}:${ddragonVersion}`;
  const cached = sheets.get(key);
  if (cached) return cached;
  // 룬 아이콘만 판본 밖에 둔다. 룬 자료에 판본이 없어 부르는 쪽이 값을 모른다.
  const base = kind === "rune" ? `${import.meta.env.BASE_URL}img` : `${import.meta.env.BASE_URL}img/${ddragonVersion}`;
  const grid = SPRITE_SHEETS[kind];
  const state: SheetState = {
    url: `${base}/${kind}s.webp`,
    index: new Map((grid?.ids ?? []).map((id, position) => [id, position])),
    cols: Math.max(1, grid?.cols ?? 1),
  };
  sheets.set(key, state);
  return state;
}

export function useSpriteSheet(kind: SheetKind, ddragonVersion: string): SheetState {
  return useMemo(() => sheetFor(kind, ddragonVersion), [kind, ddragonVersion]);
}

interface SpriteIconProps {
  state: SheetState;
  id: string;
  /** 화면에 그릴 크기(px). 크기를 className 으로 주는 자리는 비워 둔다. */
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * 시트에서 한 칸을 잘라 그린다. 칸을 못 찾으면 아무것도 그리지 않는다.
 *
 * 자리를 **백분율로** 잡는다. px 로 잡으면 칸 크기가 인라인 스타일에 박혀
 * `size-7 sm:size-9` 처럼 화면 폭에 따라 크기가 달라지는 자리를 못 쓴다. 실제로
 * VS 화면이 그 꼴이라 낱장 `<img>` 로 남아 있었다. 백분율은 요소가 몇 px 이든
 * 따라오므로 크기를 CSS 에 맡길 수 있다.
 */
export function SpriteIcon({ state, id, size, className, alt = "" }: SpriteIconProps) {
  const position = state.index.get(id);
  if (position === undefined) return null;
  const col = position % state.cols;
  const row = Math.floor(position / state.cols);
  const rows = Math.max(1, Math.ceil(state.index.size / state.cols));
  // 한 칸뿐인 축은 나눌 것이 없다. 0 으로 나누면 NaN 이 배경 자리에 들어간다.
  const at = (index: number, count: number) => (count > 1 ? `${(index / (count - 1)) * 100}%` : "0%");
  return (
    <span
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      data-sprite={id}
      className={className}
      style={{
        backgroundImage: sheetBackground(state.url),
        backgroundSize: `${state.cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${at(col, state.cols)} ${at(row, rows)}`,
        ...(size === undefined ? {} : { width: `${size}px`, height: `${size}px` }),
      }}
    />
  );
}
