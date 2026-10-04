/** 실험 v1 계약. 숫자 비율은 배수(800%=8), null은 이번 질문에 명시되지 않음을 뜻한다. */
export const STATS = ["bonus_max_health", "bonus_attack_damage", "move_speed"] as const;
export type Stat = typeof STATS[number];
export type Rule =
  | { type: "stat_conversion"; from: Stat; to: Stat; inputPerOutput: number; replaceInput: boolean }
  | { type: "followup_attack"; trigger: "basic_attack"; attack: "followup" }
  | { type: "stat_buff"; trigger: "cancel_followup"; stat: Stat; decaySeconds: number }
  | { type: "damage_proc"; trigger: "stack_threshold"; scope: "same_target"; threshold: number; damageType: "magic" | "physical" | "true" }
  | { type: "shield"; trigger: "stack_threshold"; scope: "same_target"; threshold: number; target: "champion"; requiresReady: boolean }
  | { type: "damage_storage"; damageSource: "enemy_champion"; resource: "grey_health"; capacityBonusADRatio: number }
  | { type: "recovery"; condition: "unseen_by_enemies"; resource: "grey_health" };
export interface RulePayload { rules: Rule[] }
export interface MechanicRecord extends RulePayload {
  schemaVersion: 1;
  patch: string;
  champion: string;
  slot: "P";
  coverage: "partial";
  reviewStatus: "candidate" | "reviewed";
  crowdControl: { status: "known"; effects: string[] };
  source: { file: string; sha256: string; text: string; urls: string[] };
}
export const TOPICS = ["conversion", "basic_attack", "stack_proc", "recovery", "unsupported", "inherit"] as const;
export const ASKS = ["overview", "movement_speed", "shield", "damage", "converted_attack_damage", "both_stats", "coefficient", "stun", "inherit"] as const;
export interface Scenario {
  healthAmount: number | null;
  healthKind: "bonus" | "base" | "growth" | null;
  followup: "cancelled" | "fired" | null;
  hits: number | null;
  target: "champion" | "minion" | null;
  shieldReady: boolean | null;
  visibleToEnemies: boolean | null;
}
export interface Query { topic: typeof TOPICS[number]; asked: typeof ASKS[number]; scenario: Scenario }
export interface Memory extends Query { champion: string; schemaVersion: 1; patch: string }
export interface Result { status: "answered" | "clarify" | "unsupported" | "needs_review"; text: string; rules: string[] }
export const emptyScenario = (): Scenario => ({ healthAmount: null, healthKind: null, followup: null, hits: null,
  target: null, shieldReady: null, visibleToEnemies: null });

/** 규칙 내용 비교. 배열 순서나 키 순서는 의미를 가지지 않는다. */
export function ruleSignature(rule: Rule): string {
  return JSON.stringify(Object.fromEntries(Object.entries(rule).sort(([a], [b]) => a.localeCompare(b))));
}
