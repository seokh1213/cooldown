import type { AdvisorData } from "../../retrieval/context";
import type { AdvisorAnswer, Fact } from "../answer";
import { aliasAt } from "@/domain/knowledge/notes/searchAliases";
import { askedRuleKinds } from "@/domain/knowledge/notes/rules";
import { asksPrice } from "../../retrieval/gameMeta";
import itemAliasFile from "../../../../../dev/data/knowledge/item-aliases.json";
import { withParticle, sentenceWith, htmlToText } from "../presentation/answerText";
import { MONSTER_NOTES } from "@/domain/knowledge/notes/monsterNotes";

/**
 * 아이템 질문의 답. 설명문을 통째로 던지지 않고 능력치·효과로 갈라 둔다.
 *
 * **모델을 거치지 않는다.** 설명문을 요약시켰더니 두 가지로 틀렸다.
 * "쇼진의 창은 궁극기에도 적용되나요" 에 "적용되지 않습니다" 라고 답했고
 * (설명문은 "챔피언 스킬" 이라 적는데 궁극기가 거기 든다는 추론을 못 한다),
 * "몰락한 왕의 검은 어떤 효과야" 에는 능력치만 읊고 고유 효과 두 개를 빠뜨렸다.
 * e4b 로 키워도 같았다. 설명문 자체가 답이므로 그대로 낸다.
 *
 * 갈라 두면 카드가 표로 그릴 수 있고, 대화에는 효과 이름과 설명만 나간다.
 * **아이템을 둘 이상 물었으면 구조를 쓰지 않는다** — 카드는 하나뿐인데 둘을 담으면
 * 한쪽이 소리 없이 사라진다. 그때는 예전처럼 설명문을 그대로 낸다.
 */
/** 방금 다룬 아이템을 가리키는 말 */
const ITEM_REFERENCE = /거기|그거|이거|그 아이템|이 아이템|\b(it|that|this)\b|这个|那个|它/i;

export function buildItemCard(
  data: AdvisorData,
  question: string,
  /** 이름을 생략했을 때 쓸 아이템. 대화에서 방금 다룬 것 — "거기 둔화 있어?" */
  recent?: string,
): AdvisorAnswer | undefined {
  const named = findItems(data, question);
  // 이름이 없어도 효과 낱말·가격·지시어("거기", "그거")를 물었으면 방금 다룬 아이템에 대한 질문이다.
  // "쇼진의 창 효과" 뒤의 "가격은?" 이 검색 벡터 길로 가 "혹시 이 자료?" 로 빠졌다(2026-09-30 브라우저 시험).
  const followsRecent =
    named.length === 0 && Boolean(recent) && (data.effectTags.some((tag) => question.includes(tag)) || asksPrice(question) || ITEM_REFERENCE.test(question));
  const items = followsRecent ? data.items.filter((item) => String(item.id) === recent).slice(0, 1) : named;
  if (items.length === 0) return undefined;
  if (items.length > 1) {
    const text = buildItemAnswer(data, question);
    return text ? { kind: "text", text } : undefined;
  }

  const [item] = items;
  const body = htmlToText(item.description ?? "");
  const asked = data.effectTags.filter((tag) => question.includes(tag));
  return {
    kind: "item",
    itemId: String(item.id),
    itemName: item.name,
    price: item.priceTotal,
    askedPrice: asksPrice(question) || undefined,
    stats: (item.statDescriptions ?? [])
      .map((line) => {
        // "공격력 <span>45</span>" → 마지막 낱말이 값, 앞이 이름. "공격 속도 25%" 도 같다.
        const text = htmlToText(line).replace(/\s+/g, " ").trim();
        const prefix = /^([+-]?\d[\d.,]*(?:%|％)?)\s*([^\d\s].*)$/.exec(text);
        if (prefix) return { label: prefix[2], value: prefix[1] };
        const suffix = /^(.+?[^\d\s])\s*([+-]?\d[\d.,]*(?:%|％)?)$/.exec(text);
        if (suffix) return { label: suffix[1], value: suffix[2] };
        const at = text.lastIndexOf(" ");
        return at < 0 ? undefined : { label: text.slice(0, at), value: text.slice(at + 1) };
      })
      .filter((stat): stat is Fact => Boolean(stat)),
    effects: (item.effects ?? [])
      .map((effect) => ({
        name: effect.name?.replace(/\s*[-–:]\s*$/, "").trim() ?? "",
        active: effect.kind === "active",
        text: htmlToText(effect.description ?? ""),
      }))
      // 이름도 설명도 없는 칸이 자료에 섞여 있다(선혈포식자). 빈 줄을 카드에 남기지 않는다.
      .filter((effect) => effect.name || effect.text),
    verdicts: asked.map((tag) => {
      const evidence = sentenceWith(body, tag);
      return { tag, yes: Boolean(evidence), evidence };
    }),
  };
}

export function buildItemAnswer(data: AdvisorData, question: string): string | undefined {
  const items = findItems(data, question);
  if (!items.length) return undefined;

  const blocks: string[] = [];
  for (const item of items) {
    const body = htmlToText(item.description ?? "");
    // 효과 낱말을 물었으면 설명문에 그 말이 있는지로 판정한다.
    // 모델에게 맡겼더니 "둔화시킵니다" 가 적혀 있는데도 "둔화 효과가 없습니다" 라고 답했다.
    const asked = data.effectTags.filter((tag) => question.includes(tag));
    const verdicts = asked.map((tag) => {
      const evidence = sentenceWith(body, tag);
      return evidence
        ? `네. ${item.name}에 ${withParticle(tag, "이", "가")} 있습니다.\n> ${evidence}`
        : `아니요. ${item.name} 설명에 ${withParticle(tag, "은", "는")} 없습니다.`;
    });
    blocks.push(
      verdicts.length > 0
        ? `${verdicts.join("\n\n")}\n\n## ${item.name}\n${body}`
        : `## ${item.name}\n${body}`,
    );
  }
  return `${blocks.join("\n\n")}\n\n_v${data.patch}_`;
}

export function findItems(data: AdvisorData, question: string, limit = 3) {
  if (!data.items?.length) return [];
  const championNames = [...data.cards.map(card => card.name), ...(data.aliases?.values() ?? [])].flat()
    .filter(name => name.length >= 2 && question.includes(name));
  const abilityQuestion = championNames.length > 0 && /패시브|스킬|단검.*떨어|(?<![a-z])[PQWER](?![a-z])|\b(?:ability|passive|skill)\b|技能|被动/i.test(question);
  const named = data.items
    .filter((item) => item.name && item.name.length >= 2 && item.description)
    .sort((a, b) => b.name.length - a.name.length);
  const found: typeof named = [];
  const taken: Array<[number, number]> = [];
  const take = (item: (typeof named)[number], index: number, length: number) => {
    if (index < 0 || found.includes(item)) return;
    if (taken.some(([start, end]) => index < end && index + length > start)) return;
    taken.push([index, index + length]);
    found.push(item);
  };
  for (const item of named) {
    if (/^귀환$|^Recall$|^回城$/i.test(item.name) && /첫\s*귀환|first\s*(?:recall|back)|第一次回城/i.test(question)) continue;
    if (abilityQuestion && item.name === "단검" && !/아이템|가격|골드|구매/.test(question)) continue;
    take(item, question.indexOf(item.name), item.name.length);
    if (found.length >= limit) return found;
  }
  /*
   * 줄임말("쇼진 몇 골드야?", "botrk passive", "中亚能挡什么"). dev/data/knowledge/item-aliases.json — 협곡 기본 아이템 id 마다 세 언어.
   * 공식 이름을 먼저 찾고, 남은 자리에서 긴 줄임말부터. 짧은 한글·영문은 낱말 경계로(`aliasAt`).
   */
  // 다른 언어 공식 이름("Blade of the Ruined King" 을 한국어 화면에서). 긴 이름부터, 영문은 낱말 경계로.
  if (data.itemNames) {
    const byIdAll = new Map(named.map((item) => [item.id, item]));
    const other = [...data.itemNames]
      .flatMap(([id, list]) => list.map((name) => ({ id, name })))
      .filter(({ id, name }) => byIdAll.get(id)?.name !== name)
      .sort((a, b) => b.name.length - a.name.length);
    for (const { id, name } of other) {
      const item = byIdAll.get(id);
      if (item) take(item, aliasAt(question, name), name.length);
      if (found.length >= limit) return found;
    }
  }
  // 룬·소환사 주문을 묻는다고 밝힌 질문에서는 줄임말로만 걸린 아이템을 보지 않는다. "리안드리 화상으로 영혼 거두는 룬 발동돼?" 는 룬 질문이다.
  if (askedRuleKinds(question).size > 0) return found;
  const byId = new Map(named.map((item) => [item.id, item]));
  // 챔피언 별명 안에 든 줄임말은 아이템이 아니다. "破败王来反野"(비에고)의 "破败" 가 몰락한 왕의 검으로 잡혔다.
  const championAliases = championNames;
  const monsterAliases = MONSTER_NOTES.flatMap(note => Object.values(note.aliases).flat())
    .filter(name => aliasAt(question, name) >= 0);
  for (const { id, alias } of itemAliasList()) {
    const item = byId.get(id);
    if (!item) continue;
    if (alias === "帽子" && question.includes("帽子戏法")) continue;
    if (alias.toLowerCase() === "tf" && !/spellblade|item|trinity/i.test(question)) continue;
    if (alias === "내셔" && !/공속|적중|아이템|템|구매|가격|골드/.test(question)) continue;
    if (alias.toLowerCase() === "cleaver" && !/armou?r|shred|stacks?|item|buy/i.test(question)) continue;
    if (alias === "정령" && championAliases.length > 0 && !/아이템|\b템\b|구매|사야|정령의 형상/i.test(question)) continue;
    if ([...championAliases, ...monsterAliases].some((name) => name !== alias && name.includes(alias))) continue;
    take(item, aliasAt(question, alias), alias.length);
    if (found.length >= limit) break;
  }
  return found;
}

let itemAliasCache: Array<{ id: string; alias: string }> | null = null;
function itemAliasList(): Array<{ id: string; alias: string }> {
  itemAliasCache ??= Object.entries((itemAliasFile as { aliases: Record<string, Record<string, string[]>> }).aliases)
    .flatMap(([id, byLang]) => Object.values(byLang).flat().map((alias) => ({ id, alias })))
    .sort((a, b) => b.alias.length - a.alias.length);
  return itemAliasCache;
}
