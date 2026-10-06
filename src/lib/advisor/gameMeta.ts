/**
 * 게임 규칙·메타 — 항복·다시하기·오브젝트 시간·포탑 방패·억제기·미니언 웨이브·처치 골드·닷지·듀오·챔피언 가격
 *
 * 챔피언·아이템·룬 어느 자료에도 없는 질문이다. 예전에는 검색이 비면 모델이 자료 없이 답했고, 0.8B 는
 * "항복은 10분부터" 처럼 지어냈다. 공식 위키(wiki.leagueoflegends.com) 최신판을 사람이 읽고 옮긴 사실
 * (`knowledge/game-meta.json`)과 위키 챔피언 데이터의 가격(`knowledge/champion-prices.json`)으로 답한다.
 * 모델 없이 낱말로 찾으므로 모델을 받지 않은 기기에서도 같다.
 */
import meta from "../../../knowledge/game-meta.json";
import prices from "../../../knowledge/champion-prices.json";
import { aliasAt, aliasesOf } from "@/lib/knowledge/searchAliases";
import { removalNotice, type NoteVersion } from "@/lib/knowledge/noteVersion";
import { unreviewedMonsterDetail } from "./gameMetaCoverage";
type Language = string;
const short = (lang: Language): "ko" | "en" | "zh" => (lang.startsWith("en") ? "en" : lang.startsWith("zh") ? "zh" : "ko");

export interface GameMetaFact {
  version?: NoteVersion;
  id: string;
  page: string;
  keywords: Record<"ko" | "en" | "zh", string[]>;
  text: Record<"ko" | "en" | "zh", string>;
}

const FACTS = meta.facts as GameMetaFact[];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 영어 낱말은 낱말 경계로("ff" 가 "effect" 에 걸리지 않게), 한국어·중국어는 들어 있으면 */
function matches(question: string, keyword: string): boolean {
  if (/^[a-z0-9 '-]+$/i.test(keyword)) return new RegExp(`(?<![a-z])${escape(keyword)}(?![a-z])`, "i").test(question);
  return question.includes(keyword);
}

/** 가장 길게 걸린 낱말의 사실. 세 언어 낱말을 모두 본다(한국어 화면에서 영어로 물어도). */
export function findGameMeta(question: string): GameMetaFact | undefined {
  let best: { fact: GameMetaFact; score: number } | undefined;
  for (const fact of FACTS) {
    const words = [...fact.keywords.ko, ...fact.keywords.en, ...fact.keywords.zh];
    const aliases = aliasesOf(`meta:${fact.id}`).filter((alias) => aliasAt(question, alias) >= 0);
    const score = Math.max(0, ...words.filter((w) => matches(question, w)).map((w) => w.length), ...aliases.map((w) => w.length));
    if (score > 0 && (!best || score > best.score)) best = { fact, score };
  }
  return best?.fact;
}

const PRICE_WORDS = /가격|얼마|정수|블루\s*정수|\bRP\b|\bBE\b|\bprice\b|\bcost\b|how much|blue essence|多少钱|价格|精粹|点券/i;

export function asksPrice(question: string): boolean {
  return PRICE_WORDS.test(question);
}

const PRICE_TEXT: Record<"ko" | "en" | "zh", (name: string, be: number, rp: number) => string> = {
  ko: (name, be, rp) => `${name}의 상점 가격은 블루 정수 ${be.toLocaleString("ko-KR")} 또는 ${rp.toLocaleString("ko-KR")} RP입니다.`,
  en: (name, be, rp) => `${name} costs ${be.toLocaleString("en-US")} Blue Essence or ${rp.toLocaleString("en-US")} RP in the store.`,
  zh: (name, be, rp) => `${name}在商店的价格是 ${be} 蓝色精粹或 ${rp} 点券（RP）。`,
};

const TIERS_TEXT: Record<"ko" | "en" | "zh", string> = {
  ko: "챔피언 가격은 블루 정수 225 · 675 · 1,575 · 2,400 · 3,150(RP 260 · 585 · 790 · 880 · 975) 단계입니다. 최근에 나온 챔피언은 3,150(975 RP)이고 시간이 지나면 내려갑니다. 챔피언 이름을 함께 물으면 그 챔피언의 가격을 알려 드립니다.",
  en: "Champion prices come in tiers of 225 · 675 · 1,575 · 2,400 · 3,150 Blue Essence (260 · 585 · 790 · 880 · 975 RP). Recently released champions cost 3,150 (975 RP) and drop later. Ask with a champion's name for its exact price.",
  zh: "英雄价格分为 225 · 675 · 1,575 · 2,400 · 3,150 蓝色精粹（260 · 585 · 790 · 880 · 975 点券）几档。新英雄为 3,150（975 点券），之后会降价。带上英雄名字提问即可查询具体价格。",
};

/** 챔피언 한 명의 가격. 가격 낱말이 있고 가격 자료가 있을 때만. */
export function championPriceAnswer(question: string, champion: { id: string; name: string }, lang: Language): string | undefined {
  if (!asksPrice(question)) return undefined;
  const price = (prices.prices as Record<string, { be: number; rp: number }>)[champion.id];
  if (!price) return undefined;
  const l = short(lang);
  return PRICE_TEXT[l](champion.name, price.be, price.rp);
}

/** 챔피언 가격 단계를 묻는가("챔피언 가격 얼마야"). 문서가 아니라 고정된 글로 답한다. */
export function asksPriceTiers(question: string): boolean {
  return /챔피언|챔프|champion|champ|英雄/i.test(question) && asksPrice(question);
}

/** 이름 없는 게임 규칙·메타 질문의 답. 가격을 물었는데 챔피언이 없으면 가격 단계를 답한다. */
export function gameMetaAnswer(question: string, lang: Language): string | undefined {
  const l = short(lang);
  const fact = findGameMeta(question);
  if (fact) return factText(fact, lang, question);
  if (asksPriceTiers(question)) return TIERS_TEXT[l];
  return undefined;
}

/** 검색 문서 꼴(id · 제목 · 본문). 문서 벡터를 만든 것과 같은 제목·본문이다. */
export function gameMetaDocs(lang: Language): Array<{ id: string; title: string; text: string }> {
  const l = short(lang);
  return FACTS.map((fact) => ({ id: `meta:${fact.id}`, title: fact.keywords[l][0] ?? fact.id, text: factText(fact, lang) }));
}

/** 문서 id(`meta:surrender`)로 답한다. 검색 벡터가 고른 문서를 보일 때 쓴다. */
export function gameMetaById(id: string, lang: Language, question?: string): string | undefined {
  const fact = FACTS.find((entry) => `meta:${entry.id}` === id);
  if (!fact) return undefined;
  return factText(fact, lang, question);
}

function factText(fact: GameMetaFact, lang: Language, question?: string): string {
  const l = short(lang);
  return removalNotice(fact.keywords[l][0] ?? fact.id, fact.version, lang)
    ?? unreviewedMonsterDetail(fact.id, question, lang) ?? fact.text[l];
}
