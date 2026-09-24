/**
 * 노트를 문장이 아니라 **주장**으로 다룬다
 *
 * 지금까지 노트는 사람이 쓴 산문이었다. 산문은 세 가지가 안 된다.
 *
 *   통일   173종을 나눠 쓰면 챔피언마다 표현이 달라진다
 *   검증   "빅토르의 피해는 전부 마법이다" 가 맞는지 기계가 대조할 수 없다
 *   추적   모델이 그 문장을 고쳐 쓰면 어디서 온 말인지 알 수 없다
 *
 * 그래서 주장을 **카드를 가리키는 자료**로 적고, 문장은 코드가 만든다. 카드의
 * 태그가 고쳐지면 문장이 따라 고쳐지고, 카드와 어긋나는 주장은 애초에 만들어지지
 * 않는다. `prose.ts` 가 카드 값으로 문장을 짓는 것과 같은 원리를 노트로 옮긴 것이다.
 *
 * 여기서 다루는 것은 `situational-item` 한 갈래다. "무엇을 올려야 하는가" 는
 * 질문이 가장 잦으면서 답이 전부 카드에서 나오는 갈래라 먼저 옮긴다.
 */
import type { ChampionCard, DamageType, SpellFact } from "./facts";
import { josa } from "./text";

/** 저항을 올려도 값이 깎이는 사유. 노트의 "단서" 문장이 되는 것들이다. */
export type Discount = "저항 감소" | "관통" | "고정 피해" | "최대 체력 비례" | "처형";

/** 올릴 스탯. 아이템 이름은 판올림마다 바뀌므로 스탯까지만 말한다. */
export type CounterStat = "방어력" | "마법 저항력" | "체력" | "치유 감소" | "강인함" | "공격 속도 감소" | "이동 속도";

export interface ItemClaims {
  champion: string;
  /** 피해가 어느 유형으로 들어오는가. 슬롯은 근거다. */
  profile: {
    mix: DamageType | "혼합" | "불명";
    byType: Partial<Record<DamageType, string[]>>;
    /** 주된 유형과 다른 유형으로 들어오는 스킬. 저항 한 갈래로 못 막는 자리다. */
    exceptions: string[];
    /** 한 스킬이 두 유형을 함께 내는 자리. 어느 목록에도 넣으면 안 된다. */
    both: string[];
    /** 기본 공격이 화력의 한 축인가. 평타는 물리라 "방어력 무용" 을 말할 수 없다. */
    autoAttacker: boolean;
    /** 피해를 입히는데 유형이 안 적힌 스킬. 자료의 구멍이지 없는 피해가 아니다. */
    unknown: string[];
  };
  /** 올린 저항의 값을 깎는 것들 */
  discounts: Array<{ kind: Discount; slots: string[] }>;
  /** 체력을 돌려주는 스킬 */
  sustain: string[];
  /** 군중 제어를 거는 스킬 */
  cc: string[];
  /** 기본 공격과 공격 속도가 화력의 축인가 */
  dps: boolean;
  /** 자리를 깔아 놓고 미는 꼴인가 */
  zoning: boolean;
  /** 올릴 순서. 앞이 먼저다. */
  stats: CounterStat[];
}

const CC_TAGS = new Set([
  "기절",
  "속박",
  "매혹",
  "도발",
  "공포",
  "침묵",
  "억제",
  "에어본",
  "강제 이동(넉백/끌기)",
]);

/** 기본 공격이 화력의 한 축인 하위 클래스. 위키 분류를 그대로 쓴다. */
const AUTO_SUBCLASSES = new Set(["Marksman", "Skirmisher", "Juggernaut", "Diver"]);

function has(spell: SpellFact, tag: string): boolean {
  return spell.effects.includes(tag);
}

function slotsWhere(card: ChampionCard, pick: (spell: SpellFact) => boolean): string[] {
  return card.spells.filter(pick).map((spell) => spell.slot);
}

/**
 * 피해 유형 구성을 읽는다.
 *
 * 유형을 못 밝힌 스킬이 있다(시비르 Q 는 라이엇 툴팁이 "피해" 라고만 적는다).
 * 그런 스킬은 세지 않는다. 모르는 것을 물리로 넘겨짚으면 "방어력만 올리면 된다"
 * 는 반대 조언이 나온다.
 *
 * 한 갈래라도 다른 유형이면 "혼합" 이라고 하면 안 된다. 애쉬는 R 하나만 마법인데
 * 그것 때문에 혼합이 되어 "한쪽 저항은 절반만 막는다" 는 말이 나왔다. 실제로는
 * 방어력이 답이고 R 만 예외다. 그래서 **어느 쪽이 주된가**를 먼저 가리고, 다른
 * 유형은 예외로 따로 말한다.
 *
 * 라이엇의 `damageType` 은 여기에 쓰지 않는다. 그것은 피해 유형이 아니라 계수
 * 기준이다. 이즈리얼은 "물리" 로 분류되지만 W·E·R 이 마법이라, 그대로 믿으면
 * 방어력을 올리라는 반대 조언이 된다.
 */
function readProfile(card: ChampionCard): ItemClaims["profile"] {
  const byType: Partial<Record<DamageType, string[]>> = {};
  const unknown: string[] = [];
  for (const spell of card.spells) {
    for (const type of spell.damageTypes) {
      byType[type] = [...(byType[type] ?? []), spell.slot];
    }
    if (spell.damageTypes.length === 0 && /피해를 입/.test(spell.text)) unknown.push(spell.slot);
  }
  // 한 스킬이 두 유형을 함께 내기도 한다(이렐리아 W, 아크샨 P). 물리 목록과 마법
  // 목록에 같은 슬롯이 들어가면 "Q 가 물리, Q 가 마법" 이라는 말이 나오고, 예외로
  // 뽑히면 "다만 Q 만 마법이라" 가 되어 Q 의 물리 피해가 없는 말이 된다. 따로 센다.
  const both = (byType["물리"] ?? []).filter((slot) => (byType["마법"] ?? []).includes(slot));
  const physicalSlots = (byType["물리"] ?? []).filter((slot) => !both.includes(slot));
  const magicSlots = (byType["마법"] ?? []).filter((slot) => !both.includes(slot));
  const autoAttacker = AUTO_SUBCLASSES.has(card.wiki?.subclass ?? "");
  if (physicalSlots.length === 0 && magicSlots.length === 0) {
    return { mix: both.length ? "혼합" : "불명", byType, exceptions: [], both, autoAttacker, unknown };
  }

  // 기본 공격은 물리다. 평타가 화력의 축인 챔피언은 스킬 슬롯만 세면 물리 쪽이
  // 실제보다 가볍게 잡힌다. 애쉬·피오라가 그래서 혼합으로 잡혔다.
  //
  // 신호는 태그가 아니라 하위 클래스로 잡는다. "기본 공격 강화" 는 누누 P 처럼
  // 평타에 작은 덤을 얹는 것에도 붙어서, 실제로는 마법 챔피언인 누누까지 평타
  // 중심으로 읽혔다.
  const physical = physicalSlots.length + (autoAttacker ? 2 : 0);
  const magic = magicSlots.length;

  // 팽팽할 때만 혼합이다. 한 갈래라도 기울면 그쪽을 주된 것으로 말하고 나머지는
  // 예외로 짚는 편이 "어느 저항을 올릴까" 라는 물음에 맞는 답이다.
  if (physical === magic && physicalSlots.length > 0 && magicSlots.length > 0) {
    return { mix: "혼합", byType, exceptions: [], both, autoAttacker, unknown };
  }
  const mix: DamageType = physical > magic ? "물리" : "마법";
  return { mix, byType, exceptions: mix === "물리" ? magicSlots : physicalSlots, both, autoAttacker, unknown };
}

export function deriveItemClaims(card: ChampionCard): ItemClaims {
  const profile = readProfile(card);

  const discounts: ItemClaims["discounts"] = [];
  const shred = slotsWhere(card, (s) => has(s, "적 방어력 감소") || has(s, "적 마법 저항력 감소"));
  if (shred.length) discounts.push({ kind: "저항 감소", slots: shred });
  const pen = slotsWhere(card, (s) => has(s, "관통"));
  if (pen.length) discounts.push({ kind: "관통", slots: pen });
  const trueDmg = profile.byType["고정"] ?? [];
  if (trueDmg.length) discounts.push({ kind: "고정 피해", slots: trueDmg });
  const maxHp = slotsWhere(card, (s) => has(s, "최대 체력 비례 피해"));
  if (maxHp.length) discounts.push({ kind: "최대 체력 비례", slots: maxHp });
  const execute = slotsWhere(card, (s) => has(s, "처형"));
  if (execute.length) discounts.push({ kind: "처형", slots: execute });

  const sustain = slotsWhere(card, (s) => has(s, "회복"));
  const cc = slotsWhere(card, (s) => s.effects.some((tag) => CC_TAGS.has(tag)));
  // 온히트 하나만 있어도 평타 챔피언으로 보면 거의 전원이 걸린다. 나미·오리아나
  // 까지 "화력의 축이 기본 공격" 이라는 말이 붙었다. 하위 클래스가 먼저다.
  const dps =
    AUTO_SUBCLASSES.has(card.wiki?.subclass ?? "") &&
    card.spells.some((s) => has(s, "기본 공격 강화") || has(s, "공격 속도 증가"));
  const zoning = card.spells.some((s) => has(s, "광역")) && profile.mix !== "물리";

  return { champion: card.name, profile, discounts, sustain, cc, dps, zoning, stats: rankStats(profile, { discounts, sustain, cc, dps, zoning }) };
}

/**
 * 올릴 순서를 정한다.
 *
 * 저항이 먼저인 것은 피해가 한 유형으로만 들어올 때뿐이다. 섞여 들어오면 한쪽을
 * 올려 봐야 절반만 막히므로 체력이 앞에 온다. 최대 체력 비례 피해가 있으면 그
 * 체력조차 값이 깎이므로 저항과 함께 올리라는 말이 되어야 한다.
 */
function rankStats(
  profile: ItemClaims["profile"],
  rest: Pick<ItemClaims, "discounts" | "sustain" | "cc" | "dps" | "zoning">,
): CounterStat[] {
  const stats: CounterStat[] = [];
  const maxHp = rest.discounts.some((d) => d.kind === "최대 체력 비례");

  if (profile.mix === "물리") stats.push("방어력");
  else if (profile.mix === "마법") stats.push("마법 저항력");
  else if (profile.mix === "혼합") stats.push(maxHp ? "방어력" : "체력");

  if (!maxHp && profile.mix !== "혼합" && profile.mix !== "불명") stats.push("체력");
  if (rest.sustain.length >= 2) stats.push("치유 감소");
  if (rest.cc.length >= 3) stats.push("강인함");
  if (rest.dps) stats.push("공격 속도 감소");
  if (rest.zoning) stats.push("이동 속도");
  return stats;
}

/* ------------------------------------------------------------------ *
 * 렌더 — 주장에서 문장을 짓는다
 *
 * 표현을 여기 한 곳에만 두는 것이 요점이다. 173종이 같은 말투로 나오고, 카드의
 * 태그가 고쳐지면 문장이 따라 고쳐진다. 아이템 이름과 수치는 넣지 않는다.
 * 판올림마다 바뀌는 것을 문장에 박으면 틀린 채로 남는다.
 * ------------------------------------------------------------------ */

/** "Q 힘의 흡수" 꼴로 부른다. 슬롯 글자만 적으면 어느 스킬인지 읽는 쪽이 못 짚는다. */
function callSlots(card: ChampionCard, slots: string[], limit = 3): string {
  const named = slots.slice(0, limit).map((slot) => {
    const spell = card.spells.find((s) => s.slot === slot);
    return spell ? `${slot} ${spell.name}` : slot;
  });
  if (named.length <= 1) return named[0] ?? "";
  const head = named.slice(0, -1);
  const tail = named[named.length - 1];
  return `${head.join(", ")}${particle(head[head.length - 1], "와/과")} ${tail}`;
}

/** `josa` 는 낱말까지 붙여 돌려준다. 여기서는 조사 글자만 필요하다. */
function particle(word: string, pair: "은/는" | "이/가" | "을/를" | "와/과" | "로/으로"): string {
  return josa(word, pair).slice(word.length);
}

function profileLine(card: ChampionCard, claims: ItemClaims): string | undefined {
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

/**
 * 단서는 두 개까지 말한다.
 *
 * 저항을 깎는 스킬과 최대 체력 비례 피해가 함께 있으면(요릭 E·R) 하나만 말해서는
 * 답이 반쪽이 된다. 셋 이상은 문장이 길어지기만 하므로 앞의 둘에서 끊는다.
 */
function discountLines(card: ChampionCard, claims: ItemClaims): string[] {
  const first = claims.stats[0];
  const lines = new Map<Discount, string>();
  for (const { kind, slots } of claims.discounts) {
    const called = callSlots(card, slots);
    if (kind === "최대 체력 비례") {
      lines.set(kind, `${josa(called, "이/가")} 최대 체력에 비례하므로 체력만 크게 불려 두면 그 피해도 같이 커집니다.`);
    } else if (kind === "저항 감소") {
      lines.set(kind, `${josa(called, "이/가")} 저항 자체를 깎으므로 올려 둔 값이 그 사이에는 덜 듭니다.`);
    } else if (kind === "고정 피해") {
      lines.set(kind, `${called}의 고정 피해에는 저항이 아예 관여하지 않아 그 몫은 체력 총량으로만 버팁니다.`);
    } else if (kind === "관통") {
      lines.set(kind, `${called}에 관통이 걸려 있어 올린 저항의 일부는 그냥 뚫립니다.`);
    } else if (kind === "처형") {
      lines.set(kind, `${josa(called, "은/는")} 체력이 낮은 적을 곧바로 끊으므로 처형 구간에서 벗어날 체력 총량도 함께 봅니다.`);
    }
  }
  // 저항을 깎는 것이 가장 직접적이고, 그다음이 저항을 비껴가는 것들이다.
  const order: Discount[] = ["저항 감소", "관통", "고정 피해", "최대 체력 비례", "처형"];
  const picked = order.flatMap((kind) => (lines.has(kind) ? [lines.get(kind) as string] : [])).slice(0, 2);
  if (picked.length) return picked;
  if (first === "방어력" || first === "마법 저항력") {
    return [`저항을 깎는 스킬도 고정 피해도 없어서 올린 ${first}은 끝까지 온전히 듣습니다.`];
  }
  return [];
}

function secondLine(card: ChampionCard, claims: ItemClaims): string | undefined {
  if (claims.stats.includes("치유 감소")) {
    return `${josa(callSlots(card, claims.sustain), "이/가")} 체력을 돌려주니 결투가 길어지는 구도라면 치유 감소가 저항 다음입니다.`;
  }
  if (claims.stats.includes("강인함")) {
    return `죽는 경로는 ${josa(callSlots(card, claims.cc), "로/으로")} 이어지는 군중 제어에 묶이는 것이라 이동기가 없는 챔피언이라면 강인함을 저항보다 앞에 둘 수 있습니다.`;
  }
  if (claims.stats.includes("공격 속도 감소")) {
    return `화력의 축이 기본 공격과 공격 속도에 있어서 공격 속도를 깎으면 그만큼 덜 맞습니다.`;
  }
  if (claims.stats.includes("이동 속도")) {
    return `범위를 깔아 놓고 미는 꼴이라 저항으로 버티기보다 예고된 자리에서 걸어 나갈 이동 속도가 더 값을 합니다.`;
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * 이동 수단과 그 공백
 *
 * "언제 물어야 하나" 는 `against` 쪽에서 가장 자주 나오는 물음인데, 답이 상대의
 * 이동기와 그 재사용 대기시간에 있다. 둘 다 카드에 있으므로 통째로 도출된다.
 *
 * 여기서는 **수치를 적는다**. 손글씨에 수치를 금한 것은 판올림이 바뀌어도 글이
 * 그대로 남아 틀린 채로 굳기 때문이었다. 생성본은 판올림마다 다시 만들어지므로
 * 그 걱정이 없고, 쿨타임은 이 앱이 원래 가장 잘 아는 값이다.
 * ------------------------------------------------------------------ */

export interface EscapeClaims {
  /** 빠져나가거나 파고드는 스킬. 재사용 대기시간이 있는 것만. */
  moves: Array<{ slot: string; name: string; cooldown: number }>;
  /** 궁극기로만 움직이는가. 6레벨 전에는 없다는 뜻이다. */
  ultimateOnly: boolean;
}

export function deriveEscapeClaims(card: ChampionCard): EscapeClaims {
  const moves = card.spells
    // 라칸 E 처럼 독립 재사용 대기시간이 없는 것은 0 으로 들어온다. 그것을 "0초" 로
    // 적으면 언제나 쓸 수 있다는 말이 되므로 아예 세지 않는다.
    .filter((s) => (has(s, "이동기") || has(s, "돌진")) && (s.cooldownRank1 ?? 0) > 0)
    .map((s) => ({ slot: s.slot, name: s.name, cooldown: s.cooldownRank1 as number }));
  return { moves, ultimateOnly: moves.length > 0 && moves.every((m) => m.slot === "R") };
}

/**
 * 슬롯 문자 뒤의 조사.
 *
 * 받침으로 고르면 안 된다. 읽을 때는 "큐·더블유·이·아르" 이므로 R 만 받침이 있다.
 * "E 을 쓰게 만든" 처럼 나가면 글이 대번에 어설퍼 보인다.
 */
const SLOT_PARTICLE: Record<string, { to: string; subject: string }> = {
  P: { to: "를", subject: "가" },
  Q: { to: "를", subject: "가" },
  W: { to: "를", subject: "가" },
  E: { to: "를", subject: "가" },
  R: { to: "을", subject: "이" },
};

/** 형태가 바뀌는 스킬은 이름이 "A | B" 로 붙어 온다. 앞의 것만 부른다. */
function shortName(name: string): string {
  return name.split("|")[0].trim();
}

export function renderEscapeClaims(card: ChampionCard, claims: EscapeClaims): string {
  const { moves } = claims;
  if (moves.length === 0) {
    // 같은 말을 173 종에 똑같이 붙이면 그것만으로 기계가 쓴 티가 난다. 사거리
    // 유형은 카드에 있고 실제로 조언이 갈리는 값이라 여기서 나눈다. 원거리인데
    // 이동기가 없는 것과 근접인데 없는 것은 상대하는 쪽이 할 일이 다르다.
    const tail =
      card.rangeType === "원거리"
        ? "원거리인데도 빠져나갈 수단이 없으므로 한 번 거리를 좁히면 그대로 잡힙니다."
        : "한 번 붙잡으면 점멸을 쓰게 만들기 전까지 빠져나갈 수단이 없다는 뜻이라 진입 각이 나왔을 때 망설이지 않아도 됩니다.";
    return `${josa(card.name, "은/는")} 스스로 거리를 벌리는 스킬이 없습니다. ${tail}`;
  }
  // 1레벨 기준이라는 말을 따로 문장으로 두었더니 109 종에 똑같은 줄이 붙었다.
  // 아무 정보도 더하지 않는 군더더기라 수치 옆에 한마디로 접는다.
  const listed = moves.map((m) => `${m.slot} ${shortName(m.name)}(1레벨 ${m.cooldown}초)`).join(", ");
  const longest = moves.reduce((a, b) => (a.cooldown >= b.cooldown ? a : b));
  const head = `${card.name}의 이동 수단은 ${listed}입니다.`;
  if (claims.ultimateOnly) {
    return `${head} 궁극기 말고는 움직일 방법이 없으므로 6레벨 전이나 ${longest.slot}${SLOT_PARTICLE[longest.slot]?.subject ?? "이"} 빠진 사이가 그대로 무는 창입니다.`;
  }
  if (moves.length === 1) {
    return `${head} 이것 하나뿐이라 ${moves[0].slot}${SLOT_PARTICLE[moves[0].slot]?.to ?? "을"} 쓰게 만든 직후가 거리를 좁히거나 잘라 낼 창입니다.`;
  }
  return `${head} 여러 개를 겹쳐 빠져나가므로 하나를 뺐다고 들어가면 나머지로 살아 나갑니다. 특히 ${longest.slot} ${josa(shortName(longest.name), "이/가")} 돌아오기 전을 노립니다.`;
}

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
  const lines: TaggedClaim[] = [];
  let kind: ClaimKind = "offense";
  const w = CLAIM_WORDS[lang];
  const resist = (damage: DamageType | "혼합" | "불명") =>
    damage === "물리" ? w.armor : damage === "마법" ? w.mr : lang === "ko_KR" ? "저항" : lang === "en_US" ? "resistances" : "抗性";
  const damageWord = (damage: DamageType | "혼합" | "불명") => (damage === "물리" ? w.physical : w.magic);

  if (claims.mine.damage !== "불명" && claims.mine.damage !== "혼합") {
    const wall = claims.mine.wall;
    const name = resist(claims.mine.damage);
    const dmg = damageWord(claims.mine.damage);
    if (isHigh(wall)) {
      lines.push({ kind, text:
        lang === "ko_KR"
          ? `${me.name}의 피해는 주로 ${dmg}인데 ${enemy.name}의 ${name}이 높은 편이라 그대로는 잘 들어가지 않습니다. 관통을 섞거나 ${name}이 값을 못 하는 피해를 찾아야 합니다.`
          : lang === "en_US"
            ? `${me.name} deals mostly ${dmg} damage and ${enemy.name} has high ${name}, so raw damage falls off. Build penetration or look for damage that ignores ${name}.`
            : `${me.name}主要打${dmg}伤害，而${enemy.name}的${name}很高，硬打伤害会被吃掉。需要出穿透，或者找不吃${name}的伤害。`,
      });
    } else if (isLow(wall)) {
      lines.push({ kind, text:
        lang === "ko_KR"
          ? `${me.name}의 피해는 주로 ${dmg}이고 ${enemy.name}의 ${name}이 낮은 편이라 그대로 잘 들어갑니다.`
          : lang === "en_US"
            ? `${me.name} deals mostly ${dmg} damage and ${enemy.name} has low ${name}, so it lands hard as is.`
            : `${me.name}主要打${dmg}伤害，而${enemy.name}的${name}偏低，伤害可以直接打出来。`,
      });
    }
  }

  kind = "defense";
  if (claims.theirs.damage !== "불명" && claims.theirs.damage !== "혼합") {
    const wall = claims.theirs.wall;
    const name = resist(claims.theirs.damage);
    const dmg = damageWord(claims.theirs.damage);
    if (isLow(wall)) {
      lines.push({ kind, text:
        lang === "ko_KR"
          ? `${enemy.name}의 피해는 주로 ${dmg}인데 ${me.name}의 ${name}이 낮은 편이라 그쪽이 먼저 올릴 저항입니다.`
          : lang === "en_US"
            ? `${enemy.name} deals mostly ${dmg} damage and ${me.name} has low ${name}, so that is the stat to buy first.`
            : `${enemy.name}主要打${dmg}伤害，而${me.name}的${name}偏低，这条抗性要优先堆。`,
      });
    }
  }

  kind = "pinned";
  if (claims.pinned) {
    lines.push({ kind, text:
      lang === "ko_KR"
        ? `${josa(me.name, "은/는")} 스스로 빠져나갈 스킬이 없고 ${josa(enemy.name, "은/는")} 붙잡는 수단을 여럿 가졌습니다. 한 번 걸리면 그대로 이어 맞는 구도라 거리 관리가 먼저입니다.`
        : lang === "en_US"
          ? `${me.name} has no escape and ${enemy.name} has multiple pieces of CC. One catch chains into the rest, so spacing comes first.`
          : `${me.name}没有位移逃生手段，而${enemy.name}有多个控制。一旦被抓就会被连到底，所以走位拉扯是第一位的。`,
    });
  }

  kind = "scaling";
  if (claims.scaling === "theirs") {
    lines.push({ kind, text:
      lang === "ko_KR"
        ? `${josa(enemy.name, "은/는")} 쌓을수록 세지므로 시간이 갈수록 불리해집니다. 초반에 눌러 두는 편이 낫습니다.`
        : lang === "en_US"
          ? `${enemy.name} scales with stacks, so the game gets worse the longer it runs. Punish early.`
          : `${enemy.name}靠叠层发育，拖得越久越不利。要在前期压制。`,
    });
  } else if (claims.scaling === "mine") {
    lines.push({ kind, text:
      lang === "ko_KR"
        ? `${josa(me.name, "은/는")} 쌓을수록 세지므로 초반을 버티면 뒤로 갈수록 유리해집니다.`
        : lang === "en_US"
          ? `${me.name} scales with stacks, so surviving the early game turns the matchup around.`
          : `${me.name}靠叠层发育，熬过前期后期会越来越强。`,
    });
  }

  return lines;
}

/* ------------------------------------------------------------------ *
 * 성장 곡선
 *
 * 스택을 쌓아 커지는 챔피언은 **초반이 약하고 중후반이 세다**. 상대하는 쪽에서는
 * 이것이 곧 "언제 눌러야 하는가" 라 상성 판단에 바로 쓰인다. 어느 스킬이 무엇을
 * 쌓는지가 카드에 있으므로 통째로 도출된다.
 * ------------------------------------------------------------------ */

export interface StackClaims {
  /** 무엇을 쌓아 커지는가 */
  slots: string[];
}

export function deriveStackClaims(card: ChampionCard): StackClaims {
  return { slots: slotsWhere(card, (s) => has(s, "성장 스택")) };
}

export function renderStackClaims(card: ChampionCard, claims: StackClaims): string {
  if (claims.slots.length === 0) return "";
  const called = callSlots(card, claims.slots);
  const passiveOnly = claims.slots.every((slot) => slot === "P");
  const head = `${josa(card.name, "은/는")} ${josa(called, "로/으로")} 쌓은 것이 영구히 남아 시간이 갈수록 세집니다.`;
  const tail = passiveOnly
    ? "가장 약한 구간은 아무것도 쌓이지 않은 초반이라 그때 눌러 두지 못하면 나중에는 같은 각으로 못 잡습니다."
    : "쌓는 자리를 막는 것이 곧 성장을 늦추는 길입니다. 초반에 라인을 밀어 두거나 압박해 쌓을 틈을 주지 않아야 합니다.";
  return `${head} ${tail}`;
}

/** 주장을 두세 문장으로 편다. 문장 순서는 유형 → 단서 → 다음 스탯으로 고정한다. */
export function renderItemClaims(card: ChampionCard, claims: ItemClaims): string {
  return [profileLine(card, claims), ...discountLines(card, claims), secondLine(card, claims)]
    .filter(Boolean)
    .join(" ");
}
