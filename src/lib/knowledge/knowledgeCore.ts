import type { NoteVersion } from "./noteVersion";
export type TipPerspective = "playing" | "against";

export interface CuratedTip {
  version?: NoteVersion;
  id: string;
  /** 이 팁의 주체 챔피언 id (예: MonkeyKing) */
  champion: string;
  /** 시점: 이 챔피언을 플레이할 때 / 이 챔피언을 상대할 때 */
  perspective: TipPerspective;
  /** 특정 상대에게만 유효하면 지정 */
  vs?: string;
  lane?: "top" | "jungle" | "mid" | "bot" | "support";
  /** 분류: rune | item | summoner | laning | teamfight | skill | build-order | general */
  category: string;
  text: string;
  /** 본문이 권장하는 게임 내 고유명사 (검증기가 데이터와 대조) */
  refs?: { items?: string[]; runes?: string[]; summoners?: string[] };
  /** 본문이 비교 대상으로만 언급하거나 피하라고 한 이름 (권장안에서 제외) */
  avoid?: { items?: string[]; runes?: string[]; summoners?: string[] };
  /** 출처/작성자 메모 */
  source?: string;
  /** 검증된 패치 (예: 26.17). 오래된 팁은 프롬프트에서 표기 */
  verifiedPatch?: string;
}

export interface CuratedTipFile {
  champion: string;
  tips: Array<Omit<CuratedTip, "champion" | "id"> & { id?: string }>;
}
