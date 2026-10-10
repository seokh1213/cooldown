/** 각 하위 질문의 이름·슬롯·조회 초점을 한 번 읽어 대화와 자료 계획이 공유한다. */
import type { AdvisorData } from "../conversation/context";
import { detectSlot } from "../conversation/context";
import { detectChampionMentions, type ChampionMention } from "./intent";
import { detectSpellFocus } from "./spellFocus";
import type { RequestIntent } from "./requestIntent";
import abilityAliases from "../../../../dev/data/knowledge/ability-aliases.json";
import { aliasAt } from "@/domain/knowledge/searchAliases";

export interface ResolvedQuestion {
  text: string;
  champions: ChampionMention["card"][];
  mentions: ChampionMention[];
  slot?: string;
  slotIndex?: number;
  spellFocus: ReturnType<typeof detectSpellFocus>;
  requestIntent?: RequestIntent;
  /** 원문을 다시 쓰지 않고 특정 상성을 요청한다. mentions는 원문의 위치를 유지한다. */
  matchup?: { mine: ChampionMention["card"]; enemy: ChampionMention["card"] };
}
export type QuestionInput = string | ResolvedQuestion;

export function championFreeText(resolved: ResolvedQuestion): string {
  let text = resolved.text;
  for (const mention of [...resolved.mentions].sort((a, b) => b.index - a.index)) {
    text = text.slice(0, mention.index) + "x".repeat(mention.length) + text.slice(mention.index + mention.length);
  }
  return text;
}

export function canonicalChampionQuestion(resolved: ResolvedQuestion): string {
  let text = resolved.text;
  for (const mention of [...resolved.mentions].sort((a, b) => b.index - a.index)) {
    text = text.slice(0, mention.index) + mention.card.name + text.slice(mention.index + mention.length);
  }
  return text;
}

export function resolveQuestion(input: QuestionInput, data: AdvisorData): ResolvedQuestion {
  if (typeof input !== "string") return input;
  const mentions = detectChampionMentions(data, input).filter(mention =>
    !/^\s*(?:말고|이\s*아니라|가\s*아니라)/.test(input.slice(mention.index + mention.length)));
  const letter = /(^|[^A-Za-z])([QWERqwer])($|[^A-Za-z])/.exec(input);
  const slotIndex = letter ? letter.index + letter[1].length : undefined;
  const champions = mentions.map(m => m.card);
  const aliases = abilityAliases.aliases as Record<string, Record<string, string[]>>;
  const namedSlots = champions.length === 1 ? champions[0].spells.filter(spell =>
    [spell.name, ...(aliases[champions[0].id]?.[spell.slot] ?? [])].some(name => aliasAt(input, name) >= 0)).map(spell => spell.slot) : [];
  const slot = detectSlot(input) ?? (new Set(namedSlots).size === 1 ? namedSlots[0] : undefined);
  return { text: input, mentions, champions, slot, slotIndex, spellFocus: detectSpellFocus(input) };
}
