/** 툴팁의 기존 태그로 만드는 보수적 기본값. 위키 보정이 있으면 그 값을 사용한다. */
import type { CrowdControlType, SpellCrowdControl } from "./crowdControl";

const TAG_TYPES: Record<string, CrowdControlType> = {
  "둔화": "slow", "기절": "stun", "속박": "root", "에어본": "knockup", "침묵": "silence",
  "매혹": "charm", "공포": "fear", "억제": "suppression", "도발": "taunt",
};
export function inferCrowdControl(effects: string[], text: string): SpellCrowdControl {
  const types = new Set(effects.map(tag => TAG_TYPES[tag]).filter(Boolean));
  if (effects.includes("강제 이동(넉백/끌기)")) {
    types.add(/끌어당|당깁|끌고|끌려|끌어옵/.test(text) ? "pull" : "knockback");
  }
  return { status: "inferred", effects: [...types].map(type => ({ type, target: "enemy", source: "tooltip" })) };
}
