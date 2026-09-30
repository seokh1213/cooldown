/**
 * 다른 스킬 값(`spell.<이름>:<값>`)을 부를 때 0랭크 값까지 보일지 정한다.
 *
 * CDragon DataValues 는 칸 번호가 랭크라 0번 칸이 0랭크(아직 배우지 않은 상태)다.
 * 대부분은 보이지 않는 자리라 버린다. 1랭크를 베껴 두었거나(케이틀린 W 헤드샷 35),
 * 계산용으로 채운 값이거나(엘리스 R 거미 피해 4, 니달리 R 덮치기 -20),
 * 아예 쓰이지 않는다(멜 R 자기 궁극기 피해 50).
 *
 * 그런데 부르는 쪽 효과가 대상 스킬을 배우기 전에도 켜져 있으면 0랭크 값이 실제로 보인다.
 * 피오라 패시브의 이동 속도는 R 을 배우기 전 20% 이고 R 랭크마다 30/40/50% 가 된다.
 * 위키도 R 랭크 0~3 으로 20/30/40/50% 를 적는다.
 *
 * 규칙: 부르는 쪽이 패시브이고, 대상 스킬의 1랭크가 1레벨보다 뒤에 열린다.
 * 패시브는 1레벨부터 늘 켜져 있고 대상 스킬은 그 레벨 전까지 반드시 0랭크라
 * 누구에게나 0랭크 구간이 생긴다. 기본 R(6레벨)이 여기에 걸린다(피오라·멜 패시브).
 * R 을 1레벨부터 가진 챔피언(엘리스·니달리·카르마·제이스·우디르)은 0랭크 구간이 없어 빠진다.
 *
 * 그 밖의 조합은 데이터만으로 가릴 수 없다.
 * - 기본 스킬이 R 값을 부를 때: 그나르 W 이동 속도는 R 없이도 켜져 있지만,
 *   유나라 W 궁극기 형태는 R 이 켜져 있어야 보인다. 아니비아 Q 둔화는 0랭크가 1랭크와 같은
 *   20% 라 위키도 20/30/40% 로 적는다.
 * - 패시브가 기본 스킬 값을 부를 때: 일라오이 촉수는 Q 없이도 내려치지만,
 *   케이틀린 덫 헤드샷은 W 를 배워야 생긴다.
 * 이런 곳은 위키로 확인해 아래 표에 적는다.
 *
 * DataValues 에만 해당한다. effectBurn 문자열은 추출할 때 0랭크 칸을 버린다.
 */
import type { CommunityDragonSpellData, ParseResult } from "./types";

interface RankZeroReference {
  /** 0랭크 값이 보인다는 근거 (위키 수치) */
  evidence: string;
}

/** 부르는 스킬 id → `대상 스킬:값 이름` (소문자) */
const RANK_ZERO_REFERENCES: Record<string, Record<string, RankZeroReference>> = {
  GnarW: {
    "gnarr:rhypermovementspeedpercent": {
      evidence: "위키 Hyper: GNAR! 랭크 0~3 에 추가 이동 속도 20/40/60/80%",
    },
  },
  RyzeQWrapper: {
    "ryzer:overloaddamagebonus": {
      evidence: "위키 Overload: Realm Warp 랭크 0~3 에 Flux 대상 피해 15/40/65/90% 증가",
    },
  },
  IllaoiPassive: {
    "illaoiq:tentacledamagetotal": {
      evidence: "위키 Prophet of an Elder God: Tentacle Smash 랭크 0~5 에 촉수 피해 0/10/15/20/25/30% 증가",
    },
  },
};

/**
 * 다른 스킬 값을 몇 랭크부터 읽을지 돌려준다. 0 이면 0랭크 값을 앞에 붙인다.
 * @param spellId 부르는 스킬 id
 * @param owner 부르는 스킬 데이터
 * @param target 값을 가진 스킬 데이터
 */
export function resolveReferenceFirstRank(
  spellId: string | undefined,
  owner: CommunityDragonSpellData | undefined,
  target: CommunityDragonSpellData,
  parseResult: ParseResult,
): 0 | 1 {
  if (owner?.isPassive && (target.firstRankLevel ?? 1) > 1) return 0;
  if (!spellId || !parseResult.spellRef) return 1;
  const reference = `${parseResult.spellRef}:${parseResult.variable}`.toLowerCase();
  return RANK_ZERO_REFERENCES[spellId]?.[reference] ? 0 : 1;
}
