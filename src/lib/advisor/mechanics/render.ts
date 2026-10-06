/** 텍스트 조건을 게임 엔진으로 실행하지 않는다. 확인된 조건과 단일 비율만 적용한다. */
import type { AbilityJob, Condition, Effect, Rule } from "./types";
import { correctedQuestion, questionState, type QuestionState } from "./question";
const labels: Record<string, string> = { champion: "챔피언", minion: "미니언", monster: "몬스터", structure: "구조물",
  ready: "사용 가능", down: "재사용 대기 중", base: "기본", bonus: "추가", total: "전체", cancelled: "취소", fired: "발사",
  first: "첫 번째", empowered: "강화", unseen: "보이지 않음", visible: "보임", any: "모든 유닛" };
const stats: Record<string, string> = { bonusHealth: "추가 체력", maxHealth: "최대 체력", bonusAttackDamage: "추가 공격력", abilityPower: "주문력", totalAttackDamage: "공격력", bonusAttackSpeed: "추가 공격 속도" };
function conditionText(condition: Condition, job: AbilityJob): string {
  const predicate = condition.value;
  if (condition.field === "activation" && predicate.kind === "boolean") return predicate.value ? "활성화 상태" : "비활성화 상태";
  const value = predicate.kind === "number_ref" ? String(job.numbers.find(n => n.id === predicate.ref)?.value ?? "")
    : predicate.kind === "boolean" ? String(predicate.value) : predicate.value;
  const readable = labels[value] ?? value;
  if (condition.field === "target_type") return `대상 ${condition.operator === "neq" ? "제외" : "종류"}: ${readable}`;
  if (condition.field === "hit_count") {
    const operators = { eq: "", neq: " 제외", lt: " 미만", lte: " 이하", gt: " 초과", gte: " 이상", present: "", absent: " 없음" };
    return `${readable}회${operators[condition.operator]} 적중`;
  }
  if (condition.field === "shield_ready") return `보호막 ${readable}`;
  if (condition.field === "followup_status") return `추가 공격 ${readable}`;
  if (condition.field === "stat_scope") return `${readable} 능력치`;
  return readable;
}
function scalar(effect: Effect, role: string, job: AbilityJob): number | undefined {
  const parameter = effect.parameters.find(p => p.role === role && p.shape === "scalar" && p.numberRefs.length === 1);
  const number = parameter && job.numbers.find(n => n.id === parameter.numberRefs[0]);
  return number && !number.percent ? number.value : undefined;
}
function conversionText(effect: Effect, job: AbilityJob, question: string, state: QuestionState): string[] {
  const input = scalar(effect, "ratio_input", job), output = scalar(effect, "ratio_output", job);
  const from = effect.statFrom && stats[effect.statFrom], to = effect.statTo && stats[effect.statTo];
  if (!input || output === undefined || !from || !to) return [];
  if (effect.statFrom === "bonusHealth" && /기본\s*체력|성장\s*체력|레벨업.*체력/.test(correctedQuestion(question))) {
    return ["기본·성장 체력은 이 추가 체력 전환에 포함되지 않습니다."];
  }
  const amount = state.amount;
  if (amount && amount.stat !== effect.statFrom) return [];
  const result = amount && amount.value * amount.count * output / input;
  if (result !== undefined && !Number.isFinite(result)) return ["계산할 수 있는 범위를 넘었습니다. 더 작은 수치를 알려 주세요."];
  return [amount ? `${from} ${amount.value * amount.count}${amount.count > 1 ? ` (${amount.value} × ${amount.count}개)` : ""}이면 ${to} ${Number(result!.toFixed(3))}입니다.` : undefined,
    `${from} ${input}당 ${to} ${output}입니다.`].filter((line): line is string => Boolean(line));
}
function excludedCondition(rule: Rule, job: AbilityJob, state: QuestionState): string | undefined {
  if (rule.trigger.event === "followup_attack" && state.followupStatus === "cancelled") {
    return "추가 공격을 취소하면 해당 추가 공격의 적중 효과는 발생하지 않습니다.";
  }
  for (const condition of rule.conditions) {
    const value = condition.value;
    if (condition.field === "visibility" && value.kind === "enum" && state.visibility && condition.operator === "eq" && state.visibility !== value.value) {
      return "적에게 보이는 동안에는 보이지 않아야 하는 회복 조건을 충족하지 않아 회복하지 않습니다.";
    }
    if (condition.field === "target_type" && value.kind === "enum" && value.value !== "any" && state.targetType
      && (condition.operator === "eq" && state.targetType !== value.value || condition.operator === "neq" && state.targetType === value.value)) {
      return `${labels[state.targetType]}${state.targetType === "monster" ? "는" : "은"} 이 효과의 ${labels[value.value] ?? value.value} 대상 조건에 해당하지 않습니다.`;
    }
    if (condition.field === "followup_status" && value.kind === "enum" && value.value === "cancelled") {
      if (state.firstCancelled) return "첫 평타 발사 전 취소는 추가 공격 취소 조건에 해당하지 않습니다.";
      if (state.followupStatus === "fired") return "추가 공격까지 발사하면 취소 조건에 해당하지 않습니다.";
    }
    if (condition.field === "shield_ready" && value.kind === "enum" && value.value === "ready" && state.shieldReady === "down") {
      return "보호막 재사용 대기시간이 남아 있으면 이 보호막의 사용 가능 조건에 해당하지 않습니다.";
    }
    if (condition.field === "spell_ready" && value.kind === "enum" && value.value === "ready" && state.shieldReady === "down") {
      return "스킬이 재사용 대기 중이면 이 효과의 사용 가능 조건을 충족하지 않습니다.";
    }
    if (condition.field === "hit_count" && value.kind === "number_ref" && state.hitCount !== undefined) {
      const required = job.numbers.find(n => n.id === value.ref)?.value;
      if (required !== undefined && ["eq", "gte"].includes(condition.operator) && state.hitCount < required) {
        return `${state.hitCount}회 적중은 이 효과의 ${required}회 적중 조건에 해당하지 않습니다.`;
      }
    }
  }
  return undefined;
}
function parameterDetails(effect: Effect, job: AbilityJob): string[] {
  const names: Record<string, string> = { count: "횟수/중첩", duration_seconds: "지속 시간", cooldown_seconds: "재사용 대기시간", damage_multiplier: "피해 비율", stat_coefficient: "계수" };
  return effect.parameters.flatMap(parameter => {
    if (parameter.shape === "formula_components") {
      return parameter.numberRefs.flatMap(ref => {
        const number = job.numbers.find(entry => entry.id === ref);
        return number?.percent && parameter.stat ? [`${stats[parameter.stat] ?? parameter.stat} 계수: ${number.value}%.`] : [];
      });
    }
    const name = parameter.role === "amount" && effect.kind === "resource_change" ? "중첩/자원 획득량"
      : parameter.role === "amount" && effect.kind === "cooldown_change" ? "재사용 대기시간 변화량" : names[parameter.role];
    if (!name || !["scalar", "rank_values", "level_range"].includes(parameter.shape)) return [];
    const numbers = parameter.numberRefs.map(ref => job.numbers.find(n => n.id === ref));
    if (!numbers.length || numbers.some(n => !n) || numbers.some(n => n!.percent)
      && !["damage_multiplier", "stat_coefficient"].includes(parameter.role) && !(parameter.role === "amount" && effect.kind === "cooldown_change")) return [];
    const values = numbers.map(n => n!.value);
    if (values.every(value => new RegExp(`(?<![\\d.])${value}(?![\\d.])`).test(effect.text))) return [];
    const value = numbers.map(n => `${n!.value}${n!.percent ? "%" : ""}`).join(parameter.shape === "level_range" ? "~" : "/");
    return [`${name}${parameter.stat ? ` (${stats[parameter.stat] ?? parameter.stat})` : ""}: ${value}${parameter.role.endsWith("seconds") ? "초" : ""}${parameter.shape === "level_range" ? " (레벨에 따라)" : ""}.`];
  });
}
export function renderRules(job: AbilityJob, rules: Rule[], question: string, state = questionState(question)): string {
  if (state.invalidAmount && !/\d\s*(?:%|퍼센트|프로)/.test(question)
    && rules.some(rule => rule.effects.some(effect => effect.kind === "stat_conversion"))) {
    return "계산할 수치를 하나로 알려 주세요. 예: ‘추가 체력 70짜리 템 2개’ 또는 ‘주문력 100’.";
  }
  const lines = rules.map(rule => {
    const conditions = rule.conditions.map(c => conditionText(c, job)).filter(Boolean);
    const phase = rule.trigger.event === "cast" ? "시전 시" : rule.trigger.subject === "secondary_targets" ? "충돌한 대상" : rule.trigger.event === "takedown" ? "처치 관여 시" : rule.trigger.event === "ability_hit" ? "스킬 적중 시" : rule.trigger.event === "kill" ? "처치 시" : undefined;
    const header = [phase, ...conditions].filter(Boolean).join(" · ");
    const excluded = excludedCondition(rule, job, state);
    if (excluded) return [excluded, header ? `발동 조건: ${header}.` : undefined].filter(Boolean).join("\n");
    const effects = rule.effects.flatMap(effect => [effect.text, ...parameterDetails(effect, job),
      ...(effect.kind === "stat_conversion" ? conversionText(effect, job, question, state) : [])]);
    return [header ? `${header}:` : undefined, ...effects].filter(Boolean).join("\n");
  });
  return [...new Set(lines)].join("\n\n");
}
