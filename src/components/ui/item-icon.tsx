/**
 * 아이템 아이콘도 어디서나 시트에서 잘라 쓴다
 *
 * 시트(`img/<판본>/items.webp`)는 앱이 뜬 뒤 손이 빈 틈에 받아 둔다(`warmIcons`).
 * 그런데 그것을 쓰는 곳은 백과 격자 하나뿐이었다. 상세 화면·조합 트리·시뮬레이션
 * 고르개는 이미 받아 둔 시트를 놔두고 낱장을 다시 받았다.
 *
 *   고르개를 처음 열 때   낱장 39건 · 67KB (시트는 이미 손에 있는 채로)
 *
 * 격자 칸마다 훅을 돌릴 수 없어 부르는 쪽이 시트를 읽어 넘기는 꼴이었는데, 칸 차례가
 * 묶음에 들어오면서 그럴 까닭이 없어졌다(`sheetFor`). 표를 판본마다 한 벌만 만들어
 * 나눠 쓰므로 한 화면에 이백 칸이 넘어도 짓는 비용이 한 번이다.
 *
 * 시트에 없는 id 는 낱장으로 돌아간다. 새 아이템이 나와 시트가 아직 안 만들어진
 * 판본에서도 그림이 비지 않는다.
 */
import { itemIconUrl } from "@/data/assets/riotAssetUrls";
import { SpriteIcon, sheetFor } from "./sprite-icon";

interface ItemIconProps {
  id: string;
  ddragonVersion: string;
  /** 크기를 px 로 박을 때. CSS 로 주는 자리는 비우고 className 에 맡긴다. */
  size?: number;
  className?: string;
  alt?: string;
}

export function ItemIcon({ id, ddragonVersion, size, className, alt = "" }: ItemIconProps) {
  const sheet = sheetFor("item", ddragonVersion);
  if (sheet.index.has(id)) {
    return <SpriteIcon state={sheet} id={id} size={size} className={className} alt={alt} />;
  }
  return (
    <img
      src={itemIconUrl(ddragonVersion, id)}
      alt={alt}
      loading="lazy"
      decoding="async"
      {...(size === undefined ? {} : { width: size, height: size })}
      className={className}
    />
  );
}
