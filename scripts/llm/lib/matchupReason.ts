/**
 * 상성의 이유를 사실 카드에서 계산한다
 *
 * 승률은 패치마다 바뀌지만 **왜 유리한가는 잘 바뀌지 않는다.**
 * "초가스 55%" 는 2주면 죽는 숫자고, "오공은 마법 저항력이 최하위권인데 초가스는 마법 피해에
 * 최대 체력 비례 처형까지 있다" 는 스킬이 개편되기 전까지 유효하다.
 *
 * 그래서 통계는 **누가** 유리한지만 정하고, **왜** 는 여기서 사실 카드로 계산한다.
 * 사실 카드는 패치마다 다시 만들어지므로 이 설명도 함께 갱신된다.
 */
import type { ChampionCard, SpellFact } from "./facts";
import { josa } from "./text";

export interface MatchupReason {
  /** 한 문장 설명 */
  text: string;
  /** 이 설명의 근거 종류. 진단과 정렬에 쓴다. */
  kind:
    | "defense-gap"
    | "true-damage"
    | "percent-health"
    | "range"
    | "cc"
    | "sustain"
    | "engage-denial";
}

const WEAK = new Set(["매우 낮음", "낮음"]);

function primaryDamage(card: ChampionCard): string {
  return card.riot?.damageType ?? card.damageProfile.primary;
}

function spellsWith(card: ChampionCard, tag: string): SpellFact[] {
  return card.spells.filter((s) => s.effects.includes(tag));
}

function label(spells: SpellFact[]): string {
  return spells.map((s) => `${s.slot} ${s.name}`).join(", ");
}

/**
 * `opponent` 가 `target` 을 상대로 유리한 구조적 이유를 모은다.
 *
 * 통계가 고른 상성에 이유를 붙이는 용도다. 이유가 하나도 안 나올 수 있는데,
 * 그때는 억지로 지어내지 말고 비워 둔다. 근거 없는 설명은 없느니만 못하다.
 */
export function explainMatchup(target: ChampionCard, opponent: ChampionCard): MatchupReason[] {
  const reasons: MatchupReason[] = [];
  const oppDamage = primaryDamage(opponent);

  // 1. 상대 피해 유형에 대한 방어 스탯이 약한가
  if (oppDamage === "마법" && WEAK.has(target.stats.magicResist.gradeLv1)) {
    reasons.push({
      kind: "defense-gap",
      text:
        `${target.name}의 마법 저항력은 1레벨 기준 "${target.stats.magicResist.gradeLv1}" 등급인데 ` +
        `${josa(opponent.name, "은/는")} 마법 피해가 주력이라 초반 딜 교환이 그대로 밀린다.`,
    });
  }
  if (oppDamage === "물리" && WEAK.has(target.stats.armor.gradeLv1)) {
    reasons.push({
      kind: "defense-gap",
      text:
        `${target.name}의 방어력은 1레벨 기준 "${target.stats.armor.gradeLv1}" 등급인데 ` +
        `${josa(opponent.name, "은/는")} 물리 피해가 주력이라 초반 딜 교환이 그대로 밀린다.`,
    });
  }

  // 2. 방어 스탯으로 못 줄이는 피해
  const trueDamage = opponent.spells.filter((s) => s.damageTypes.includes("고정"));
  if (trueDamage.length) {
    reasons.push({
      kind: "true-damage",
      text: `${opponent.name}의 ${josa(label(trueDamage), "은/는")} 고정 피해라 방어력·마법 저항력으로 줄일 수 없다.`,
    });
  }
  const percentHealth = spellsWith(opponent, "최대 체력 비례 피해");
  if (percentHealth.length && !WEAK.has(target.stats.health.gradeLv18)) {
    reasons.push({
      kind: "percent-health",
      text:
        `${opponent.name}의 ${josa(label(percentHealth), "은/는")} 최대 체력에 비례하므로 ` +
        `체력이 높은 ${target.name}에게 오히려 잘 들어간다.`,
    });
  }

  // 3. 사거리 우위
  if (opponent.rangeType === "원거리" && target.rangeType === "근접") {
    reasons.push({
      kind: "range",
      text: `${josa(opponent.name, "은/는")} 원거리라 근접인 ${josa(target.name, "이/가")} 붙기 전까지 일방적으로 견제할 수 있다.`,
    });
  }

  // 4. 진입을 끊는 수단. 근접 챔피언에게 특히 아프다.
  if (target.rangeType === "근접") {
    const denial = opponent.spells.filter((s) =>
      s.effects.some((e) =>
        ["기절", "에어본", "속박", "강제 이동(넉백/끌기)", "공포", "도발"].includes(e),
      ),
    );
    if (denial.length) {
      reasons.push({
        kind: "engage-denial",
        text:
          `${opponent.name}의 ${josa(label(denial), "은/는")} ${target.name}의 진입을 끊는다. ` +
          "붙어야 값이 나오는 챔피언에게는 이것만으로 구도가 뒤집힌다.",
      });
    }
  }

  // 5. 상대의 유지력
  const sustain = spellsWith(opponent, "회복");
  if (sustain.length && !spellsWith(target, "치유 감소").length) {
    reasons.push({
      kind: "sustain",
      text: `${josa(opponent.name, "은/는")} ${josa(label(sustain), "로/으로")} 체력을 되찾아 긴 딜 교환을 버틴다.`,
    });
  }

  return reasons;
}

/** 상성 목록 하나를 사람이 읽는 줄로. 이유가 없으면 이름과 표본만 남긴다. */
export function matchupToLine(
  target: ChampionCard,
  opponent: ChampionCard | undefined,
  stat: { name: string; winRate: number; count: number },
  includeNumbers: boolean,
): string {
  const opponentRate = (100 - stat.winRate).toFixed(1);
  const head = includeNumbers
    ? `${stat.name} (${stat.name} 쪽 승률 ${opponentRate}%, 표본 ${stat.count.toLocaleString("ko-KR")}판)`
    : stat.name;
  const reasons = opponent ? explainMatchup(target, opponent) : [];
  if (!reasons.length) return `- ${head}`;
  return `- ${head}: ${reasons.map((r) => r.text).join(" ")}`;
}
