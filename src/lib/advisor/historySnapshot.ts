import type { Language } from "@/i18n";
import type { ChampionCard, SpellFact } from "@/lib/knowledge/facts";
import type { RuleNotes } from "@/lib/knowledge/rules";
import { CROWD_CONTROL } from "@/lib/knowledge/crowdControl";
import { isSpellTicks } from "@/lib/knowledge/abilityTicksValidation";
import type { AdvisorAnswer } from "./answer";
import { isStoredAnswer } from "./historyValidation";

export interface HistorySource {
  patch: string;
  ddragonVersion: string;
  locale: Language;
}

type RecordValue = Record<string, unknown>;
type Validator = (value: unknown) => boolean;

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const string = (value: unknown): value is string => typeof value === "string";
const boolean = (value: unknown): boolean => typeof value === "boolean";
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const optional = (value: unknown, check: Validator): boolean => value === undefined || check(value);
const oneOf = (value: unknown, choices: readonly unknown[]): boolean => choices.includes(value);

function array(value: unknown, check: Validator): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (const entry of value) if (!check(entry)) return false;
  return true;
}

const strings = (value: unknown): boolean => array(value, string);
const version = (value: unknown): boolean => string(value) && value === value.trim() && /^\d+\.\d+(?:\.\d+)*$/.test(value);
const grade = (value: unknown): boolean => oneOf(value, ["매우 낮음", "낮음", "보통", "높음", "매우 높음"]);
const damage = (value: unknown): boolean => oneOf(value, ["물리", "마법", "혼합"]);
const attack = (value: unknown): boolean => oneOf(value, ["근접", "원거리"]);

export function isHistorySource(value: unknown): value is HistorySource {
  return record(value) && version(value.patch) && version(value.ddragonVersion)
    && oneOf(value.locale, ["ko_KR", "en_US", "zh_CN"]);
}

function numbers(value: RecordValue, keys: readonly string[]): boolean {
  return keys.every(key => finite(value[key]));
}

function optionalStrings(value: RecordValue, keys: readonly string[]): boolean {
  return keys.every(key => optional(value[key], string));
}

function stat(value: unknown): boolean {
  return record(value) && numbers(value, ["lv1", "lv6", "lv11", "lv18", "percentileLv1", "percentileLv18"])
    && grade(value.gradeLv1) && grade(value.gradeLv18) && optional(value.perLevel, finite);
}

function riot(value: unknown): boolean {
  return record(value) && optionalStrings(value, ["tagPrimary", "tagSecondary"])
    && optional(value.damageType, damage) && optional(value.attackType, attack)
    && optional(value.playstyle, entry => record(entry)
      && numbers(entry, ["damage", "durability", "crowdControl", "mobility", "utility"]));
}

function wiki(value: unknown): boolean {
  return record(value) && optionalStrings(value, ["heroType", "altType", "subclass"])
    && strings(value.subclasses) && strings(value.positions);
}

function crowdControl(value: unknown): boolean {
  return record(value) && oneOf(value.status, ["known", "borrowed", "inferred"])
    && array(value.effects, effect => record(effect) && string(effect.type)
      && Object.prototype.hasOwnProperty.call(CROWD_CONTROL, effect.type)
      && oneOf(effect.target, ["enemy", "self", "ally", "all", "nonChampion"])
      && string(effect.source) && optional(effect.condition, string));
}

function spell(value: unknown): value is SpellFact {
  return record(value) && oneOf(value.slot, ["P", "Q", "W", "E", "R"])
    && string(value.name) && string(value.text)
    && optionalStrings(value, ["summary", "cooldown", "recharge", "cost"])
    && optional(value.cooldownRank1, finite) && optional(value.maxCharges, finite)
    && optional(value.range, entry => finite(entry) || array(entry, finite))
    && array(value.damageTypes, entry => oneOf(entry, ["물리", "마법", "고정"]))
    && strings(value.effects) && record(value.ratios) && Object.values(value.ratios).every(finite)
    && optional(value.crowdControl, crowdControl)
    && optional(value.ticks, isSpellTicks)
    && optional(value.forms, forms => Array.isArray(forms) && forms.length > 0 && forms.length <= 2
      && new Set(forms.map(form => record(form) ? form.key : undefined)).size === forms.length
      && array(forms, form => record(form) && form.forms === undefined
        && oneOf(form.key, ["A", "B"]) && string(form.label) && string(form.id)
        && form.slot === value.slot && spell(form)));
}

function card(value: unknown): value is ChampionCard {
  return record(value) && string(value.id) && string(value.name) && strings(value.roleTags)
    && optionalStrings(value, ["title", "resource"]) && attack(value.rangeType) && finite(value.attackRange)
    && record(value.stats) && ["health", "armor", "magicResist", "attackDamage", "attackSpeed", "moveSpeed", "healthRegen"]
      .every(key => stat((value.stats as RecordValue)[key]))
    && record(value.damageProfile) && numbers(value.damageProfile, ["physical", "magical", "trueDamage"])
    && damage(value.damageProfile.primary)
    && record(value.scalingProfile) && numbers(value.scalingProfile, ["apSpells", "adSpells", "healthSpells"])
    && oneOf(value.scalingProfile.primary, ["AP", "AD", "혼합", "체력", "없음"])
    && strings(value.mechanics) && array(value.spells, spell)
    && optional(value.riot, riot) && optional(value.wiki, wiki);
}

function rule(value: unknown): value is RuleNotes {
  return record(value) && string(value.name) && string(value.page)
    && oneOf(value.subject, ["rune", "summoner", "gameplay"]) && strings(value.notes)
    && optional(value.notesKo, strings) && optional(value.notesZh, strings)
    && optionalStrings(value, ["nameEn", "nameZh"]);
}

export function isSnapshotAnswer(value: unknown): value is AdvisorAnswer {
  if (!record(value)) return false;
  switch (value.kind) {
    case "champion":
      return card(value.card) && isStoredAnswer({ ...value, cardId: value.card.id });
    case "spell":
      return spell(value.spell) && string(value.championName) && optional(value.card, card)
        && (value.card === undefined || (value.card as ChampionCard).id === value.championId)
        && isStoredAnswer({ ...value, slot: value.spell.slot });
    case "compare":
      return array(value.cards, card) && optional(value.inMatchup, boolean)
        && optional(value.more, boolean) && optional(value.precomputed, string)
        && isStoredAnswer({ ...value, cardIds: (value.cards as ChampionCard[]).map(entry => entry.id) });
    case "suggestion":
      return array(value.candidates, card)
        && isStoredAnswer({ ...value, candidateIds: (value.candidates as ChampionCard[]).map(entry => entry.id) });
    case "rule":
      return rule(value.rule) && isStoredAnswer({ ...value, ruleName: value.rule.name });
    case "item":
      return optional(value.askedPrice, boolean) && isStoredAnswer(value);
    case "text":
      return isStoredAnswer(value);
    default:
      return false;
  }
}
