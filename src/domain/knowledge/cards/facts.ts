/**
 * 챔피언 "사실 카드(fact card)" 생성
 *
 * 정규화 데이터(스탯/스킬 툴팁)에서 LLM 이 바로 쓸 수 있는 파생 사실을 계산한다.
 * - 레벨별 스탯 + 전체 챔피언 대비 백분위/등급 ("마법 저항력: 매우 낮음")
 * - 스킬별 피해 유형, 효과 태그 (마법 저항력 감소, 둔화, 보호막 …)
 * - 챔피언 단위 피해 프로필 (주 피해 유형)
 *
 * 여기서 만드는 값은 전부 데이터에서 결정적으로 도출되므로 LLM 이 지어낼 여지를 줄인다.
 */
import type {
  ChampionCard,
  ChampionCardBuilder,
  DamageType,
  SpellFact,
  SpellFormFact,
  SpellOverride,
  SpellOverrides,
  StatName,
  StatSnapshot,
} from "./contracts";
import { percentileOf, STAT_NAMES, toGrade, valueOf } from "./stats";
import type { ChampionSpellSlot } from "../../game/types/combatNormalized";
import { formatLevels, round, stripHtml } from "../text/text";
import { detectDamageTypes, detectEffects } from "./facts-analysis";
import { abilityCausesDash, championMovesItself } from "./facts-movement";
import { buildScalingProfile, detectRatios, ratiosFromSimulation } from "./facts-ratios";
import type { ChampionAbility, ChampionRecord, RiotChampionMeta, WikiChampionMeta } from "./sourceRecords";

// ---------------------------------------------------------------------------
// 툴팁 텍스트 → 효과 태그 (한국어 툴팁 기준)
// ---------------------------------------------------------------------------
const SLOTS: ChampionSpellSlot[] = ["P", "Q", "W", "E", "R"];

const RIOT_DAMAGE_LABEL: Record<string, "물리" | "마법" | "혼합"> = {
  kPhysical: "물리",
  kMagic: "마법",
  kMixed: "혼합",
};

/**
 * 대시 태그를 정한다.
 *
 * `이동기` 는 시전자가 스스로 움직이는가 — 이탈·진입을 판단할 때 쓴다.
 * `돌진` 은 돌진 판정이 생기는가 — 뽀삐 W 굳건한 태세로 막히는지를 판단할 때 쓴다.
 * 쓰레쉬 W 는 아군이 움직이므로 `돌진` 만 붙는다.
 */
function dashTags(
  wiki: { dash: boolean; self: boolean } | undefined,
  text: string,
  championName: string,
): string[] {
  if (wiki) {
    return wiki.self ? ["이동기", "돌진"] : ["돌진"];
  }
  return [
    ...(championMovesItself(text, championName) ? ["이동기"] : []),
    ...(abilityCausesDash(text) ? ["돌진"] : []),
  ];
}

/**
 * 도출된 태그에 보정을 얹는다. 중복은 합치고 순서는 도출분을 앞에 둔다.
 *
 * 보정은 **도출 뒤에** 얹는다. 규칙이 나중에 그 값을 잡게 되면 보정은 아무 일도
 * 하지 않으므로, 규칙을 고칠 때 보정을 같이 지울 필요가 없다.
 */
function applyEffectOverride(derived: string[], override: SpellOverride | undefined): string[] {
  if (!override) return derived;
  const removed = new Set(override.remove ?? []);
  const kept = derived.filter((tag) => !removed.has(tag));
  const added = (override.add ?? []).filter((tag) => !kept.includes(tag) && !removed.has(tag));
  return [...kept, ...added];
}

/** 유형을 못 밝힌 스킬에만 보정을 쓴다. 툴팁이 말한 것을 덮지 않는다. */
function applyDamageTypeOverride(
  derived: DamageType[],
  override: SpellOverride | undefined,
): DamageType[] {
  if (!override?.damageTypes || derived.length > 0) return derived;
  return override.damageTypes;
}

function buildSpellForms(ability: ChampionAbility): SpellFormFact[] | undefined {
  if (!ability.forms?.length) return undefined;
  return ability.forms.map(form => {
    const text = stripHtml(form.bodyHtml);
    // 탄환 재충전과 연속 시전 쿨은 원문에서 서로 다른 값이다.
    const recharge = text.match(/재장전 대기시간\s+([\d./]+)초/)
      ?? text.match(/([\d./]+)s\s+Ammo Recharge/i)
      ?? text.match(/([\d./]+)秒充能时间/);
    return {
      key: form.key, label: form.label, id: form.id, slot: ability.slot, name: form.name, text,
      cooldown: formatLevels(form.cooldownSeconds), cooldownRank1: form.cooldownSeconds[0],
      recharge: recharge?.[1], damageTypes: detectDamageTypes(text), effects: detectEffects(text),
      ratios: detectRatios(text),
    };
  });
}

export function createChampionCardBuilder(
  champions: ChampionRecord[],
  riotMeta: Map<string, RiotChampionMeta> = new Map(),
  wikiMeta: Map<string, WikiChampionMeta> = new Map(),
  /** 위키에서 받은 대시 판정. `"Yasuo:E"` → `{ dash, self }` */
  dashes: Record<string, { dash: boolean; self: boolean }> = {},
  /**
   * 툴팁이 말하지 않는 것을 사람이 채운 값. `"Annie:W"` → `{ add, why, source }`
   *
   * 파일을 읽어 오는 일은 **부르는 쪽**이 한다. 이 모듈은 브라우저에서도 쓰이므로
   * `fs` 를 알면 안 된다. 대시 판정을 넘겨받는 것과 같은 방식이다.
   */
  overrides: SpellOverrides = {},
  /** CDragon BIN 에서 받은 시전 사거리. `"Zed:R"` → 625. 파일 읽기는 대시 판정처럼 부르는 쪽이 한다. */
  ranges: Record<string, number | number[]> = {},
): ChampionCardBuilder {
  // 스탯별 전체 분포를 미리 계산 (백분위용)
  const distributions = new Map<string, number[]>();
  for (const stat of STAT_NAMES) {
    for (const level of [1, 18]) {
      distributions.set(
        `${stat}:${level}`,
        champions.map((c) => valueOf(c, stat, level)),
      );
    }
  }

  const buildStats = (champ: ChampionRecord): Record<StatName, StatSnapshot> => {
    const out = {} as Record<StatName, StatSnapshot>;
    for (const stat of STAT_NAMES) {
      const lv1 = valueOf(champ, stat, 1);
      const lv18 = valueOf(champ, stat, 18);
      const p1 = percentileOf(lv1, distributions.get(`${stat}:1`) ?? []);
      const p18 = percentileOf(lv18, distributions.get(`${stat}:18`) ?? []);
      out[stat] = {
        perLevel: champ.baseStats[stat].perLevel,
        lv1: round(lv1),
        lv6: round(valueOf(champ, stat, 6)),
        lv11: round(valueOf(champ, stat, 11)),
        lv18: round(lv18),
        percentileLv1: p1,
        percentileLv18: p18,
        gradeLv1: toGrade(p1),
        gradeLv18: toGrade(p18),
      };
    }
    return out;
  };

  const build = (championId: string): ChampionCard | undefined => {
    const champ = champions.find((c) => c.id === championId);
    if (!champ) return undefined;

    const spells: SpellFact[] = SLOTS.filter((slot) => champ.abilities?.[slot]).map((slot) => {
      const ability = champ.abilities[slot] as ChampionAbility;
      const text = stripHtml(ability.bodyHtml);
      const summary = ability.summary ? stripHtml(ability.summary) : undefined;
      return {
        slot,
        forms: buildSpellForms(ability),
        name: ability.name,
        summary,
        text,
        cooldown: formatLevels(ability.cooldownSeconds),
        cooldownRank1: ability.cooldownSeconds?.[0],
        recharge: formatLevels(ability.rechargeSeconds),
        maxCharges: ability.maxCharges,
        cost: formatLevels(ability.cost?.values),
        range: ranges[`${champ.id}:${slot}`],
        damageTypes: applyDamageTypeOverride(detectDamageTypes(text), overrides[`${champ.id}:${slot}`]),
        // 이동기와 돌진은 규칙표로 잡지 않는다.
        //
        // **위키 판정을 먼저 쓴다.** LoL Wiki 는 대시를 `{{tip|dash}}` 로 표시하므로
        // 낱말을 추정할 필요가 없고, 누가 움직이는지도 영어 원문에서 가릴 수 있다.
        // 한국어 툴팁 정규식으로는 "아군이 쓰레쉬에게 돌진합니다"(쓰레쉬 W, 아군이 이동)와
        // "돌진하는 적을 막습니다"(뽀삐 W, 남의 돌진)를 끝내 못 갈랐다.
        //
        // 위키에 없는 챔피언(출시 직후)만 툴팁 추정으로 내려간다.
        effects: applyEffectOverride(
          [
            // 이 챔피언의 다른 스킬 이름은 지우고 본다. "공포 감지" 가 공포로 잡혔다.
            ...detectEffects(text, Object.values(champ.abilities).map((other) => other?.name ?? "")),
            ...dashTags(dashes[`${champ.id}:${ability.slot}`], text, champ.name),
          ],
          overrides[`${champ.id}:${slot}`],
        ),
        // 계수는 시뮬레이션 항(구조화된 값)을 우선하고, 없으면 툴팁 표기에서 뽑는다
        ratios: { ...detectRatios(text), ...ratiosFromSimulation(ability) },
      };
    });

    let physical = 0;
    let magical = 0;
    let trueDamage = 0;
    for (const s of spells) {
      if (s.damageTypes.includes("물리")) physical += 1;
      if (s.damageTypes.includes("마법")) magical += 1;
      if (s.damageTypes.includes("고정")) trueDamage += 1;
    }
    const meta = riotMeta.get(champ.id);
    const wiki = wikiMeta.get(champ.id);
    // 역할 태그는 라이엇 메타(순서 있는 roles)를 우선한다
    const roleTags = (meta?.roles?.length ? meta.roles : champ.tags ?? []).map(
      (r) => r.charAt(0).toUpperCase() + r.slice(1),
    );
    // 기본 공격 의존 역할은 물리 가중
    if (roleTags.includes("Marksman")) physical += 2;
    if (roleTags.includes("Mage")) magical += 1;
    let primary: ChampionCard["damageProfile"]["primary"] = "혼합";
    if (physical >= magical * 2) primary = "물리";
    else if (magical >= physical * 2) primary = "마법";

    const mechanics = Array.from(new Set(spells.flatMap((s) => s.effects)));

    return {
      id: champ.id,
      name: champ.name,
      title: champ.title,
      roleTags,
      // 자원 이름은 스킬 비용 표기에서 얻는다 (예: 마나, 기력, 열기)
      resource: SLOTS.map((slot) => champ.abilities?.[slot]?.cost?.resource).find(Boolean),
      wiki: wiki
        ? {
            heroType: wiki.heroType,
            altType: wiki.altType,
            subclass: wiki.subclasses[0],
            subclasses: wiki.subclasses,
            positions: wiki.positions,
          }
        : undefined,
      riot: meta
        ? {
            tagPrimary: meta.tagPrimary,
            tagSecondary: meta.tagSecondary,
            damageType: meta.damageType ? RIOT_DAMAGE_LABEL[meta.damageType] : undefined,
            attackType: meta.attackType === "ranged" ? "원거리" : meta.attackType === "melee" ? "근접" : undefined,
            playstyle: meta.playstyle,
          }
        : undefined,
      // 사거리 판정은 라이엇 attackType 을 우선하고, 없으면 사거리 수치로 본다
      rangeType:
        meta?.attackType === "ranged"
          ? "원거리"
          : meta?.attackType === "melee"
            ? "근접"
            : champ.baseStats.attackRange.base >= 300
              ? "원거리"
              : "근접",
      attackRange: champ.baseStats.attackRange.base,
      stats: buildStats(champ),
      damageProfile: { physical, magical, trueDamage, primary },
      scalingProfile: buildScalingProfile(spells),
      mechanics,
      spells,
    };
  };

  const find = (query: string): ChampionRecord | undefined => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    return (
      champions.find((c) => c.id.toLowerCase() === q) ??
      champions.find((c) => c.name.replace(/\s+/g, "").toLowerCase() === q) ??
      champions.find((c) => c.name.replace(/\s+/g, "").toLowerCase().includes(q)) ??
      champions.find((c) => c.id.toLowerCase().includes(q))
    );
  };

  return {
    build,
    buildAll: () => champions.map((c) => build(c.id)).filter((c): c is ChampionCard => !!c),
    find,
  };
}
