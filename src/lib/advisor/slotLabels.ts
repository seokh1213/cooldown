import type { ChampionCard } from "@/lib/knowledge/facts";

/**
 * 스킬 이름 앞에 슬롯 문자를 붙인다.
 *
 * 재료에는 `오공 Q 파쇄격(…)` 처럼 슬롯이 붙어 들어가고 페르소나도 "슬롯 문자와
 * 이름을 함께 쓰라" 고 이른다. 그래도 0.8B 는 산문으로 옮기면서 슬롯을 떨군다 —
 * "럼블의 화염방사기나 고철장 거인의 피해가". 이름만으로는 어느 키인지 모르니 읽는
 * 사람이 스킬 표를 다시 뒤져야 한다. 지시로 이길 수 없으면 나온 글을 고친다.
 *
 * 붙이지 않는 것
 *   이미 붙은 것      "Q 화염방사기", "Q스킬 화염방사기", "화염방사기(Q)"
 *   두 글자 이하 이름 공포·도약·반격 같은 낱말은 스킬이 아닌 뜻으로도 흔히 쓴다.
 *                     카드 865개 스킬 중 90개가 이 길이다.
 *   효과 태그와 같은 이름  "매혹" 은 스킬 이름이면서 효과 이름이다.
 *
 * "교활한 휩쓸기 / 파멸의 일격" 처럼 형태가 둘인 이름은 한쪽만 써도 알아본다.
 * 긴 이름을 먼저 맞춰, "파멸의 궤적" 이 "심판의 궤적 | 파멸의 궤적" 안에서 따로
 * 걸리지 않게 한다.
 */
export function labelSlots(text: string, cards: ChampionCard[]): string {
  const tags = new Set(cards.flatMap((card) => card.spells.flatMap((spell) => spell.effects ?? [])));
  const names: Array<{ name: string; slot: string }> = [];
  for (const card of cards) {
    for (const spell of card.spells) {
      const forms = [spell.name, ...spell.name.split(/\s*[/|]\s*/)];
      for (const form of new Set(forms)) {
        if (form === card.name || form.replace(/\s/g, "").length < 3 || tags.has(form)) continue;
        names.push({ name: form, slot: spell.slot });
      }
    }
  }
  if (names.length === 0) return text;
  names.sort((a, b) => b.name.length - a.name.length);
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const slotOf = new Map(names.map((entry) => [entry.name, entry.slot]));
  /*
   * 이름 앞에 붙은 글자 하나까지 함께 잡는다. 없으면 붙이고, 틀렸으면 바로잡는다.
   *
   * 0.8B 는 슬롯을 빼먹기만 하는 것이 아니라 틀리게도 붙인다. 피오라 스킬 다섯 개를
   * 전부 "P 치명적인 검무 · P 찌르기 · P 응수 …" 로 적었고, 아트록스에는 슬롯에 없는
   * 글자를 붙였다("A 다르킨의 검"). 이름은 카드에 있으니 어느 키인지는 코드가 안다.
   *
   * 앞 글자는 영문 대문자 하나만 본다. "IQ" 나 "AD" 처럼 낱말의 끝 글자는 건드리지
   * 않도록 그 앞이 영문자가 아니어야 한다.
   */
  /*
   * 이름 바로 앞이 한글이면 그 이름은 다른 낱말의 일부다. "되찌르기" 안의 "찌르기"(피오라 Q)에
   * Q 를 붙여 "되Q 찌르기" 가 됐다 — 응수의 되찌르기가 Q 의 효과처럼 읽혔다.
   */
  const pattern = new RegExp(
    `(?<![A-Za-z])(?:([A-Z])(\\s*스킬\\S?)?([\\s'"‘“*(（]*))?(?<![가-힣])(${names.map((entry) => escape(entry.name)).join("|")})`,
    "g",
  );
  return text.replace(pattern, (whole, letter: string | undefined, skill = "", gap = "", name: string, offset: number) => {
    const slot = slotOf.get(name) ?? "";
    if (letter) return letter === slot ? whole : `${slot}${skill}${gap}${name}`;
    const after = text.slice(offset + whole.length, offset + whole.length + 4);
    // "회전격(R)" 처럼 뒤에 붙은 표기는 두고, 틀렸으면 아래에서 고친다
    if (/^\s*[(（][PQWER][)）]/.test(after)) return whole;
    return `${slot} ${name}`;
  }).replace(
    new RegExp(`(${names.map((entry) => escape(entry.name)).join("|")})(\\s*[(（])([PQWER])([)）])`, "g"),
    (whole, name: string, open: string, letter: string, close: string) => {
      const slot = slotOf.get(name);
      return slot && slot !== letter ? `${name}${open}${slot}${close}` : whole;
    },
  );
}
