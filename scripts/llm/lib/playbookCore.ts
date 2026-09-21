/**
 * 플레이북 선택과 서술 (브라우저에서도 쓴다)
 *
 * 파일을 읽는 부분은 `playbook.ts` 에 남기고, 조건 판정과 문장 조립만 여기 둔다.
 * 브라우저 상성 코치가 같은 규칙으로 지식 카드를 고르게 하려면 이 코드가 fs 를 몰라야 한다.
 */
import type { ChampionCard } from "./facts";

export interface PlaybookCondition {
  /** 상대 주 피해 유형 */
  enemyDamage?: Array<"물리" | "마법" | "혼합">;
  /** 상대 계수 프로필 */
  enemyScaling?: Array<"AP" | "AD" | "혼합" | "체력" | "없음">;
  /** 상대 사거리 유형 */
  enemyRange?: Array<"근접" | "원거리">;
  /** 상대가 이 효과를 보유해야 함 (facts.ts 의 효과 태그) */
  enemyHasEffects?: string[];
  /** 상대가 이 효과를 갖고 있지 않아야 함 */
  enemyLacksEffects?: string[];
  /** 상대 역할 태그 중 하나 이상 */
  enemyRoles?: string[];
  /** 특정 상대 한정 */
  enemyIds?: string[];
  lanes?: string[];
}

/**
 * 본문에서 언급한 게임 내 고유명사를 구조화해 적는다.
 * 자유 텍스트에서 이름을 추출하는 방식은 오탐이 많아, 작성자가 명시하고 검증기가 데이터와 대조한다.
 */
export interface PlaybookRefs {
  items?: string[];
  runes?: string[];
  summoners?: string[];
}

export interface PlaybookEntry {
  id?: string;
  /** rune | summoner | start-item | first-item | core-item | situational-item | escape-window | combo | phase | laning | teamfight | skill */
  category: string;
  /**
   * 본문.
   *
   * `generated` 가 있으면 비워 둔다. 빌드할 때 카드에서 도출해 채우므로, 손으로
   * 적어 두면 두 벌이 생겨 어느 쪽이 참인지 알 수 없게 된다.
   */
  text: string;
  /**
   * 본문을 카드에서 도출해 만든다는 표시.
   *
   * 사람이 쓴 문장은 카드와 대조할 수 없다. 기계적인 대목은 자료에서 도출해
   * 렌더하고(`claims.ts`), 사람은 도출할 수 없는 판단만 `nuance` 에 적는다.
   */
  generated?: "situational-item" | "escape-window" | "stack-tempo";
  /** 도출로는 나오지 않는 한 문장. 생성된 본문 뒤에 붙는다. */
  nuance?: string;
  when?: PlaybookCondition;
  /** 본문이 권장하는 이름 */
  refs?: PlaybookRefs;
  /** 본문이 비교 대상으로만 언급하거나 피하라고 한 이름 (권장안에서 제외) */
  avoid?: PlaybookRefs;
  source?: string;
  verifiedPatch?: string;
}

export interface Playbook {
  champion: string;
  /** 이 챔피언을 플레이할 때의 지식 */
  playing: PlaybookEntry[];
  /** 이 챔피언을 상대할 때의 지식 (상대편 플레이북에서 가져다 쓴다) */
  against: PlaybookEntry[];
}

function matches(cond: PlaybookCondition | undefined, enemy: ChampionCard, lane?: string): boolean {
  if (!cond) return true;
  if (cond.lanes && lane && !cond.lanes.includes(lane)) return false;
  if (cond.lanes && !lane) return false;
  if (cond.enemyIds && !cond.enemyIds.includes(enemy.id)) return false;
  if (cond.enemyDamage && !cond.enemyDamage.includes(enemy.damageProfile.primary)) return false;
  if (cond.enemyScaling && !cond.enemyScaling.includes(enemy.scalingProfile.primary)) return false;
  if (cond.enemyRange && !cond.enemyRange.includes(enemy.rangeType)) return false;
  if (cond.enemyRoles && !cond.enemyRoles.some((r) => enemy.roleTags.includes(r))) return false;
  if (cond.enemyHasEffects && !cond.enemyHasEffects.every((e) => enemy.mechanics.includes(e))) return false;
  if (cond.enemyLacksEffects && cond.enemyLacksEffects.some((e) => enemy.mechanics.includes(e))) return false;
  return true;
}

export interface SelectedPlaybook {
  /** 내 챔피언을 플레이할 때 적용되는 항목 */
  mine: PlaybookEntry[];
  /** 상대 챔피언을 상대할 때 적용되는 항목 */
  vsEnemy: PlaybookEntry[];
}

export function selectPlaybook(
  playbooks: Map<string, Playbook>,
  me: ChampionCard,
  enemy: ChampionCard,
  lane?: string,
): SelectedPlaybook {
  const mineBook = playbooks.get(me.id);
  const enemyBook = playbooks.get(enemy.id);
  const rank = (e: PlaybookEntry) => (e.when?.enemyIds ? 0 : e.when ? 1 : 2);
  const mine = (mineBook?.playing ?? [])
    .filter((e) => matches(e.when, enemy, lane))
    .sort((a, b) => rank(a) - rank(b));
  // 상대 플레이북의 against 는 "이 챔피언을 상대하는 법" 이므로 조건 판정 대상은 내 챔피언이다
  const vsEnemy = (enemyBook?.against ?? [])
    .filter((e) => matches(e.when, me, lane))
    .sort((a, b) => rank(a) - rank(b));
  return { mine, vsEnemy };
}

const CATEGORY_LABEL: Record<string, string> = {
  rune: "룬",
  summoner: "소환사 주문",
  "start-item": "시작 아이템",
  "first-item": "첫 아이템",
  "core-item": "코어 아이템",
  "situational-item": "상황별 아이템",
  "escape-window": "이동 수단과 공백",
  combo: "콤보",
  phase: "힘의 구간",
  laning: "라인전",
  teamfight: "한타",
  skill: "스킬 운용",
};

export function playbookToText(
  selected: SelectedPlaybook,
  meName: string,
  enemyName: string,
  currentPatch?: string,
): string {
  const fmt = (entries: PlaybookEntry[]) => {
    if (entries.length === 0) return "  (등록된 항목 없음)";
    return entries
      .map((e) => {
        const label = CATEGORY_LABEL[e.category] ?? e.category;
        const scope = e.when?.enemyIds ? " · 이 상대 한정" : e.when ? " · 조건 일치" : "";
        const stale =
          e.verifiedPatch && currentPatch && e.verifiedPatch !== currentPatch
            ? ` · ${e.verifiedPatch} 기준이라 변동 가능`
            : "";
        return `  - [${label}${scope}${stale}] ${e.text}`;
      })
      .join("\n");
  };
  return [`${meName} 플레이 지식:`, fmt(selected.mine), `${enemyName} 상대 지식:`, fmt(selected.vsEnemy)].join("\n");
}
