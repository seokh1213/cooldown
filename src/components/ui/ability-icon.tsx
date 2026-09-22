/**
 * 한 챔피언의 스킬 아이콘은 다섯 칸짜리 띠 한 장에서 잘라 쓴다
 *
 * VS 화면은 들어가자마자 두 챔피언의 P·Q·W·E·R 열 개를 함께 그린다. 낱장으로
 * 받으면 요청이 열 건이고, 재 보니 화면에 들어갈 때마다 자리맡이 하나씩 채워지는
 * 그 깜빡임이 이것이었다.
 *
 *   VS 진입 이미지 요청   낱장 12건(초상 2 · 스킬 10) → 띠 2건
 *
 * 팔백예순다섯 장을 한 장에 붙이는 길은 택하지 않았다. 한 챔피언을 보자고 1MB 를
 * 받게 된다. 챔피언마다 7KB 짜리 띠로 나누면 받는 양은 낱장과 같고 왕복만 준다.
 *
 * **칸 자리를 받아 오지 않는다.** 차례가 P·Q·W·E·R 로 정해져 있어 슬롯 글자만
 * 알면 몇째 칸인지 안다(`scripts/generate-thumbnails.ts` 의 `ABILITY_SLOTS`).
 * 목록을 기다릴 일이 없으니 첫 그림에 바로 나온다.
 *
 * 변신 스킬(`ability.forms`)은 이 길로 오지 않는다. 꼴마다 아이콘이 달라 한 칸에
 * 담을 수 없어 `AbilityFormIcon` 이 따로 그린다.
 */

import { sheetBackground } from "./sprite-icon";

/** 띠의 칸 차례. 생성기와 같아야 하고, 어긋나면 `test-thumbnails` 가 잡는다. */
const SLOTS = ["P", "Q", "W", "E", "R"] as const;

export type AbilitySlot = (typeof SLOTS)[number];

export function isAbilitySlot(slot: string): slot is AbilitySlot {
  return (SLOTS as readonly string[]).includes(slot);
}

interface AbilityIconProps {
  championId: string;
  slot: string;
  ddragonVersion: string;
  className?: string;
  alt?: string;
}

/** 띠에서 한 칸을 잘라 그린다. 칸 자리는 슬롯 글자로 정한다. */
export function AbilityIcon({ championId, slot, ddragonVersion, className, alt = "" }: AbilityIconProps) {
  const column = SLOTS.indexOf(slot as AbilitySlot);
  if (column < 0) return null;
  return (
    <span
      role={alt ? "img" : "presentation"}
      aria-label={alt || undefined}
      data-skill-icon
      data-sprite={`${championId}:${slot}`}
      className={className}
      style={{
        backgroundImage: sheetBackground(`${import.meta.env.BASE_URL}img/${ddragonVersion}/ability/${championId}.webp`),
        // 다섯 칸이 가로로만 놓인다. 세로는 나눌 것이 없다.
        backgroundSize: `${SLOTS.length * 100}% 100%`,
        backgroundPosition: `${(column / (SLOTS.length - 1)) * 100}% 0`,
      }}
    />
  );
}
