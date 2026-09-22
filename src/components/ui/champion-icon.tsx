/**
 * 챔피언 초상은 어디서나 시트에서 잘라 쓴다
 *
 * 시트(`img/<판본>/champions.webp`)는 앱이 뜬 뒤 손이 빈 틈에 받아 둔다
 * (`warmIcons`). 그런데 백과 목록 한 곳만 그것을 쓰고, VS·시뮬레이션·비교·도우미
 * 스무 곳은 낱장 `<img>` 를 그렸다. 시트를 이미 받아 놓고도 같은 그림을 낱장으로
 * 다시 받은 셈이다.
 *
 *   VS 화면 진입   이미지 요청 14건 (초상 2 · 스킬·패시브 10 · 시트 2)
 *
 * 낱장은 용량이 아니라 왕복이 문제다. 24KB뿐인데 열두 번을 오간다. 지연이 있는
 * 회선에서 자리맡이 하나씩 채워지는 것이 이것이다.
 *
 * 자리마다 목록을 들고 다니게 하지 않는다. 칸 차례는 묶음에 심어 두었으므로
 * (`sheetFor`) 쓰는 자리는 id 만 대면 된다.
 *
 * 시트에 없는 id 는 낱장으로 돌아간다. 새 챔피언이 나와 시트가 아직 안 만들어진
 * 판본에서도 그림이 비지 않는다.
 */
import { championIconUrl } from "@/data/assets/riotAssetUrls";
import { SpriteIcon, sheetFor } from "./sprite-icon";

interface ChampionIconProps {
  id: string;
  /** 판본. 시트 주소를 짓고, 시트에 없어 낱장으로 돌아갈 때도 쓴다. */
  ddragonVersion: string;
  /**
   * 크기를 px 로 박을 때. `size-7 sm:size-9` 처럼 CSS 로 주는 자리는 비우고
   * className 에 맡긴다.
   */
  size?: number;
  className?: string;
  alt?: string;
}

/** 챔피언 초상 한 장. 시트에 있으면 잘라 쓰고, 없으면 낱장을 받는다. */
export function ChampionIcon({ id, ddragonVersion, size, className, alt = "" }: ChampionIconProps) {
  const sheet = sheetFor("champion", ddragonVersion);
  if (sheet.index.has(id)) {
    return <SpriteIcon state={sheet} id={id} size={size} className={className} alt={alt} />;
  }
  return (
    <img
      src={championIconUrl(ddragonVersion, id)}
      alt={alt}
      decoding="async"
      {...(size === undefined ? {} : { width: size, height: size })}
      className={className}
    />
  );
}

/** 시트가 이 챔피언을 담고 있는가. 자리맡을 띄울지 말지 가르는 자리에서 쓴다. */
export function championInSheet(id: string, ddragonVersion: string): boolean {
  return sheetFor("champion", ddragonVersion).index.has(id);
}
