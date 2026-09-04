/**
 * `fN` 토큰을 BIN 안의 실제 값 이름으로 잇는 표.
 *
 * `fN` 은 스킬 스크립트가 실행 중에 채우는 자리다. 번호를 정하는 것도
 * 스크립트라 데이터만 보고 무엇을 가리키는지 알아낼 방법이 없다.
 * 대부분은 진짜 게임 진행 상황(획득 골드, 현재 중첩)이라 정적 데이터로는
 * 채울 수 없지만, 일부는 스크립트가 DataValue·계산식을 그대로 읽어
 * 보여줄 뿐이다. 그런 것만 여기에 적는다.
 *
 * 대상 이름이 사라지면 값을 못 찾고 다시 `?` 가 되며,
 * 허용 목록 검사가 회귀로 잡아낸다. 틀린 숫자가 조용히 남지는 않는다.
 */
interface RuntimeTokenAlias {
  /** BIN 의 DataValue 또는 mSpellCalculations 이름. `이름*100` 처럼 배율도 쓸 수 있다 */
  target: string;
  /** 이 자리에 무엇이 오는지 (원문 문장) */
  evidence: string;
}

const RUNTIME_TOKEN_ALIASES: Record<string, Record<string, RuntimeTokenAlias>> = {
  BelvethQ: {
    f1: {
      target: "PerSideCooldown",
      evidence: "재사용 대기시간은 방향마다 {{ f1 }}초씩 따로 적용되며",
    },
  },
  BelvethE: {
    f2: {
      target: "TotalStrikes",
      evidence: "{{ f2.0 }}회 공격합니다. 공격 횟수는 벨베스의 공격 속도에 비례해 증가",
    },
  },
  GarenE: {
    f1: {
      target: "NumberOfStrikes",
      evidence: "3초 동안 검을 들고 빠르게 회전하여 … {{ f1 }}회 입힙니다",
    },
  },
  // 세트 W 의 f1 (최대 피해)은 MaxDamage 계산식이 있지만 추가 공격력 계수가
  // 0.1 로, 같은 스킬의 DamageConversion(0.0025)과 40배 어긋난다.
  // 어느 쪽이 맞는지 데이터만으로 판단할 수 없어 매핑하지 않는다.
  SyndraW: {
    f2: {
      target: "SlowDuration",
      evidence: "{{ f2 }}초 동안 25% 둔화시킵니다",
    },
  },
  XinZhaoE: {
    f1: {
      // ASMod 는 비율(0.38)로 들어 있고 문장은 `{{ f1 }}%` 라 ×100 이 필요하다.
      // 실제로는 주문력 계수도 더해지지만 그 합성식은 BIN 에 없다.
      target: "ASMod*100",
      evidence: "5초 동안 신 짜오의 공격 속도가 {{ f1 }}% 증가합니다",
    },
  },
};

/**
 * `f2.0` 처럼 뒤에 붙는 숫자는 소수점 자릿수 지정이라 이름에서 떼어낸다.
 */
export function resolveRuntimeTokenAlias(
  spellId: string | undefined,
  variable: string,
): string | null {
  if (!spellId) return null;
  const match = /^(f\d+)(?:\.\d+)?$/i.exec(variable.trim());
  if (!match) return null;
  const entry = RUNTIME_TOKEN_ALIASES[spellId]?.[match[1].toLowerCase()];
  return entry ? entry.target : null;
}
