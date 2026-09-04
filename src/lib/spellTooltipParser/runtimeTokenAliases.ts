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
import type { SpellCalculation } from "./types";

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
  SettW: {
    f1: {
      target: "MaxDamage",
      evidence: "소모한 투지에 해당하는 고정 피해를 입힙니다. (최대 {{ f1 }}의 피해)",
    },
  },
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
 * BIN 의 계산식이 명백히 어긋날 때 쓰는 교체본.
 *
 * 같은 스킬 안에 같은 값을 두 번 적어 둔 곳이 있는데, 한쪽만 갱신되고
 * 다른 쪽이 낡은 채로 남아 있는 경우가 있다. 살아 있는 쪽을 조합해 쓴다.
 */
const CALCULATION_OVERRIDES: Record<
  string,
  Record<string, { calculation: SpellCalculation; evidence: string }>
> = {
  SettW: {
    MaxDamage: {
      // BIN 의 MaxDamage 는 MaxGrit × (0.25 + 추가 공격력 0.1) 인데,
      // 같은 스킬의 DamageConversion 은 0.25 + 추가 공격력 0.0025 다.
      // 추가 공격력 100 이면 전자는 최대 체력의 10 배가 되어 성립하지 않는다.
      // 바로 앞 문장이 쓰는 DamageConversion 쪽을 배율로 삼는다.
      calculation: {
        __type: "GameCalculationModified",
        mModifiedGameCalculation: "MaxGrit",
        mMultiplier: {
          __type: "SpellCalculationSubPart",
          mSpellCalculationKey: "DamageConversion",
        },
      } as unknown as SpellCalculation,
      evidence: "소모한 투지의 @DamageConversion@에 해당하는 고정 피해 … (최대 @f1@의 피해)",
    },
  },
};

export function resolveCalculationOverride(
  spellId: string | undefined,
  calculationName: string,
): SpellCalculation | null {
  if (!spellId) return null;
  const entry = CALCULATION_OVERRIDES[spellId]?.[calculationName];
  return entry ? entry.calculation : null;
}

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
