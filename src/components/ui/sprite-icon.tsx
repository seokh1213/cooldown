import { useEffect, useMemo, useState } from "react";

/**
 * 목록 화면의 아이콘을 **한 장에서 잘라 쓴다**
 *
 * 챔피언 목록은 173장을, 아이템 목록은 눈에 보이는 것만 해도 212장을 한꺼번에
 * 그린다. 낱장으로 받으면 그만큼 요청이 줄줄이 날아가고 그동안 자리맡이 보였다가
 * 하나씩 채워진다. CI 가 만들어 둔 스프라이트를 받아 잘라 쓰면 요청이 1건이고
 * 화면이 한 번에 찬다.
 *
 * 상세 화면처럼 한 장만 쓰는 자리는 그대로 `<img>` 를 쓴다. 한 장 보자고 스프라이트
 * 전체를 받을 까닭이 없다.
 */

export interface SpriteSheet {
  /** 한 칸의 픽셀 크기 */
  size: number;
  cols: number;
  rows: number;
  /** 격자에 놓인 차례. 여기 자리가 곧 칸 번호다. */
  ids: string[];
}

export interface SheetState {
  sheet?: SpriteSheet;
  url: string;
  index: Map<string, number>;
  /**
   * 아직 스프라이트를 쓸지 말지 정하지 못했는가.
   *
   * 이 값이 없을 때 곧바로 낱장 `<img>` 로 떨어뜨렸더니, 매니페스트가 오기 전에
   * 212건이 이미 날아가 버렸다. 스프라이트로 바꿔 그려 봐야 요청은 벌어진 뒤였다.
   * 판단이 설 때까지는 빈 자리를 두고 기다린다.
   */
  pending: boolean;
}

const cache = new Map<string, Promise<SpriteSheet>>();

function load(url: string): Promise<SpriteSheet> {
  const cached = cache.get(url);
  if (cached) return cached;
  const pending = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${response.status} ${url}`);
    return response.json() as Promise<SpriteSheet>;
  });
  cache.set(url, pending);
  return pending;
}

/**
 * 스프라이트 한 장을 읽어 둔다.
 *
 * 아직 못 읽었거나 읽기에 실패하면 `sheet` 가 비어 있고, 그때는 부르는 쪽이 낱장
 * `<img>` 로 돌아간다. 새 챔피언이 자료에는 있는데 스프라이트에는 아직 없는 동안에도
 * 그림이 깨지지 않는다.
 */
export function useSpriteSheet(kind: "champion" | "item", ddragonVersion: string): SheetState {
  const base = `${import.meta.env.BASE_URL}img/${ddragonVersion}`;
  const [sheet, setSheet] = useState<SpriteSheet>();
  const [pending, setPending] = useState(true);
  useEffect(() => {
    if (!ddragonVersion) return;
    setPending(true);
    let alive = true;
    load(`${base}/${kind}s.json`)
      .then((value) => {
        if (alive) setSheet(value);
      })
      .catch(() => {
        // 스프라이트가 없으면 낱장으로 간다. 목록이 안 보이는 것보다 낫다.
      })
      .finally(() => {
        if (alive) setPending(false);
      });
    return () => {
      alive = false;
    };
  }, [base, kind, ddragonVersion]);
  // 칸 번호 표는 한 번만 짓는다. 아이템은 868칸이라 그릴 때마다 다시 지으면 아깝다.
  const index = useMemo(() => new Map((sheet?.ids ?? []).map((id, position) => [id, position])), [sheet]);
  return { sheet, url: `${base}/${kind}s.webp`, index, pending };
}

interface SpriteIconProps {
  state: SheetState;
  id: string;
  /** 화면에 그릴 크기(px) */
  size: number;
  className?: string;
  alt?: string;
}

/**
 * 스프라이트에서 한 칸을 잘라 그린다. 칸을 못 찾으면 아무것도 그리지 않는다 —
 * 부르는 쪽이 `has` 로 미리 갈라 낱장을 쓰면 된다.
 */
export function SpriteIcon({ state, id, size, className, alt = "" }: SpriteIconProps) {
  const position = state.index.get(id);
  const sheet = state.sheet;
  if (sheet === undefined || position === undefined) return null;
  const col = position % sheet.cols;
  const row = Math.floor(position / sheet.cols);
  return (
    <span
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      data-sprite={id}
      className={className}
      style={{
        backgroundImage: `url(${state.url})`,
        backgroundSize: `${sheet.cols * size}px ${sheet.rows * size}px`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
        width: `${size}px`,
        height: `${size}px`,
      }}
    />
  );
}
