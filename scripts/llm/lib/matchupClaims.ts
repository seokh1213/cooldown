import { CC_TAGS, has, readProfile } from "./claims";
import type { ChampionCard, DamageType } from "../../../src/lib/knowledge/facts";
import { josa } from "../../../src/lib/knowledge/text";

/* ------------------------------------------------------------------ *
 * 상성
 *
 * 챔피언 조합은 173 × 172 로 삼만 쌍에 가깝다. 손으로 쓸 수 있는 양이 아니다.
 * 그런데 **미리 만들 필요가 없다.** 두 카드만 있으면 그 자리에서 계산되므로
 * 물어볼 때 지으면 된다. `situational-item` 이 한 챔피언에게 하던 일을 둘로
 * 넓힌 것이다.
 *
 * 여기서 말하는 것은 자료가 받쳐 주는 네 가지뿐이다. 내 피해가 상대 저항에 어떻게
 * 걸리는지, 그 반대, 상대가 가진 것 중 내가 못 피하는 것, 그리고 시간이 누구 편인지.
 * ------------------------------------------------------------------ */

export interface MatchupClaims {
  /** 내 주 피해 유형과 그것이 부딪히는 상대 저항의 등급 */
  mine: { damage: DamageType | "혼합" | "불명"; wall: string | undefined };
  /** 상대 주 피해 유형과 내 저항 등급 */
  theirs: { damage: DamageType | "혼합" | "불명"; wall: string | undefined };
  /** 상대가 가진 군중 제어 중 내가 이동기로 못 빠지는 상황인가 */
  pinned: boolean;
  /** 시간이 누구 편인가 */
  scaling: "mine" | "theirs" | "even";
}

/**
 * 그 저항이 높은 편인가. 카드가 매긴 1레벨 등급을 읽는다.
 *
 * 1레벨과 18레벨 등급이 반대쪽이면 말하지 않는다. 이즈리얼 마법 저항력은 1레벨 33으로
 * 상위 9%지만(대부분 32) 18레벨에는 하위 11%다. "높은 편이라 잘 들어가지 않는다" 는
 * 1점 차이를 두고 한 거짓말이 된다. 이런 챔피언·저항이 33건 있다.
 */
function resistGrade(card: ChampionCard, stat: "armor" | "magicResist"): string | undefined {
  const snap = card.stats[stat];
  if (!snap) return undefined;
  const late = snap.gradeLv18;
  if ((isHigh(snap.gradeLv1) && isLow(late)) || (isLow(snap.gradeLv1) && isHigh(late))) return undefined;
  /*
   * "높은 편이라 그대로는 잘 들어가지 않습니다. 관통을 섞거나…" 는 강한 말이다. 1레벨과 18레벨이
   * 모두 매우 높을 때만 한다. 등급은 챔피언 사이 순위라 방어력 36 이 이미 "매우 높음" 인데(중앙값 30),
   * 받는 피해로는 4% 차이다. 그 기준으로는 61명(35%)이 "방어력이 높은 편" 이 되어 럼블·리 신에게도
   * 관통을 권했다(채점자가 둘 다 의심했다). 엄격히 하면 13명 — 말파이트·레오나·다리우스 같은 앞라인이다.
   * 낮은 쪽은 그대로 둔다. 거기서 나오는 말은 "그 저항을 먼저 올린다" 라 과해도 해가 없다.
   */
  if (isHigh(snap.gradeLv1) && !(snap.gradeLv1 === "매우 높음" && late === "매우 높음")) return "보통";
  return snap.gradeLv1;
}

export function deriveMatchupClaims(me: ChampionCard, enemy: ChampionCard): MatchupClaims {
  const mineProfile = readProfile(me);
  const theirProfile = readProfile(enemy);
  const wallFor = (damage: DamageType | "혼합" | "불명", target: ChampionCard) =>
    damage === "물리" ? resistGrade(target, "armor") : damage === "마법" ? resistGrade(target, "magicResist") : undefined;

  const enemyCc = enemy.spells.filter((s) => s.effects.some((tag) => CC_TAGS.has(tag))).length;
  const myMobility = me.spells.some((s) => has(s, "이동기") || has(s, "돌진"));

  const myStacks = me.spells.some((s) => has(s, "성장 스택"));
  const theirStacks = enemy.spells.some((s) => has(s, "성장 스택"));

  return {
    mine: { damage: mineProfile.mix, wall: wallFor(mineProfile.mix, enemy) },
    theirs: { damage: theirProfile.mix, wall: wallFor(theirProfile.mix, me) },
    pinned: enemyCc >= 2 && !myMobility,
    scaling: myStacks === theirStacks ? "even" : myStacks ? "mine" : "theirs",
  };
}

/** 등급이 높은 쪽인가. "매우 높음"·"높음" 만 벽으로 본다. */
function isHigh(grade: string | undefined): boolean {
  return grade === "매우 높음" || grade === "높음";
}
function isLow(grade: string | undefined): boolean {
  return grade === "매우 낮음" || grade === "낮음";
}

/** 도출 문장을 지을 언어. 카드 자료는 언어와 무관하므로 문장만 갈아 끼운다. */
export type ClaimLang = "ko_KR" | "en_US" | "zh_CN";

/*
 * 각 언어권이 **실제로 쓰는 롤 용어**를 쓴다.
 *
 * 옮겨 적은 말이 아니라 그 서버 사람들이 입에 올리는 말이어야 한다. 방어력은
 * 영어로 armor 이고 중국어로 护甲 다. 관통은 penetration / 穿透 이고, 붙잡는 수단은
 * CC / 控制 다. 직역하면 "defense power" 나 "防御力" 이 되어 아무도 안 쓰는 말이 된다.
 */
const CLAIM_WORDS: Record<ClaimLang, { armor: string; mr: string; physical: string; magic: string }> = {
  ko_KR: { armor: "방어력", mr: "마법 저항력", physical: "물리", magic: "마법" },
  en_US: { armor: "armor", mr: "magic resist", physical: "physical", magic: "magic" },
  zh_CN: { armor: "护甲", mr: "魔抗", physical: "物理", magic: "魔法" },
};

/**
 * 도출 문장의 종류. 상성 요약이 이것으로 칸을 가른다.
 *   offense  내 피해가 상대 저항에 어떻게 걸리나
 *   defense  상대 피해가 내 저항에 어떻게 걸리나 — 무엇을 먼저 올릴지
 *   pinned   붙잡히면 못 빠진다
 *   scaling  시간이 누구 편인가
 */
export type ClaimKind = "offense" | "defense" | "pinned" | "scaling";

export interface TaggedClaim {
  kind: ClaimKind;
  text: string;
}

export function renderMatchupClaims(
  me: ChampionCard,
  enemy: ChampionCard,
  claims: MatchupClaims,
  lang: ClaimLang = "ko_KR",
): string[] {
  return renderTaggedClaims(me, enemy, claims, lang).map((claim) => claim.text);
}

export function renderTaggedClaims(
  me: ChampionCard,
  enemy: ChampionCard,
  claims: MatchupClaims,
  lang: ClaimLang = "ko_KR",
): TaggedClaim[] {
  const tagged: Array<[ClaimKind, string | undefined]> = [
    ["offense", offenseClaim(me, enemy, claims.mine, lang)],
    ["defense", defenseClaim(me, enemy, claims.theirs, lang)],
    ["pinned", claims.pinned ? pinnedClaim(me, enemy, lang) : undefined],
    ["scaling", scalingClaim(me, enemy, claims.scaling, lang)],
  ];
  return tagged.flatMap(([kind, text]) => (text ? [{ kind, text }] : []));
}

type MainDamage = MatchupClaims["mine"]["damage"];

function resistWord(damage: MainDamage, lang: ClaimLang): string {
  const w = CLAIM_WORDS[lang];
  return damage === "물리" ? w.armor : damage === "마법" ? w.mr : lang === "ko_KR" ? "저항" : lang === "en_US" ? "resistances" : "抗性";
}

function damageWord(damage: MainDamage, lang: ClaimLang): string {
  const w = CLAIM_WORDS[lang];
  return damage === "물리" ? w.physical : w.magic;
}

/** 내 피해가 상대 저항에 어떻게 걸리나 */
function offenseClaim(me: ChampionCard, enemy: ChampionCard, mine: MatchupClaims["mine"], lang: ClaimLang): string | undefined {
  if (mine.damage === "불명" || mine.damage === "혼합") return undefined;
  const name = resistWord(mine.damage, lang);
  const dmg = damageWord(mine.damage, lang);
  if (isHigh(mine.wall)) {
    return lang === "ko_KR"
      ? `${me.name}의 피해는 주로 ${dmg}인데 ${enemy.name}의 ${name}이 높은 편이라 그대로는 잘 들어가지 않습니다. 관통을 섞거나 ${name}이 값을 못 하는 피해를 찾아야 합니다.`
      : lang === "en_US"
        ? `${me.name} deals mostly ${dmg} damage and ${enemy.name} has high ${name}, so raw damage falls off. Build penetration or look for damage that ignores ${name}.`
        : `${me.name}主要打${dmg}伤害，而${enemy.name}的${name}很高，硬打伤害会被吃掉。需要出穿透，或者找不吃${name}的伤害。`;
  }
  if (isLow(mine.wall)) {
    return lang === "ko_KR"
      ? `${me.name}의 피해는 주로 ${dmg}이고 ${enemy.name}의 ${name}이 낮은 편이라 그대로 잘 들어갑니다.`
      : lang === "en_US"
        ? `${me.name} deals mostly ${dmg} damage and ${enemy.name} has low ${name}, so it lands hard as is.`
        : `${me.name}主要打${dmg}伤害，而${enemy.name}的${name}偏低，伤害可以直接打出来。`;
  }
  return undefined;
}

/** 상대 피해가 내 저항에 어떻게 걸리나 — 무엇을 먼저 올릴지 */
function defenseClaim(me: ChampionCard, enemy: ChampionCard, theirs: MatchupClaims["theirs"], lang: ClaimLang): string | undefined {
  if (theirs.damage === "불명" || theirs.damage === "혼합") return undefined;
  if (!isLow(theirs.wall)) return undefined;
  const name = resistWord(theirs.damage, lang);
  const dmg = damageWord(theirs.damage, lang);
  return lang === "ko_KR"
    ? `${enemy.name}의 피해는 주로 ${dmg}인데 ${me.name}의 ${name}이 낮은 편이라 그쪽이 먼저 올릴 저항입니다.`
    : lang === "en_US"
      ? `${enemy.name} deals mostly ${dmg} damage and ${me.name} has low ${name}, so that is the stat to buy first.`
      : `${enemy.name}主要打${dmg}伤害，而${me.name}的${name}偏低，这条抗性要优先堆。`;
}

/** 붙잡히면 못 빠진다 */
function pinnedClaim(me: ChampionCard, enemy: ChampionCard, lang: ClaimLang): string {
  return lang === "ko_KR"
    ? `${josa(me.name, "은/는")} 스스로 빠져나갈 스킬이 없고 ${josa(enemy.name, "은/는")} 붙잡는 수단을 여럿 가졌습니다. 한 번 걸리면 그대로 이어 맞는 구도라 거리 관리가 먼저입니다.`
    : lang === "en_US"
      ? `${me.name} has no escape and ${enemy.name} has multiple pieces of CC. One catch chains into the rest, so spacing comes first.`
      : `${me.name}没有位移逃生手段，而${enemy.name}有多个控制。一旦被抓就会被连到底，所以走位拉扯是第一位的。`;
}

/** 시간이 누구 편인가 */
function scalingClaim(me: ChampionCard, enemy: ChampionCard, scaling: MatchupClaims["scaling"], lang: ClaimLang): string | undefined {
  if (scaling === "theirs") {
    return lang === "ko_KR"
      ? `${josa(enemy.name, "은/는")} 쌓을수록 세지므로 시간이 갈수록 불리해집니다. 초반에 눌러 두는 편이 낫습니다.`
      : lang === "en_US"
        ? `${enemy.name} scales with stacks, so the game gets worse the longer it runs. Punish early.`
        : `${enemy.name}靠叠层发育，拖得越久越不利。要在前期压制。`;
  }
  if (scaling === "mine") {
    return lang === "ko_KR"
      ? `${josa(me.name, "은/는")} 쌓을수록 세지므로 초반을 버티면 뒤로 갈수록 유리해집니다.`
      : lang === "en_US"
        ? `${me.name} scales with stacks, so surviving the early game turns the matchup around.`
        : `${me.name}靠叠层发育，熬过前期后期会越来越强。`;
  }
  return undefined;
}
