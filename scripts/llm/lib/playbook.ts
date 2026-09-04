/**
 * 챔피언 지식 카드(플레이북) 로더
 *
 * `knowledge/playbooks/<ChampionId>.json` — 챔피언 하나당 한 파일.
 * 데이터로 계산할 수 없는 것만 담는다: 콤보, 힘의 구간, 조건부 룬/주문/아이템, 스킬 운용.
 * 상성별로 쓰지 않고 **챔피언 단위**로 쓰되, 조건(`when`)을 상대 카드로 코드가 판정한다.
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./facts";

/** 조건: 상대 카드의 파생 사실로 판정 가능한 것만 허용한다 */
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
  /** rune | summoner | start-item | first-item | core-item | situational-item | combo | phase | laning | teamfight | skill */
  category: string;
  text: string;
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

export const PLAYBOOK_ROOT = path.resolve(process.cwd(), "knowledge", "playbooks");

export function loadPlaybooks(root = PLAYBOOK_ROOT): Map<string, Playbook> {
  const map = new Map<string, Playbook>();
  if (!fs.existsSync(root)) return map;
  for (const file of fs.readdirSync(root).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as Playbook;
    map.set(parsed.champion, {
      champion: parsed.champion,
      playing: parsed.playing ?? [],
      against: parsed.against ?? [],
    });
  }
  return map;
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
