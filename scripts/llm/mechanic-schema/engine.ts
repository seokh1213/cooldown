/** 챔피언 이름별 분기가 없는 공통 판정·답변기. 생성 모델은 수치와 조건을 결정하지 않는다. */
import { parseRecord } from "./schema";
import type { MechanicRecord, Memory, Result, Rule } from "./types";

function result(text: string, rules: Rule[] = [], status: Result["status"] = "answered"): Result {
  return { text, rules: rules.map(rule => rule.type), status };
}
const find = <T extends Rule["type"]>(record: MechanicRecord, type: T): Extract<Rule, { type: T }> | undefined =>
  record.rules.find(rule => rule.type === type) as Extract<Rule, { type: T }> | undefined;

function conversion(record: MechanicRecord, memory: Memory): Result {
  const rule = find(record, "stat_conversion");
  if (!rule || rule.from !== "bonus_max_health" || rule.to !== "bonus_attack_damage") return result("이 자료에서 체력의 공격력 전환은 확인할 수 없어.", [], "unsupported");
  const rate = `추가 체력 ${rule.inputPerOutput}당 추가 공격력 1로 전환돼.`;
  if (memory.scenario.healthKind === "base" || memory.scenario.healthKind === "growth") {
    return result(`기본 체력과 레벨 성장 체력은 전환되지 않아. ${rate}`, [rule]);
  }
  if (memory.asked === "coefficient") {
    const storage = find(record, "damage_storage");
    const extra = storage ? ` ${storage.capacityBonusADRatio * 100}%는 피해를 체력으로 비축하는 한도에 붙는 추가 공격력 계수야.` : "";
    return result(`${rate}${extra}`, [rule, ...(storage ? [storage] : [])]);
  }
  if (memory.scenario.healthAmount !== null) {
    const amount = memory.scenario.healthAmount;
    const ad = Number((amount / rule.inputPerOutput).toFixed(4));
    return result(`추가 체력 ${amount}이면 추가 공격력 ${ad}으로 전환돼.${rule.replaceInput ? " 그 체력만큼 최대 체력이 늘어나지는 않아." : ""}`, [rule]);
  }
  return result(`${rule.replaceInput ? "아이템 등으로 얻는 추가 체력은 최대 체력에 붙지 않고 추가 공격력으로 바뀌어. " : ""}${rate}`, [rule]);
}

function basicAttack(record: MechanicRecord, memory: Memory): Result {
  const next = find(record, "followup_attack");
  const speed = find(record, "stat_buff");
  if (!next || !speed || speed.stat !== "move_speed") return result("이 공격 후 효과는 아직 구조화한 자료에서 확인할 수 없어.", [], "unsupported");
  if (memory.scenario.followup === "fired") return result("두 번째 공격까지 발사했다면, 두 번째 공격 취소로 얻는 이동 속도 증가는 발동하지 않아.", [next, speed]);
  const benefit = `두 번째 공격을 취소하면 이동 속도가 증가했다가 ${speed.decaySeconds}초에 걸쳐 원래대로 돌아와.`;
  return result(memory.scenario.followup === "cancelled" ? benefit : `평타 뒤에 두 번째 공격이 이어서 나가. ${benefit}`, [next, speed]);
}

function stackProc(record: MechanicRecord, memory: Memory): Result {
  const damage = find(record, "damage_proc");
  const shield = find(record, "shield");
  if (!damage || !shield || damage.threshold !== shield.threshold) return result("이 중첩 효과는 아직 확인할 수 없어.", [], "unsupported");
  const s = memory.scenario;
  const label = { magic: "마법", physical: "물리", true: "고정" }[damage.damageType];
  const condition = `같은 대상에게 기본 공격이나 스킬이 ${damage.threshold}번째로 적중하면 추가 ${label} 피해가 들어가.`;
  const shieldCondition = `보호막은 대상이 챔피언이고${shield.requiresReady ? " 보호막 쿨이 돌아왔을 때" : ""} 생겨.`;
  if (s.target === "minion") return result(`미니언에게는 보호막이 생기지 않아. ${condition} ${shieldCondition}`, [damage, shield]);
  if (s.hits !== null && s.hits < damage.threshold) return result(`처음부터 중첩을 쌓는 상황이라면 ${s.hits}번 적중만으로는 보호막 조건을 충족하지 않아. ${condition} ${shieldCondition}`, [damage, shield]);
  if (s.shieldReady === false && shield.requiresReady) return result(`보호막 쿨이 남아 있으면 보호막은 생기지 않아. ${condition}`, [damage, shield]);
  return result(`${condition} ${shieldCondition}`, [damage, shield]);
}

export function evaluate(recordInput: unknown, memory: Memory, source: { patch: string; sha256: string }): Result {
  let record: MechanicRecord;
  try { record = parseRecord(recordInput); }
  catch { return result("규칙 데이터의 형식을 확인해야 해.", [], "needs_review"); }
  if (record.reviewStatus !== "reviewed" || record.patch !== source.patch || record.source.sha256 !== source.sha256
    || record.champion !== memory.champion || memory.patch !== source.patch || memory.schemaVersion !== 1) {
    return result("현재 자료에 맞는 규칙인지 다시 확인해야 해.", [], "needs_review");
  }
  if (memory.asked === "stun") return record.crowdControl.effects.includes("stun")
    ? result("이 패시브에 기절 효과가 있어.") : result("이 패시브에는 기절 효과가 없어.");
  if (memory.topic === "conversion") return conversion(record, memory);
  if (memory.topic === "basic_attack") return basicAttack(record, memory);
  if (memory.topic === "stack_proc") return stackProc(record, memory);
  if (memory.topic === "recovery") {
    const recovery = find(record, "recovery");
    if (recovery) return result(memory.scenario.visibleToEnemies === true
      ? "적에게 보이는 동안에는 숨었을 때의 비축 체력 회복 조건을 충족하지 않아."
      : "적 챔피언에게 받은 피해를 비축해 두었다면, 적에게 보이지 않을 때 그 체력을 빠르게 회복해.", [recovery]);
  }
  return result("이번에 구조화한 패시브 규칙으로는 확인할 수 없어. 궁금한 스킬이나 조건을 조금 더 알려 줘.", [], "unsupported");
}
