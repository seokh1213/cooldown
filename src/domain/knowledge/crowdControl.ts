/** CC의 이름, 행동 제한, 강타 판정은 별개다. hard는 이 프로젝트의 이동 불가/강제 행동 기준이다. */
import type { Language } from "@/shared/i18n";

export type CrowdControlType = "stun" | "root" | "knockup" | "knockback" | "pull" | "fear" | "charm"
  | "taunt" | "silence" | "slow" | "suppression" | "stasis" | "sleep" | "drowsy" | "polymorph"
  | "blind" | "nearsight" | "ground" | "cripple" | "berserk" | "suspension" | "knockdown"
  | "disarm" | "disrupt" | "kinematics";
export interface CrowdControlEffect {
  type: CrowdControlType;
  target: "enemy" | "self" | "ally" | "all" | "nonChampion";
  /** 조건은 원자료에 있는 문장만 쓴다. 수치/지속시간은 기존 스킬 자료가 담당한다. */
  condition?: string;
  source: string;
}
export interface SpellCrowdControl {
  /** borrowed는 훔친 스킬에 따라 달라지므로 빈 effects를 CC 없음으로 해석하지 않는다. */
  status: "known" | "borrowed" | "inferred";
  effects: CrowdControlEffect[];
}
interface ControlDefinition {
  labels: [string, string, string];
  class: "hard" | "soft" | "instant";
  immobilizes: boolean;
  blocksSmite: boolean;
}
const define = (labels: ControlDefinition["labels"], kind: ControlDefinition["class"], immobilizes = false, blocksSmite = false): ControlDefinition =>
  ({ labels, class: kind, immobilizes, blocksSmite });
export const CROWD_CONTROL: Record<CrowdControlType, ControlDefinition> = {
  stun: define(["기절", "Stun", "眩晕"], "hard", true),
  root: define(["속박", "Root", "禁锢"], "hard", true),
  knockup: define(["에어본(띄우기)", "Airborne (knockup)", "击飞"], "hard", true),
  knockback: define(["에어본(밀치기)", "Airborne (knockback)", "击退"], "hard", true),
  pull: define(["에어본(당기기)", "Airborne (pull)", "拉拽"], "hard", true),
  fear: define(["공포", "Fear", "恐惧"], "hard", true),
  charm: define(["매혹", "Charm", "魅惑"], "hard", true),
  taunt: define(["도발", "Taunt", "嘲讽"], "hard", true),
  silence: define(["침묵", "Silence", "沉默"], "soft"),
  slow: define(["일반 둔화", "Slow", "减速"], "soft"),
  suppression: define(["제압", "Suppression", "压制"], "hard", true, true),
  stasis: define(["정지", "Stasis", "凝滞"], "hard", true, true),
  sleep: define(["수면", "Sleep", "睡眠"], "hard", true),
  drowsy: define(["졸음", "Drowsy", "困倦"], "soft"),
  polymorph: define(["변이", "Polymorph", "变形"], "soft"),
  blind: define(["실명", "Blind", "致盲"], "soft"),
  nearsight: define(["시야 축소", "Nearsight", "视野缩小"], "soft"),
  ground: define(["고정(이동기 제한)", "Ground", "缚地"], "soft"),
  cripple: define(["공격 속도 감소", "Cripple", "攻速降低"], "soft"),
  berserk: define(["광란", "Berserk", "狂暴"], "hard", true),
  suspension: define(["공중 정지(기절 판정)", "Suspension (stun)", "悬浮"], "hard", true),
  knockdown: define(["돌진 중단", "Knockdown", "击落"], "instant"),
  disarm: define(["무장 해제", "Disarm", "缴械"], "soft"),
  disrupt: define(["정신 집중 중단", "Disrupt", "打断引导"], "instant"),
  kinematics: define(["끌림(행동 가능)", "Kinematics", "牵引（可行动）"], "soft"),
};
const localeIndex = (lang: Language) => lang === "en_US" ? 1 : lang === "zh_CN" ? 2 : 0;
export const controlLabel = (type: CrowdControlType, lang: Language) => CROWD_CONTROL[type].labels[localeIndex(lang)];
export const controlHeading = (lang: Language) => ["군중 제어", "Crowd control", "控制效果"][localeIndex(lang)];
export function controlText(control: SpellCrowdControl, lang: Language): string {
  const i = localeIndex(lang);
  if (!control.effects.length) return control.status === "borrowed"
    ? ["복사·지배·반사한 스킬에 따라 달라집니다", "Depends on the copied, possessed or reflected ability", "取决于复制、附身或反弹的技能"][i]
    : control.status === "inferred" ? ["툴팁에서 확인되는 CC 없음", "No CC identified in the tooltip", "技能文本未发现控制效果"][i]
    : ["CC 없음(기절·속박·둔화 없음)", "No crowd control, including stun, root or slow", "无控制效果，没有眩晕、禁锢或减速"][i];
  const descriptions = control.effects.map(effect => {
    const definition = CROWD_CONTROL[effect.type];
    const kind = { hard: ["하드", "Hard", "硬控"], soft: ["소프트", "Soft", "软控"], instant: ["즉시 판정", "Instant", "即时"] }[definition.class][i];
    const target = { enemy: "", self: [" · 자신", " · self", " · 自身"][i], ally: [" · 아군", " · ally", " · 友军"][i], all: [" · 적·아군", " · enemies/allies", " · 敌我双方"][i], nonChampion: [" · 챔피언 제외", " · non-champions", " · 非英雄"][i] }[effect.target];
    const condition = effect.condition ? ` · ${i === 0 ? effect.condition : i === 1 ? "conditional" : "有条件"}` : "";
    return `${controlLabel(effect.type, lang)} (${kind}${target}${condition})`;
  }).join(" · ");
  return control.status === "inferred" ? `${["툴팁 추정", "Tooltip inference", "技能文本推断"][i]}: ${descriptions}` : descriptions;
}
