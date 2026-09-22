import type {
  NormalizedDamageEffect,
  NormalizedSummonerSpell,
} from "../../../src/types/combatNormalized";

interface RawSummonerSpell {
  key?: string;
  name?: string;
  tooltip?: string;
  description?: string;
  cooldown?: unknown[];
  image?: { full?: string };
  modes?: unknown[];
}

function stringsOnly(values: unknown[] | undefined): string[] {
  return (values ?? []).filter(
    (value): value is string => typeof value === "string",
  );
}

const IGNITE_DAMAGE_BY_LEVEL = Array.from(
  { length: 18 },
  (_, index) => 90 + index * 20,
);

function damageEffects(id: string): NormalizedDamageEffect[] {
  if (id !== "SummonerDot") return [];
  return [{
    id: "ignite-total-damage",
    damageType: "true",
    target: "champion",
    valuesByLevel: IGNITE_DAMAGE_BY_LEVEL,
    durationSeconds: 5,
  }];
}

export function normalizeSummonerSpells(raw: unknown): NormalizedSummonerSpell[] {
  if (!raw || typeof raw !== "object") return [];
  const data = (raw as { data?: Record<string, RawSummonerSpell> }).data ?? {};

  return Object.entries(data).map(([id, spell]) => ({
    id,
    key: spell.key ?? id,
    name: spell.name ?? id,
    /*
     * 짧은 설명을 따로 담는다.
     *
     * 툴팁에는 `{{ shieldduration }}` 같은 치환자가 그대로 남아 있다. 라이엇이
     * 값을 안 채워 주고 CommunityDragon 에도 없다 — `datavalues` 가 빈 객체이고
     * `effect` 는 전부 0 이다. 열한 주문 중 아홉이 이 꼴이라 화면에 물음표가
     * 줄줄이 나왔다.
     *
     * `description` 은 값이 안 들어간 대신 깨끗하다("잠시 동안 보호막을 얻습니다").
     * 화면은 이것을 먼저 보이고, 치환자가 없는 툴팁만 덧붙인다.
     */
    summary: spell.description ?? "",
    /*
     * 툴팁을 그대로 둔다.
     *
     * 한때 점화 하나만 `{{ tooltiptruedamagecalculation }}` 을 "90 - 430" 으로,
     * `{{ grievousamount*100 }}` 을 "40" 으로 바꿔 넣었다. 출처가 없는 값이라 패치가
     * 바뀌어도 아무도 모른다. 아홉 주문 중 하나만 수치가 살아 있어 보이는 것도 이
     * 때문이었다.
     *
     * 값을 주는 오라클을 찾아봤지만 없다 — Data Dragon 은 `datavalues` 가 빈 객체이고
     * `effect` 가 전부 0 이며, CommunityDragon 과 Fandom 모듈에도 없다. 그래서 값을
     * 지어내지 않고, 화면은 치환자가 남은 툴팁 대신 깨끗한 `description` 을 쓴다.
     */
    tooltip: spell.tooltip || spell.description || "",
    cooldown: (spell.cooldown ?? []).filter(
      (value): value is number => typeof value === "number",
    ),
    iconPath: spell.image?.full ?? "",
    modes: stringsOnly(spell.modes),
    damageEffects: damageEffects(id),
  }));
}
