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
import { matchupPair, matchupSides, matchupSidesByPhrase } from "../src/lib/advisor/answer";

const dir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (JSON.parse(fs.readFileSync(path.join(dir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const names = (JSON.parse(fs.readFileSync(path.join(dir, "champion-names.json"), "utf8")) as { names: Record<string, string[]> }).names;
const items = (JSON.parse(fs.readFileSync(path.join(dir, "..", "items-normalized-ko_KR.json"), "utf8")) as { items: unknown[] }).items;
const data = {
  cards,
  items,
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


// --- 화면 언어별 카드로 찾기: 소문자 영문, 중국어 음역·칭호 조각, 별명, 헛잡음 막기 ---
{
  const load = (lang: string) => {
    const langCards = (JSON.parse(fs.readFileSync(path.join(dir, `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards;
    return {
      cards: langCards,
      cardById: new Map(langCards.map((c) => [c.id, c])),
      aliases: new Map(langCards.map((c) => [c.id, [...new Set([...(names[c.id] ?? []), c.id])].filter((n) => n !== c.name)])),
    } as unknown as AdvisorData;
  };
  const en = load("en_US");
  const zh = load("zh_CN");
  const idsIn = (d: AdvisorData, text: string) => detectChampions(d, text).map((c) => c.id);
  eq(idsIn(en, "how do i lane vs zed as ahri"), ["Zed", "Ahri"], "영어 화면에서 소문자 이름");
  eq(idsIn(en, "cho gath top tips"), ["Chogath"], "띄어 쓴 Cho'Gath");
  eq(idsIn(en, "Could you help me? Everyone says it's hard"), [], "Could·Everyone 이 Corki·Evelynn 으로 잡히지 않는다");
  eq(idsIn(zh, "我们中单瑞兹、辅助加里奥"), ["Ryze", "Galio"], "중국어 음역 이름(瑞兹·加里奥)");
  eq(idsIn(zh, "光辉怎莫这么烦啊"), ["Lux"], "중국어 칭호 앞 두 글자(光辉女郎 → 光辉)");
  eq(idsIn(zh, "请问排位选人时能不能换符文页？"), [], "符文(룬)이 라이즈(符文法师)로 잡히지 않는다");
  eq(idsIn(zh, "帮助之手 攻击会对小兵造成额外伤害"), [], "아이템 효과 이름(帮助之手)이 다리우스로 잡히지 않는다");
  eq(ids("모르겠어 아무것도 못 하겠어"), [], "두 글자 접두사(모르·아무)가 모르가나·아무무로 잡히지 않는다");
  eq(ids("업그레이드는 언제 해?"), [], "별명(그레)은 낱말 앞머리에서만");
  eq(ids("캐릭터 오른쪽으로 쏩니다"), [], "두 글자 이름(오른)도 낱말 앞머리에서만");
  eq(ids("룰루로 렐 상대중인데"), ["Lulu", "Rell"], "한 글자 이름(렐)은 뒤에 공백·조사가 올 때");
  eq(ids("진짜 어렵다"), [], "진짜 의 진은 진(Jhin)이 아니다");
}

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

// 줄임말(이름 앞 두 글자)이 흔한 말 안에서 걸리면 안 된다. "아이템" 의 아이 → 아이번.
eq(ids("오공으로 럼블 상대할 때 아이템 뭐 가?"), ["MonkeyKing", "Rumble"], "아이템 속 아이는 아이번이 아니다");
eq(ids("다이아 가려면 누구 해야 돼?"), [], "다이아 속 다이는 다이애나가 아니다");
eq(ids("카이팅 잘하는 법"), [], "카이팅 속 카이는 카이사가 아니다");
eq(ids("말파 템트리 알려줘"), ["Malphite"], "템트리를 가려도 별명 말파는 찾는다");
eq(ids("아이번 정글 동선"), ["Ivern"], "정식 이름은 그대로");
eq(ids("라일라이의 수정홀 언제 사?"), [], "아이템 이름 속 일라는 일라오이가 아니다");

// 이름이 셋이면 곁들인 이름(자리 낱말이 붙은 것)을 빼고 맞붙는 둘을 고른다
const allNames = (card: ChampionCard) => [card.name, ...(data.aliases.get(card.id) ?? [])];
const pairOf = (q: string) => {
  const pair = matchupPair(q, detectChampions(data, q), allNames);
  if (!pair) return undefined;
  const phrased = matchupSidesByPhrase(q, pair, allNames);
  const sides = phrased ? [phrased, pair.find((c) => c.id !== phrased.id)!] : matchupSides(q, pair);
  return sides.map((c) => c.id);
};
eq(pairOf("오공으로 럼블 상대할 때 아이번 정글이면 아이템 뭐 가?"), ["MonkeyKing", "Rumble"], "뒤에 붙은 정글");
eq(pairOf("잭스 상대로 피오라 할 때 탑 갱 오는 정글이 녹턴이면?"), ["Fiora", "Jax"], "앞에 붙은 정글, 상대를 먼저 말해도");
eq(pairOf("I play Garen into Darius and their support is Thresh, how do I lane?"), ["Garen", "Darius"], "영어 support");
eq(pairOf("我用亚索打墨菲特，对面打野是盲僧，怎么对线？"), ["Yasuo", "Malphite"], "중국어 打野 — 띄어 쓰지 않아도 옆 이름을 잡지 않는다");
eq(ids("我用亚索打墨菲特"), ["Yasuo", "Malphite"], "중국어 칭호(亚索)도 이름으로");
eq(pairOf("오공 럼블 아이번 중 누가 제일 세?"), ["MonkeyKing", "Rumble"], "자리 낱말이 없으면 앞의 둘(셋을 견주는 질문은 비교 경로가 먼저 받는다)");

console.log(`✅ 이름 찾기·시점 문형 통과 (${checks}건)`);
