import type { ChampionCard } from "../../../../domain/knowledge/cards/contracts";
import type { AdvisorAnswer } from "../../answers/answer";
import { translateDamage, translateScaling, translateTag } from "../../answers/presentation/promptLocale";
import type { Language } from "../../../../shared/i18n";
import type { Material } from "./contracts";

export function material(answer: AdvisorAnswer, lang: Language): Material | undefined {
  /*
   * 상성 답에도 돌려야 한다.
   *
   * 예전에는 `kind !== "champion"` 이면 그냥 나갔다. 그래서 **상성 질문의 해설은
   * 아무 검사도 받지 않았다.** 실제로 "오공은 마법으로 주 피해를 받습니다"(카드에는
   * 물리라고 적혀 있다) 가 그대로 화면에 나갔다. 챔피언이 둘이라 재료가 두 벌일 뿐
   * 검사할 것은 같다.
   */
  const cards: ChampionCard[] =
    answer.kind === "champion" ? [answer.card] : answer.kind === "compare" ? answer.cards : [];
  if (cards.length === 0) return undefined;

  const effectsBySlot = new Map<string, Set<string>>();
  const slotByName = new Map<string, string>();
  const textBySlot = new Map<string, string>();
  for (const card of cards) {
    for (const spell of card.spells) {
      // 챔피언이 둘이면 슬롯이 겹친다. 효과는 합쳐서 본다. 어느 쪽 Q 인지까지
      // 가리려다 멀쩡한 문장을 버리는 편이 더 나쁘다.
      const seen = effectsBySlot.get(spell.slot) ?? new Set<string>();
      for (const tag of spell.effects ?? []) seen.add(tag);
      effectsBySlot.set(spell.slot, seen);
      slotByName.set(spell.name, spell.slot);
      textBySlot.set(spell.slot, `${textBySlot.get(spell.slot) ?? ""} ${spell.summary ?? ""} ${spell.text ?? ""}`);
    }
  }
  const allTags = [...new Set(cards.flatMap((card) => card.spells.flatMap((spell) => spell.effects ?? [])))].map(
    (key) => ({ key, surface: translateTag(key, lang) }),
  );

  const notes =
    answer.kind === "champion"
      ? [...(answer.notes?.playing ?? []), ...(answer.notes?.against ?? [])]
      : answer.kind === "compare"
        ? [...(answer.notes?.mine ?? []), ...(answer.notes?.enemy ?? [])]
        : [];
  const noteSentences = notes
    .flatMap((note) => note.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 10);

  // 누구 스킬인지 적어 둔다. 챔피언이 둘일 때 모델이 남의 스킬을 내 것이라고
  // 쓰는 일이 잦은데, 이것 없이는 잡을 수가 없다.
  const ownerByName = new Map<string, string>();
  for (const card of cards) for (const spell of card.spells) ownerByName.set(spell.name, card.name);

  const profiles = cards.map((card) => ({
    name: card.name,
    damage: card.damageProfile.primary,
    scaling: card.scalingProfile.primary,
  }));
  const cardLines = cards.flatMap((card) => [
    `${card.name} ${translateDamage(card.damageProfile.primary, lang)} ${translateScaling(card.scalingProfile.primary, lang)} ${card.wiki?.subclass ?? ""}`,
    ...card.spells.map(
      (spell) => `${card.name} ${spell.slot} ${spell.name} ${(spell.effects ?? []).map((tag) => translateTag(tag, lang)).join(" ")}`,
    ),
  ]);
  return { lang, effectsBySlot, slotByName, textBySlot, allTags, noteSentences, profiles, ownerByName, cardLines };
}
