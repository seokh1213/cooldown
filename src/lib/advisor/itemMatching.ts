import { aliasAt } from "@/lib/knowledge/searchAliases";
import { askedRuleKinds } from "@/lib/knowledge/rules";
import itemAliasFile from "../../../knowledge/item-aliases.json";
import type { AdvisorData } from "./context";
import { detectStats } from "./statQuery";

function shopName(alias: string, name: string): boolean {
  if (detectStats(alias).length) return false;
  // Riot's shop keywords include generic effects as well as names.
  if (/^[A-Za-z]+$/.test(alias)) return alias.length >= 2 && alias.length <= 3;
  if (/[一-鿿]/.test(alias)) return name.includes(alias);
  return /[가-힣]/.test(alias);
}

function nameForms(name: string): string[] {
  const omittedConnector = name.replace(/의\s+/g, " ").replace(/[之的]/g, "");
  return [...new Set([name, omittedConnector, name.replace(/\s+/g, ""), omittedConnector.replace(/\s+/g, "")])];
}

type Item = AdvisorData["items"][number];
const indexes = new WeakMap<AdvisorData, { named: Item[]; aliases: Array<{ item: Item; alias: string }>;
  otherNames: Array<{ item: Item; name: string }>; shopAliases: Array<{ item: Item; alias: string }> }>();

function itemIndex(data: AdvisorData) {
  const previous = indexes.get(data);
  if (previous) return previous;
  const named = data.items.filter(item => item.name && item.name.length >= 2 && item.description && item.availableOnMap11 !== false)
    .sort((a, b) => b.name.length - a.name.length);
  const byId = new Map(named.map(item => [String(item.id), item]));
  const aliases = itemAliasList().flatMap(({ id, alias }) => {
    const item = byId.get(id);
    return item ? [{ item, alias }] : [];
  });
  const otherNames = [...data.itemNames ?? new Map(named.map(item => [String(item.id), [item.name!]]))].flatMap(([id, names]) => {
    const item = byId.get(id);
    return item ? names.flatMap(nameForms).filter(name => item.name !== name).map(name => ({ item, name })) : [];
  }).sort((a, b) => b.name.length - a.name.length);
  const owners = new Map<string, Set<string>>();
  for (const item of named) for (const alias of item.aliases ?? []) {
    const ids = owners.get(alias) ?? new Set<string>();
    ids.add(String(item.id)); owners.set(alias, ids);
  }
  const shopAliases = named.flatMap(item => (item.aliases ?? [])
    .filter(alias => shopName(alias, item.name!) && owners.get(alias)?.size === 1).map(alias => ({ item, alias })));
  const index = { named, aliases, otherNames, shopAliases };
  indexes.set(data, index);
  return index;
}

export function findItems(data: AdvisorData, question: string, limit = 3) {
  const { named, aliases, otherNames, shopAliases } = itemIndex(data);
  const found: typeof named = [];
  const taken: Array<[number, number]> = [];
  const take = (item: (typeof named)[number], index: number, length: number) => {
    if (index < 0 || found.includes(item)) return;
    if (taken.some(([start, end]) => index < end && index + length > start)) return;
    taken.push([index, index + length]);
    found.push(item);
  };
  for (const item of named) {
    take(item, aliasAt(question, item.name), item.name.length);
    if (found.length >= limit) return found;
  }
  /*
   * 줄임말("쇼진 몇 골드야?", "botrk passive", "中亚能挡什么"). knowledge/item-aliases.json — 협곡 기본 아이템 id 마다 세 언어.
   * 공식 이름을 먼저 찾고, 남은 자리에서 긴 줄임말부터. 짧은 한글·영문은 낱말 경계로(`aliasAt`).
   */
  // 다른 언어 공식 이름("Blade of the Ruined King" 을 한국어 화면에서). 긴 이름부터, 영문은 낱말 경계로.
  for (const { item, name } of otherNames) {
    take(item, aliasAt(question, name), name.length);
    if (found.length >= limit) return found;
  }
  // 룬·소환사 주문을 묻는다고 밝힌 질문에서는 줄임말로만 걸린 아이템을 보지 않는다. "리안드리 화상으로 영혼 거두는 룬 발동돼?" 는 룬 질문이다.
  if (askedRuleKinds(question).size > 0) return found;
  // 챔피언 별명 안에 든 줄임말은 아이템이 아니다. "破败王来反野"(비에고)의 "破败" 가 몰락한 왕의 검으로 잡혔다.
  const championAliases = [...(data.aliases?.values() ?? [])].flat().filter((alias) => alias.length >= 2 && question.includes(alias));
  for (const { item, alias } of aliases) {
    if (championAliases.some((name) => name !== alias && name.includes(alias))) continue;
    take(item, aliasAt(question, alias), alias.length);
    if (found.length >= limit) break;
  }
  if (found.length < limit) {
    for (const { item, alias } of shopAliases) {
      if (championAliases.some(name => name.includes(alias))) continue;
      take(item, aliasAt(question, alias), alias.length);
      if (found.length >= limit) return found;
    }
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
