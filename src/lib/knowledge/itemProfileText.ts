import type { ChampionCard, DamageType } from "./facts";
import type { ItemClaims } from "./claims";
import { callSlots } from "./claims";
import { josa } from "./text";

export function profileLine(card: ChampionCard, claims: ItemClaims): string | undefined {
  const { profile } = claims;
  const name = card.name;
  // 유형이 안 적힌 딜링 스킬이 있으면 "모두" 라고 말할 수 없다. 그 한 마디가
  // "방어력은 살 필요 없다" 는 조언으로 읽히므로, 아는 것까지만 말한다.
  // 기본 공격은 슬롯이 없지만 물리로 들어온다. 평타가 축인 챔피언에게 "스킬이 전부
  // 마법이니 방어력은 값이 없다" 고 하면 코그모 상대로 정반대 조언이 된다.
  const clean =
    profile.unknown.length === 0 && profile.exceptions.length === 0 && !profile.autoAttacker;
  for (const [type, joined, resist, other, otherJoined] of [
    ["마법", "마법이라", "마법 저항력", "방어력", "물리라"],
    ["물리", "물리라", "방어력", "마법 저항력", "마법이라"],
  ] as const) {
    if (profile.mix !== type) continue;
    // 두 유형을 함께 내는 슬롯은 여기서도 빼야 한다. 넣으면 "P 가 물리" 라고 해 놓고
    // 바로 뒤에서 "P 는 두 유형을 함께 낸다" 가 되어 한 문단이 스스로 어긋난다.
    const slots = callSlots(
      card,
      (profile.byType[type] ?? []).filter((slot) => !profile.both.includes(slot)),
    );
    if (clean) {
      return `${name}의 피해는 ${slots}까지 모두 ${joined} ${other}은 한 푼도 값을 하지 않고 ${resist}만 실효 체력으로 바뀝니다.`;
    }
    const head = `${name}의 주력 피해는 ${josa(slots, "이/가")} ${type}이므로 ${resist}이 먼저입니다.`;
    const tails: string[] = [];
    if (type === "마법" && profile.autoAttacker && profile.exceptions.length === 0) {
      tails.push("다만 화력의 상당 부분이 기본 공격에서 나오고 그쪽은 물리라 방어력도 함께 값을 합니다.");
    }
    // 예외를 말하지 않으면 "한 갈래만 올리면 된다" 로 읽힌다. 애쉬 R 이 그 자리다.
    if (profile.exceptions.length > 0) {
      // 낱말이 바뀌면 조사도 바뀐다. "그쪽는" 이 그대로 나갔었다.
      const one = profile.exceptions.length === 1 ? "그 한 줄기" : "그쪽";
      tails.push(
        `다만 ${callSlots(card, profile.exceptions)}만 ${otherJoined} ${josa(one, "은/는")} ${resist}으로 막히지 않습니다.`,
      );
    }
    if (profile.both.length > 0) {
      tails.push(`${josa(callSlots(card, profile.both), "은/는")} 두 유형을 함께 내므로 어느 저항으로도 절반만 막힙니다.`);
    }
    return [head, ...tails].join(" ");
  }
  if (profile.mix === "혼합") {
    // 두 유형을 함께 내는 슬롯은 어느 목록에도 넣지 않는다. 넣으면 "W 가 물리,
    // W 가 마법" 이라는 말이 된다.
    const only = (type: DamageType) =>
      (profile.byType[type] ?? []).filter((slot) => !profile.both.includes(slot));
    const phys = callSlots(card, only("물리"), 2);
    const magic = callSlots(card, only("마법"), 2);
    if (!phys || !magic) {
      return `${josa(name, "은/는")} ${josa(callSlots(card, profile.both), "은/는")} 두 유형을 함께 내므로 어느 저항을 올려도 절반만 막힙니다.`;
    }
    const head = `${josa(name, "은/는")} ${josa(phys, "이/가")} 물리, ${josa(magic, "이/가")} 마법이라 한쪽 저항만 올리면 절반은 그대로 들어옵니다.`;
    if (profile.both.length === 0) return head;
    return `${head} ${josa(callSlots(card, profile.both), "은/는")} 두 유형을 한꺼번에 냅니다.`;
  }
  return undefined;
}

