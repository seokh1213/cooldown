/**
 * 챔피언 이름 찾기 시험 — 다른 언어 이름
 *
 * 한국어 화면에서 영어·중국어 이름으로 물어도 챔피언을 알아봐야 한다. 낱말 속 글자에
 * 걸리면 안 된다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe,test } from "node:test";
import type { ChampionCard } from "../../../../src/domain/knowledge/cards/contracts";
import { championAliases,type AdvisorData } from "../../../../src/features/advisor/retrieval/context";
import { detectChampions } from "../../../../src/features/advisor/understanding/champions/intent";
import { matchupPair,matchupSides,matchupSidesByPhrase } from "../../../../src/features/advisor/understanding/requests/matchupSides";
import { PUBLIC_DATA_ROOT,resolvePatchVersion } from "../../../scripts/advisor/lib/data";

const dir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (JSON.parse(fs.readFileSync(path.join(dir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const names = (JSON.parse(fs.readFileSync(path.join(dir, "champion-names.json"), "utf8")) as { names: Record<string, string[]> }).names;
const items = (JSON.parse(fs.readFileSync(path.join(dir, "..", "items-normalized-ko_KR.json"), "utf8")) as { items: unknown[] }).items;
const data = {
  cards,
  items,
  cardById: new Map(cards.map((c) => [c.id, c])),
  aliases: championAliases(cards, names),
} as unknown as AdvisorData;
const ids = (text: string) => detectChampions(data, text).map((c) => c.id);
const eqTest = (actual: () => unknown, expected: unknown, message: string) =>
  test(message, () => assert.deepEqual(actual(), expected, message));

eqTest(() => ids("wukong vs rumble tips"), ["MonkeyKing", "Rumble"], "소문자도, 오공의 영어 이름(Wukong)도");
eqTest(() => ids("我用齐天大圣打机械公敌怎么打?"), ["MonkeyKing", "Rumble"], "중국어 이름");
eqTest(() => ids("오공으로 Rumble 상대"), ["MonkeyKing", "Rumble"], "한국어와 영어가 섞여도");
eqTest(() => ids("how does vision work in this game"), [], "낱말 속 글자(vision 의 Vi)에는 걸리지 않는다");

// --- 화면 언어별 카드로 찾기: 소문자 영문, 중국어 음역·칭호 조각, 별명, 헛잡음 막기 ---
describe("화면 언어별 카드로 찾기", () => {
  const load = (lang: string) => {
    const langCards = (JSON.parse(fs.readFileSync(path.join(dir, `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards;
    return {
      cards: langCards,
      cardById: new Map(langCards.map((c) => [c.id, c])),
      aliases: championAliases(langCards, names),
    } as unknown as AdvisorData;
  };
  const en = load("en_US");
  const zh = load("zh_CN");
  const idsIn = (d: AdvisorData, text: string) => detectChampions(d, text).map((c) => c.id);
  eqTest(() => idsIn(en, "cho gath top tips"), ["Chogath"], "띄어 쓴 Cho'Gath");
  eqTest(() => idsIn(en, "Could you help me? Everyone says it's hard"), [], "Could·Everyone 이 Corki·Evelynn 으로 잡히지 않는다");
  eqTest(() => idsIn(zh, "光辉怎莫这么烦啊"), ["Lux"], "중국어 칭호 앞 두 글자(光辉女郎 → 光辉)");
  eqTest(() => idsIn(zh, "请问排位选人时能不能换符文页？"), [], "符文(룬)이 라이즈(符文法师)로 잡히지 않는다");
  eqTest(() => ids("모르겠어 아무것도 못 하겠어"), [], "두 글자 접두사(모르·아무)가 모르가나·아무무로 잡히지 않는다");
  eqTest(() => ids("캐릭터 오른쪽으로 쏩니다"), [], "두 글자 이름(오른)도 낱말 앞머리에서만");
  eqTest(() => ids("룰루로 렐 상대중인데"), ["Lulu", "Rell"], "한 글자 이름(렐)은 뒤에 공백·조사가 올 때");
});

// --- 영어·중국어 문형으로 시점 가르기 ---
describe("영어·중국어 문형으로 시점 가르기", () => {
  const names = (card: ChampionCard) => [card.name, ...(data.aliases.get(card.id) ?? [])];
  const side = (text: string) => {
    const found = detectChampions(data, text);
    return matchupSidesByPhrase(text, [found[0], found[1]], names)?.id;
  };
  eqTest(() => side("我用武器大师对线迅捷斥候有什么技巧?"), "Jax", "我用X对线Y → X");
  eqTest(() => side("Caitlyn is the enemy ADC and I'm on Vayne, how do I survive lane?"), "Vayne", "Y is the enemy · I'm on X → X");
  eqTest(() => side("Wukong Rumble"), undefined, "문형이 없으면 가르지 않는다(판정기에 맡긴다)");
});

// 줄임말(이름 앞 두 글자)이 흔한 말 안에서 걸리면 안 된다. "아이템" 의 아이 → 아이번.
eqTest(() => ids("오공으로 럼블 상대할 때 아이템 뭐 가?"), ["MonkeyKing", "Rumble"], "아이템 속 아이는 아이번이 아니다");

// 이름이 셋이면 곁들인 이름(자리 낱말이 붙은 것)을 빼고 맞붙는 둘을 고른다
const allNames = (card: ChampionCard) => [card.name, ...(data.aliases.get(card.id) ?? [])];
const pairOf = (q: string) => {
  const pair = matchupPair(q, detectChampions(data, q), allNames);
  if (!pair) return undefined;
  const phrased = matchupSidesByPhrase(q, pair, allNames);
  const sides = phrased ? [phrased, pair.find((c) => c.id !== phrased.id)!] : matchupSides(q, pair);
  return sides.map((c) => c.id);
};
eqTest(() => pairOf("잭스 상대로 피오라 할 때 탑 갱 오는 정글이 녹턴이면?"), ["Fiora", "Jax"], "앞에 붙은 정글, 상대를 먼저 말해도");
eqTest(() => pairOf("我用亚索打墨菲特，对面打野是盲僧，怎么对线？"), ["Yasuo", "Malphite"], "중국어 打野 — 띄어 쓰지 않아도 옆 이름을 잡지 않는다");
