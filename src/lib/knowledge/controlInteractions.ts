/** PC 위키의 유형별 해제·강인함 판정. 패치가 확인된 스킬 메타데이터에만 적용한다. */
import type { CrowdControlType } from "./crowdControl";
export type Cleanser = "cleanse" | "qss" | "mikael";

export const CONTROL_RULE_SOURCES = [
  "https://wiki.leagueoflegends.com/en-us/Types_of_Crowd_Control",
  "https://wiki.leagueoflegends.com/en-us/Crowd_control",
  "https://wiki.leagueoflegends.com/en-us/Quicksilver_Sash",
];
export const CONTROL_RULE_REVIEWED_AT = "2026-10-02";
interface ControlInteraction { cleanse: Partial<Record<Cleanser, boolean>>; tenacity: boolean }
const removable: ControlInteraction = { cleanse: { cleanse: true, qss: true, mikael: true }, tenacity: true };
const airborne: ControlInteraction = { cleanse: { cleanse: false, qss: false, mikael: false }, tenacity: false };
export const CONTROL_INTERACTIONS: Partial<Record<CrowdControlType, ControlInteraction>> = {
  stun: removable, root: removable, fear: removable, charm: removable, taunt: removable,
  silence: removable, slow: removable, sleep: removable, polymorph: removable, suspension: removable,
  berserk: removable, cripple: removable,
  blind: { cleanse: { cleanse: true, qss: true, mikael: false }, tenacity: true },
  disarm: { cleanse: { cleanse: true, qss: true, mikael: false }, tenacity: true },
  drowsy: { ...removable, tenacity: false },
  knockup: airborne, knockback: airborne, pull: airborne,
  suppression: { cleanse: { cleanse: false, qss: true, mikael: false }, tenacity: false },
  stasis: airborne,
  nearsight: { cleanse: { cleanse: false, qss: true, mikael: false }, tenacity: false },
  // 고정·행동 가능한 끌림·즉시 판정은 지속 영역/발동 조건을 확인해야 한다. 해제 가능이라고 일반화하지 않는다.
};
