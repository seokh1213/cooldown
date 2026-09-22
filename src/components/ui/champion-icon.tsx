/**
 * 챔피언 초상은 어디서나 시트에서 잘라 쓴다
 *
 * 시트(`img/<판본>/champions.webp`, 383KB)는 서비스워커가 설치할 때 받아 두므로
 * 앱이 뜬 순간 이미 손에 있다. 그런데 백과 목록 한 곳만 그것을 쓰고, VS·시뮬레이션·
 * 비교·도우미 스무 곳은 낱장 `<img>` 를 그렸다. 시트를 이미 받아 놓고도 같은
 * 그림을 낱장으로 다시 받은 셈이다.
 *
 *   VS 화면 진입   이미지 요청 14건 (초상 2 · 스킬·패시브 10 · 시트 2)
 *
 * 낱장은 용량이 아니라 왕복이 문제다. 24KB뿐인데 12번을 오간다. 지연이 있는
 * 회선에서 자리맡이 하나씩 채워지는 것이 이것이다.
 *
 * 자리마다 목록을 들고 다니게 하지 않는다. 화면 넷이 저마다 `championList` 를
 * 프로퍼티로 받고 있어 그 아래 스무 곳까지 내려보내려면 배관만 늘어난다. 룬
 * 화면이 이미 쓰는 방식대로 **맨 위에서 한 번 깔고** 쓰는 자리는 id 만 댄다.
 *
 * 시트에 없는 id 는 낱장으로 돌아간다. 새 챔피언이 나와 시트가 아직 안 만들어진
 * 판본에서도 그림이 비지 않는다.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { championIconUrl } from "@/data/assets/riotAssetUrls";
import { SpriteIcon, useSpriteSheet, type SheetState } from "./sprite-icon";

const ChampionSheetContext = createContext<SheetState | undefined>(undefined);

interface ProviderProps {
  /** 시트를 붙일 때 쓴 것과 같은 차례의 챔피언 id 목록 */
  ids: readonly string[];
  ddragonVersion: string;
  children: ReactNode;
}

export function ChampionSheetProvider({ ids, ddragonVersion, children }: ProviderProps) {
  const sheet = useSpriteSheet("champion", ddragonVersion, ids);
  return <ChampionSheetContext.Provider value={sheet}>{children}</ChampionSheetContext.Provider>;
}

/**
 * 깔려 있는 시트를 그대로 본다.
 *
 * 자리맡을 띄웠다 지우는 화면(챔피언 고르개)이 시트에서 자를 수 있는지 먼저 알아야
 * 한다. 자를 수 있으면 기다릴 것이 없으니 자리맡 자체를 그리지 않는다.
 */
export function useChampionSheet(): SheetState | undefined {
  return useContext(ChampionSheetContext);
}

interface ChampionIconProps {
  id: string;
  /** 판본. 시트에 없어 낱장으로 돌아갈 때 쓴다. */
  ddragonVersion: string;
  /**
   * 크기를 px 로 박을 때. `size-7 sm:size-9` 처럼 CSS 로 주는 자리는 비우고
   * className 에 맡긴다.
   */
  size?: number;
  className?: string;
  alt?: string;
}

/** 챔피언 초상 한 장. 시트가 깔려 있으면 잘라 쓰고, 없으면 낱장을 받는다. */
export function ChampionIcon({ id, ddragonVersion, size, className, alt = "" }: ChampionIconProps) {
  const sheet = useContext(ChampionSheetContext);
  if (sheet?.index.has(id)) {
    return <SpriteIcon state={sheet} id={id} size={size} className={className} alt={alt} />;
  }
  return (
    <img
      src={championIconUrl(ddragonVersion, id)}
      alt={alt}
      {...(size === undefined ? {} : { width: size, height: size })}
      className={className}
    />
  );
}

/** 목록을 기억해 둔다. 새 배열이 매번 오면 시트 자리표가 그때마다 다시 만들어진다. */
export function useChampionIds(champions: ReadonlyArray<{ id: string }> | null | undefined): string[] {
  return useMemo(() => (champions ?? []).map((champion) => champion.id), [champions]);
}
