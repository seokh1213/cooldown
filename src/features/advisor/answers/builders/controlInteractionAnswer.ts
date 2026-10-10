/** 검토한 CC 유형 규칙을 현재 스킬의 실제 효과와 결합한다. 피해·후속 시전 취소는 추정하지 않는다. */
import { controlLabel, type CrowdControlEffect, type SpellCrowdControl } from "@/domain/knowledge/combat/crowdControl";
import { CONTROL_INTERACTIONS } from "@/domain/knowledge/combat/controlInteractions";
import { askedCleansers, type ControlQuery, type Cleanser } from "../../understanding/spells/crowdControlQuestion";
import type { PlanContext } from "../../contracts/planTypes";

const index = (lang: PlanContext["lang"]) => lang === "ko_KR" ? 0 : lang === "en_US" ? 1 : 2;
const cleanserLabel = (method: Cleanser, lang: PlanContext["lang"]) => ({
  cleanse: ["정화", "Cleanse", "净化"], qss: ["수은", "QSS", "水银"], mikael: ["미카엘", "Mikael's Blessing", "米凯尔"],
}[method][index(lang)]);

function effectLabel(effect: CrowdControlEffect, lang: PlanContext["lang"]): string {
  const condition = effect.condition && lang === "ko_KR" ? ` (${effect.condition})` : "";
  return controlLabel(effect.type, lang) + condition;
}

function removalLine(effect: CrowdControlEffect, methods: Cleanser[], lang: PlanContext["lang"]): string {
  const i = index(lang);
  const properties = CONTROL_INTERACTIONS[effect.type];
  return methods.map(method => {
    const supported = properties?.cleanse[method];
    const verdict = supported === true ? ["해제할 수 있습니다", "can remove it", "可以解除"]
      : supported === false ? ["해제할 수 없습니다", "cannot remove it", "不能解除"]
      : ["해제 여부를 확인한 자료가 부족합니다", "removal is not verified", "解除规则尚未确认"];
    return `${cleanserLabel(method, lang)}: ${verdict[i]}`;
  }).join(" · ");
}

export function controlInteractionAnswer(control: SpellCrowdControl | undefined, query: ControlQuery, question: string, lang: PlanContext["lang"]): string {
  const i = index(lang);
  if (!control || control.status !== "known") return [
    "복사·반사 또는 확인되지 않은 효과여서 이 판정을 확정할 수 없습니다. 실제로 적용된 스킬을 알려주세요.",
    "This effect is copied, reflected or unverified. Specify the actual ability before applying a CC rule.",
    "此效果来自复制、反弹或尚未确认，请先说明实际生效的技能。",
  ][i];
  if (!control.effects.length) return ["확인된 자료상 CC 없음입니다. 피해 자체는 CC 해제로 없애지 않습니다.",
    "No CC is recorded. Cleansing does not remove the damage itself.", "资料未记录控制效果，解除控制不会消除伤害本身。"][i];
  const effects = control.effects.filter(effect => effect.target === "enemy" || effect.target === "all");
  if (!effects.length) return ["자신·아군 또는 챔피언이 아닌 대상의 효과입니다. 적에게 걸린 CC 해제 규칙으로 답할 수 없습니다.",
    "These effects apply to self, allies or non-champions. Enemy CC removal rules do not establish this interaction.",
    "这些效果作用于自身、友军或非英雄，不能套用敌方控制的解除规则。"][i];
  if (query === "sequence") {
    if (effects.some(effect => effect.type === "drowsy") && effects.some(effect => effect.type === "sleep")) return [
      "졸음이 먼저 적용되고, 졸음이 끝나면 수면으로 넘어갑니다. 졸음 약화 효과 자체를 해제하면 뒤따르는 수면을 막을 수 있습니다. 둔화만 제거하는 효과와는 구분해야 합니다.",
      "Drowsy occurs first, followed by sleep when drowsy ends. Removing the drowsy debuff prevents the later sleep; removing only its slow does not.",
      "先进入困倦，结束后进入睡眠。解除困倦本身能阻止后续睡眠；只移除减速则不能。",
    ][i];
    return ["CC 종류는 확인했지만 정확한 적용 순서는 확인한 자료가 부족합니다. 종류의 나열을 발동 순서로 해석할 수는 없습니다.",
      "The CC types are recorded, but their exact application order is not verified. A list is not a timeline.",
      "已记录控制类型，但具体生效顺序尚未确认；类型列表不代表时间顺序。",
    ][i] + `\n${effects.map(effect => effectLabel(effect, lang)).join(" · ")}`;
  }
  if (query === "tenacity") return effects.map(effect => {
    const value = CONTROL_INTERACTIONS[effect.type]?.tenacity;
    const verdict = value === true ? ["강인함으로 지속시간을 줄일 수 있습니다", "Tenacity reduces its duration", "韧性可以缩短持续时间"]
      : value === false ? ["강인함으로 이 단계의 지속시간을 줄이지 못합니다", "Tenacity does not reduce this phase", "韧性不能缩短此阶段"]
      : ["강인함 적용 여부를 확인한 자료가 부족합니다", "Tenacity interaction is not verified", "韧性规则尚未确认"];
    return `${effectLabel(effect, lang)}: ${verdict[i]}`;
  }).join("\n");
  const methods = askedCleansers(question);
  if (!methods.length) return ["어떤 해제 수단인지 알려주세요. 예: ‘정화로 풀려?’ 또는 ‘수은으로 풀려?’",
    "Which removal effect do you mean: Cleanse, QSS or Mikael's Blessing?",
    "你指的是哪种解除手段：净化、水银，还是米凯尔？"][i];
  const lines = effects.map(effect => `${effectLabel(effect, lang)} — ${removalLine(effect, methods, lang)}`);
  if (methods.includes("qss") && effects.some(effect => ["knockup", "knockback", "pull"].includes(effect.type))) lines.push([
    "에어본 중에는 수은을 사용할 수도 없습니다. 동반 기절이 해제 대상이어도 강제 이동까지 제거되지는 않습니다.",
    "QSS is also disabled while airborne. A removable accompanying stun does not make the displacement removable.",
    "击飞期间也不能使用水银；即使伴随的眩晕可解除，强制位移也不会因此消失。",
  ][i]);
  if (methods.includes("mikael")) lines.push(["미카엘은 시전자가 아이템을 사용할 수 있고 대상·사거리 조건을 만족해야 합니다.",
    "Mikael's caster must be able to activate items and meet target and range requirements.", "米凯尔的施放者仍须能够使用装备，并满足目标和距离条件。"][i]);
  if (effects.some(effect => effect.type === "drowsy")) lines.push([
    "정화·수은·미카엘로 졸음 자체를 해제하면 뒤따르는 수면을 막을 수 있습니다. 둔화만 없애는 효과와는 다릅니다.",
    "Cleanse, QSS and Mikael can remove drowsy itself to prevent later sleep. Removing only its slow is different.",
    "净化、水银、米凯尔解除困倦本身后可阻止后续睡眠；这与只移除减速不同。",
  ][i]);
  lines.push(["CC 해제와 스킬의 피해·표식·후속 효과 제거는 별개의 판정입니다.",
    "CC removal and removal of damage, marks or later effects are separate interactions.", "解除控制与消除伤害、标记或后续效果是不同的规则。"][i]);
  return lines.join("\n");
}

/** 피해 잔류·행동 제한처럼 유형 표만으로 설명하지 못하는 기존 검토 노트를 덧붙인다. */
export function controlRuleAddenda(control: SpellCrowdControl | undefined, question: string, ctx: Pick<PlanContext, "data" | "lang">): string {
  if (control?.status !== "known") return "";
  const methods = askedCleansers(question);
  const ids: string[] = [];
  if (control.effects.some(effect => effect.type === "suppression")) {
    ids.push(...methods.filter(method => method !== "mikael").map(method => `${method}-suppression`));
  }
  if (methods.includes("qss") && control.effects.some(effect => effect.type === "stasis")) ids.push("qss-stasis");
  return ids.flatMap(id => {
    const note = ctx.data?.mechanics.find(section => section.id === id);
    return note ? [ctx.lang === "ko_KR" ? note.text : note.localized?.[ctx.lang]?.text ?? note.text] : [];
  }).join("\n");
}
