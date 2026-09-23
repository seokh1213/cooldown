/**
 * 챔피언 이름 찾기 시험 — 다른 언어 이름
 *
 * 한국어 화면에서 영어·중국어 이름으로 물어도 챔피언을 알아봐야 한다. 낱말 속 글자에
 * 걸리면 안 된다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import type { AdvisorData } from "../src/lib/advisor/context";
import { detectChampions } from "../src/lib/advisor/intent";
import { matchupSidesByPhrase } from "../src/lib/advisor/answer";

const dir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (JSON.parse(fs.readFileSync(path.join(dir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const names = (JSON.parse(fs.readFileSync(path.join(dir, "champion-names.json"), "utf8")) as { names: Record<string, string[]> }).names;
const data = {
  cards,
  cardById: new Map(cards.map((c) => [c.id, c])),
  aliases: new Map(cards.map((c) => [c.id, [...new Set([...(names[c.id] ?? []), c.id])].filter((n) => n !== c.name)])),
} as unknown as AdvisorData;
const ids = (text: string) => detectChampions(data, text).map((c) => c.id);

let checks = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

eq(ids("How do I play Yasuo into Malphite?"), ["Yasuo", "Malphite"], "영어 이름 둘을 문장 순서대로");
eq(ids("wukong vs rumble tips"), ["MonkeyKing", "Rumble"], "소문자도, 오공의 영어 이름(Wukong)도");
eq(ids("我用齐天大圣打机械公敌怎么打?"), ["MonkeyKing", "Rumble"], "중국어 이름");
eq(ids("Lee Sin jungle path"), ["LeeSin"], "띄어 쓴 영어 이름");
eq(ids("오공으로 Rumble 상대"), ["MonkeyKing", "Rumble"], "한국어와 영어가 섞여도");
eq(ids("how does vision work in this game"), [], "낱말 속 글자(vision 의 Vi)에는 걸리지 않는다");
eq(ids("오공 럼블"), ["MonkeyKing", "Rumble"], "화면 언어 이름은 그대로");


// --- 영어·중국어 문형으로 시점 가르기 ---
{
  const names = (card: ChampionCard) => [card.name, ...(data.aliases.get(card.id) ?? [])];
  const side = (text: string) => {
    const found = detectChampions(data, text);
    return matchupSidesByPhrase(text, [found[0], found[1]], names)?.id;
  };
  // 판정기가 틀린 세 문장(시험 60문항)
  eq(side("Playing Darius into Sett, who wins lane?"), "Darius", "Playing X into Y → X");
  eq(side("I'm Jax against Teemo, laning tips?"), "Jax", "I'm X against Y → X");
  eq(side("我用武器大师对线迅捷斥候有什么技巧?"), "Jax", "我用X对线Y → X");
  eq(side("How do I play Wukong into Rumble?"), "MonkeyKing", "play X into Y → X");
  eq(side("Caitlyn is the enemy ADC and I'm on Vayne, how do I survive lane?"), "Vayne", "Y is the enemy · I'm on X → X");
  eq(side("Wukong Rumble"), undefined, "문형이 없으면 가르지 않는다(판정기에 맡긴다)");
}

console.log(`✅ 이름 찾기·시점 문형 통과 (${checks}건)`);
