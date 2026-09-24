/**
 * 플레이북 선택과 서술 (브라우저에서도 쓴다)
 *
 * 파일을 읽는 부분은 `playbook.ts` 에 남기고, 조건 판정과 문장 조립만 여기 둔다.
 * 브라우저 상성 코치가 같은 규칙으로 지식 카드를 고르게 하려면 이 코드가 fs 를 몰라야 한다.
 */
import type { ChampionCard } from "./facts";
import { hasFinalConsonant, josa } from "./text";

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

/**
 * 상대편 챔피언의 스킬을 채워 넣는 고리.
 *
 * 노트는 한 챔피언만 보고 쓴다. "응수가 살아 있는 동안에는 이동 불가 스킬을 함부로 쓰지
 * 말라" 까지는 쓸 수 있지만 **내 어느 스킬이 그것인지**는 상대를 알아야 한다. 조합이
 * 삼만 쌍이라 손으로 쓸 수 없다. 그래서 노트에는 효과 태그와 문형만 적고, 고를 때 상대편
 * 카드에서 그 효과를 가진 스킬을 찾아 문장을 짓는다. 해당 스킬이 없으면 문장을 붙이지 않는다.
 *
 * 상대편은 `playing` 노트면 상대 챔피언, `against` 노트면 사용자 챔피언이다.
 *
 * 문형의 자리: `{name}` 상대편 이름, `{spells}` 해당 스킬("E 반격"). 조사는 `{name:라면}`,
 * `{spells:을/를}` 처럼 붙이면 받침에 맞춘다.
 */
export interface PlaybookHook {
  effects: string[];
  text: string;
  /** 이 꼴의 문장 바로 뒤에 붙인다. 없으면 본문 끝. 코드가 다는 고리만 쓴다(데이터에는 없다). */
  after?: RegExp;
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
  hooks?: PlaybookHook[];
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
    .sort((a, b) => rank(a) - rank(b))
    .map((e) => withHooks(e, enemy, "playing"));
  // 상대 플레이북의 against 는 "이 챔피언을 상대하는 법" 이므로 조건 판정 대상은 내 챔피언이다
  const vsEnemy = (enemyBook?.against ?? [])
    .filter((e) => matches(e.when, me, lane))
    .sort((a, b) => rank(a) - rank(b))
    .map((e) => withHooks(e, me, "against"));
  return { mine, vsEnemy };
}

type JosaPair = Parameters<typeof josa>[1];

/** 상대를 제자리에 묶는 효과. 둔화는 넣지 않는다 — "빠져나가지 못한다" 는 이것들만 말할 수 있다. */
export const HARD_CC = ["기절", "속박", "에어본", "강제 이동(넉백/끌기)", "도발", "매혹", "공포", "억제"];
export const DASH = ["돌진", "이동기"];

/**
 * "이동 수단과 공백" 노트(카드에서 도출)에 붙이는 고리. 상대 이동기가 빠진 창에 **내 무엇으로**
 * 붙고 묶는지. 173명 모두의 노트에 같은 두 문형을 단다.
 */
export const ESCAPE_HOOKS: PlaybookHook[] = [
  { effects: DASH, text: "{name:라면} {spells:로/으로} 이 틈에 거리를 좁힙니다." },
  { effects: HARD_CC, text: "그때 {spells:을/를} 넣으면 빠져나가지 못합니다." },
];

/** 고리를 상대편 카드로 채워 본문 뒤에 붙인다. 채울 스킬이 없는 고리는 버린다. */
/**
 * 내 노트(playing)가 상대의 이동기·군중 제어를 가리키면 상대편 카드로 그 스킬을 채운다.
 *
 * "Q는 상대가 이동기를 쓴 직후나 마무리용으로 남깁니다" 는 상대를 모르고 쓴 문장이다. 상대가
 * 피오라면 "피오라라면 Q 찌르기가 그 이동기입니다" 가 붙는다. 내 노트 948건 중 이동기 80건,
 * 군중 제어 28건이 이런 꼴이다. 손으로 달지 않고 문장 꼴로 알아본다.
 *
 * 라인 상대가 아니라 상대 팀을 말하는 문장("상대 지원가의 군중 제어", "상대 진입기가 아군 전방에")
 * 은 뺀다. 거기에 라인 상대의 스킬을 붙이면 엉뚱한 사람의 스킬이 된다.
 */
const TEAM_CONTEXT = /지원가|서포터|정글|팀|아군/;
const ENEMY_MOBILITY = /상대[의가]?[^.]{0,15}(이동기|도주기|돌진기|이탈기|도주 수단|진입기)/;
const ENEMY_CC = /상대[의가]?[^.]{0,15}(군중 제어|CC|이동 불가|기절|속박|에어본)[^.]{0,12}(빠진|뺀|빼|쓴|피|흘|소모|빗나)/;
export const PLAYING_HOOKS: Array<[RegExp, PlaybookHook]> = [
  [ENEMY_MOBILITY, { effects: DASH, text: "{name:라면} {spells:이/가} 그 이동기입니다.", after: ENEMY_MOBILITY }],
  [ENEMY_CC, { effects: HARD_CC, text: "{name:라면} {spells:이/가} 그 군중 제어입니다.", after: ENEMY_CC }],
];

function autoHooks(entry: PlaybookEntry, side: "playing" | "against"): PlaybookHook[] | undefined {
  if (entry.category === "escape-window") return ESCAPE_HOOKS;
  if (side !== "playing") return undefined;
  const sentences = entry.text.split(/(?<=[.!?])\s+/).filter((sentence) => !TEAM_CONTEXT.test(sentence));
  const hooks = PLAYING_HOOKS.filter(([pattern]) => sentences.some((sentence) => pattern.test(sentence))).map(([, hook]) => hook);
  return hooks.length ? hooks : undefined;
}

export function withHooks(entry: PlaybookEntry, other: ChampionCard, side: "playing" | "against" = "against"): PlaybookEntry {
  // 이동 수단 노트는 카드에서 도출해 173명 모두에게 있다. 같은 고리를 데이터에 173번 적지 않고 여기서 단다.
  const hooks = entry.hooks ?? autoHooks(entry, side);
  if (!hooks?.length) return entry;
  const used = new Set<string>();
  const sentences: string[] = [];
  // 문장 바로 뒤에 붙일 것: 본문 문장 번호 → 붙일 문장들
  const body = entry.text.split(/(?<=[.!?])\s+/);
  const inserts = new Map<number, string[]>();
  for (const hook of hooks) {
    // 앞 고리가 이미 부른 스킬은 다시 부르지 않는다(돌진이자 기절인 레오나 E)
    const spells = other.spells.filter(
      (spell) => spell.slot !== "P" && !used.has(spell.slot) && spell.effects.some((tag) => hook.effects.includes(tag)),
    );
    if (!spells.length) continue;
    for (const spell of spells) used.add(spell.slot);
    const list = spells.map((spell) => `${spell.slot} ${spell.name}`).join("·");
    const made = hook.text
      .replace(/\{name(?::라면)?\}/g, (m) => (m === "{name}" ? other.name : `${other.name}${hasFinalConsonant(other.name) ? "이라면" : "라면"}`))
      .replace(/\{spells(?::([^}]+))?\}/g, (_, pair?: string) => (pair ? josa(list, pair as JosaPair) : list));
    const at = hook.after ? body.findIndex((sentence) => !TEAM_CONTEXT.test(sentence) && hook.after!.test(sentence)) : -1;
    if (at >= 0) inserts.set(at, [...(inserts.get(at) ?? []), made]);
    else sentences.push(made);
  }
  if (!sentences.length && !inserts.size) return entry;
  const text = [...body.flatMap((sentence, i) => [sentence, ...(inserts.get(i) ?? [])]), ...sentences].join(" ");
  return { ...entry, text };
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
