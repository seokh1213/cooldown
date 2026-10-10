/**
 * 카드 자료에 적힌 **닫힌 어휘**의 세 언어 표기
 *
 * 효과 태그·피해 유형·계수 성향·등급은 툴팁을 한국어 정규식으로 읽어 뽑는다.
 * 그래서 값이 한국어 문자열이고, 코드가 그 문자열을 열쇠로 쓴다
 * (`effects.includes("이동기")`, `CC_TAGS.has(tag)`). 열쇠를 언어마다 바꾸면
 * 도출·노트·근거 판정이 통째로 무너지므로 **자료의 값은 한국어로 둔다.**
 *
 * 대신 보이기 직전에 여기서 옮긴다. 그러자면 표가 자료보다 먼저 차 있어야 한다 —
 * 빠진 태그는 화면에 한국어로 새어 나가고 아무도 고장으로 안 본다. 그래서 이 표를
 * 카드 생성기(`build-knowledge`)와 화면이 함께 쓰고, 생성기가 카드에 실제로 실린
 * 태그가 모두 이 표에 있는지 보고 하나라도 없으면 **빌드를 세운다.**
 *
 * 브라우저 묶음이 같이 쓰므로 파일을 읽지 않는다.
 */

export type CardLang = "ko_KR" | "en_US" | "zh_CN";

/** 효과 태그. 자료에 실제로 쓰이는 값만 담는다. 빠진 값이 있으면 카드 생성이 선다. */
export const TAGS: Record<string, { en: string; zh: string }> = {
  "강인함": { en: "tenacity", zh: "坚韧" },
  "강제 이동(넉백/끌기)": { en: "forced movement (knockback/pull)", zh: "强制位移（击退/拉拽）" },
  "고정 피해": { en: "true damage", zh: "真实伤害" },
  "공격 무효화": { en: "attack negation", zh: "攻击无效化" },
  "공격 속도 증가": { en: "attack speed boost", zh: "攻速提升" },
  "공포": { en: "fear", zh: "恐惧" },
  "관통": { en: "penetration", zh: "穿透" },
  "광역": { en: "area of effect", zh: "范围效果" },
  "기본 공격 강화": { en: "empowered auto-attack", zh: "强化普攻" },
  "기절": { en: "stun", zh: "眩晕" },
  "도발": { en: "taunt", zh: "嘲讽" },
  "돌진": { en: "dash", zh: "突进" },
  "둔화": { en: "slow", zh: "减速" },
  "매혹": { en: "charm", zh: "魅惑" },
  "보호막": { en: "shield", zh: "护盾" },
  "분신": { en: "clone", zh: "分身" },
  "속박": { en: "root", zh: "定身" },
  "억제": { en: "suppression", zh: "压制" },
  "에어본": { en: "airborne", zh: "击飞" },
  "은신": { en: "stealth", zh: "隐身" },
  "이동 속도 증가": { en: "move speed boost", zh: "移速提升" },
  "이동기": { en: "mobility", zh: "位移" },
  "잃은 체력 비례": { en: "scales with missing health", zh: "按已损失生命值加成" },
  "자기 마법 저항력 증가": { en: "self magic resist boost", zh: "自身魔抗提升" },
  "자기 방어력 증가": { en: "self armor boost", zh: "自身护甲提升" },
  "적 마법 저항력 감소": { en: "enemy magic resist shred", zh: "削减敌方魔抗" },
  "적 방어력 감소": { en: "enemy armor shred", zh: "削减敌方护甲" },
  "처형": { en: "execute", zh: "处决" },
  "최대 체력 비례 피해": { en: "max health damage", zh: "最大生命值伤害" },
  "치유 감소": { en: "grievous wounds", zh: "治疗削减" },
  "침묵": { en: "silence", zh: "沉默" },
  "쿨타임 초기화": { en: "cooldown reset", zh: "冷却重置" },
  "투사체 차단": { en: "projectile block", zh: "格挡弹道" },
  "피해 면역": { en: "damage immunity", zh: "伤害免疫" },
  "회복": { en: "heal", zh: "回复" },
  "받는 피해 감소": { en: "damage reduction", zh: "承受伤害降低" },
  "변신": { en: "transform", zh: "变身" },
  "생명력 흡수": { en: "lifesteal", zh: "吸血" },
  "소환수": { en: "pet", zh: "召唤物" },
  "자기 공격력 증가": { en: "self attack damage boost", zh: "自身攻击力提升" },
  "치명타": { en: "critical strike", zh: "暴击" },
  "부활": { en: "revive", zh: "复活" },
  "연계 강화": { en: "amplified by a prior hit", zh: "连招强化" },
  "표식 부여": { en: "applies a mark", zh: "施加标记" },
  "성장 스택": { en: "permanent stacking", zh: "永久叠加" },
  "스킬 강화": { en: "next ability empowered", zh: "技能强化" },
  "사거리 증가": { en: "extended range", zh: "射程提升" },
  "자기 주문력 증가": { en: "self ability power boost", zh: "自身法强提升" },
};

export const DAMAGE: Record<string, { en: string; zh: string }> = {
  "물리": { en: "physical", zh: "物理" },
  "마법": { en: "magic", zh: "魔法" },
  "혼합": { en: "mixed", zh: "混合" },
  "고정": { en: "true", zh: "真实" },
};

export const SCALING: Record<string, { en: string; zh: string }> = {
  AD: { en: "AD", zh: "AD" },
  AP: { en: "AP", zh: "AP" },
  "체력": { en: "health", zh: "生命值" },
  "혼합": { en: "mixed", zh: "混合" },
};

export const GRADE: Record<string, { en: string; zh: string }> = {
  "매우 높음": { en: "very high", zh: "极高" },
  "높음": { en: "high", zh: "高" },
  "보통": { en: "average", zh: "中等" },
  "낮음": { en: "low", zh: "低" },
  "매우 낮음": { en: "very low", zh: "极低" },
};

/**
 * 능력치 이름.
 *
 * 다른 표들과 달리 열쇠가 한국어가 아니라 코드 이름(health, armor…)이다. 그래서
 * 한국어 값을 따로 적어야 한다. 빼먹었더니 프롬프트에 "health: 상위권" 이 나갔고
 * 모델이 그것을 "건강" 으로 옮겨 적었다.
 */
export const STATS: Record<string, { ko: string; en: string; zh: string }> = {
  health: { ko: "체력", en: "Health", zh: "生命值" },
  armor: { ko: "방어력", en: "Armor", zh: "护甲" },
  magicResist: { ko: "마법 저항력", en: "Magic resist", zh: "魔抗" },
  attackDamage: { ko: "공격력", en: "Attack damage", zh: "攻击力" },
  moveSpeed: { ko: "이동 속도", en: "Move speed", zh: "移动速度" },
  attackSpeed: { ko: "공격 속도", en: "Attack speed", zh: "攻速" },
  healthRegen: { ko: "체력 재생", en: "Health regen", zh: "生命回复" },
};

/**
 * 계수가 붙는 능력치.
 *
 * `STATS` 와 열쇠가 다르다. 저쪽은 코드 이름(`attackDamage`)이고 이쪽은 툴팁에서
 * 읽어 낸 한국어다("추가 공격력"). 한 표로 합치려다 "추가" 가 붙은 네 가지가
 * 갈 곳이 없어 따로 둔다.
 */
export const RATIO_STATS: Record<string, { en: string; zh: string }> = {
  "공격력": { en: "AD", zh: "攻击力" },
  "추가 공격력": { en: "bonus AD", zh: "额外攻击力" },
  "주문력": { en: "AP", zh: "法强" },
  "체력": { en: "health", zh: "生命值" },
  "최대 체력": { en: "max health", zh: "最大生命值" },
  "추가 체력": { en: "bonus health", zh: "额外生命值" },
  "방어력": { en: "armor", zh: "护甲" },
  "추가 방어력": { en: "bonus armor", zh: "额外护甲" },
  "마법 저항력": { en: "magic resist", zh: "魔抗" },
  "추가 마법 저항력": { en: "bonus magic resist", zh: "额外魔抗" },
  "추가 공격 속도": { en: "bonus attack speed", zh: "额外攻速" },
};

/** 사거리 구분. 카드의 `rangeType` 이 이 두 값 중 하나다. */
export const RANGE: Record<string, { en: string; zh: string }> = {
  "근접": { en: "melee", zh: "近战" },
  "원거리": { en: "ranged", zh: "远程" },
};

export function pick(table: Record<string, { en: string; zh: string }>, key: string, lang: CardLang): string {
  const row = table[key];
  if (!row) return key; // 표에 없으면 한국어 그대로. 빈칸보다 낫다 — 대신 생성기가 먼저 잡는다.
  if (lang === "en_US") return row.en;
  if (lang === "zh_CN") return row.zh;
  return key;
}

/**
 * 표가 자료를 못 따라간 자리를 찾는다.
 *
 * 태그는 툴팁 정규식이 만든다. 정규식이 늘면 새 태그가 생기고, 표에 넣는 것을
 * 잊으면 영어·중국어 화면에 한국어가 그대로 나간다. `pick` 이 조용히 한국어를
 * 돌려주므로 화면만 봐서는 고장으로 안 보인다. 그래서 카드를 쓰기 전에 여기서 센다.
 */
export function missingCardWords(values: Iterable<string>, table: Record<string, unknown>): string[] {
  return [...new Set(values)].filter((value) => !(value in table)).sort();
}

