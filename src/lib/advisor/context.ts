/**
 * 브라우저 질의 컨텍스트 조립
 *
 * CLI 와 **같은 코드로** 자료를 만든다. `scripts/llm/lib/` 의 조립 로직은 파일을 읽지 않으므로
 * 그대로 가져다 쓸 수 있고, 여기서는 파일 대신 `fetch` 로 재료를 모아 넘기기만 한다.
 *
 * 여기서 바로 짓는 답은 효과 태그 예/아니오, 아이템, 게임 규칙 조회다.
 * 상성 서술과 통계는 다루지 않는다.
 *
 * 받아 오는 재료
 * - 사실 카드: `llm/champion-cards-<locale>.json` (`npm run llm:build` 산출물)
 * - 지식 카드: `llm/advisor-knowledge.json` (`npm run llm:bundle` 산출물)
 * - 아이템·룬·주문·아이템 위키 분류: 앱이 이미 쓰는 정규화 데이터
 *
 * 합쳐 7MB 남짓이다. 모델(570MB)에 비하면 작고, 한 번 받으면 캐시에 남는다.
 */
import type { ChampionCard } from "@/lib/knowledge/facts";
import { aliasAt } from "../../../scripts/llm/lib/searchAliases";
import { askedRuleKinds } from "../../../scripts/llm/lib/rules";
import itemAliasFile from "../../../knowledge/item-aliases.json";
import type { CuratedTip } from "../../../scripts/llm/lib/knowledgeCore";
import {
  indexRules,
  type RuleIndex,
  type RuleNotes,
} from "../../../scripts/llm/lib/rules";
import type { Playbook } from "../../../scripts/llm/lib/playbookCore";
import {
  findMechanics,
  mechanicsToText,
  type MechanicsIndex,
} from "../../../scripts/llm/lib/mechanics";
import type { WikiItemMeta } from "@/lib/knowledge/sourceRecords";
import type { AdvisorAnswer, Fact } from "./answer";
import type {
  NormalizedItem,
  NormalizedRune,
  NormalizedSummonerSpell,
} from "@/types/combatNormalized";

interface ChampionCardFile {
  patch: string;
  cards: ChampionCard[];
}

interface KnowledgeBundle {
  patchVersion: string;
  playbooks: Record<string, Playbook>;
  tips: CuratedTip[];
  rules?: RuleNotes[];
  mechanics?: MechanicsIndex;
}

interface ItemFile {
  items: NormalizedItem[];
}
interface RuneFile {
  runes: NormalizedRune[];
}
interface SummonerFile {
  spells: NormalizedSummonerSpell[];
}
interface WikiItemFile {
  items?: WikiItemMeta[];
}

export interface AdvisorData {
  /** 앱이 지금 쓰는 패치 */
  patch: string;
  /**
   * 지식·통계가 만들어진 패치.
   *
   * 게임 패치는 2주마다 바뀌는데 지식 계층은 따로 만든다. 어긋날 수 있으므로 함께 들고 다니며,
   * 어긋나면 수치를 답에서 빼고 그 사실을 밝힌다. 낡은 수치를 현재값처럼 말하는 것이 최악이다.
   */
  knowledgePatch: string;
  /** 지식 패치와 게임 패치가 다른가 */
  stale: boolean;
  cards: ChampionCard[];
  cardById: Map<string, ChampionCard>;
  /**
   * 화면 언어가 아닌 이름. id → [영어·중국어 이름, DDragon id].
   * 한국어 화면에서 "Yasuo" 로 물어도 알아보게 한다. 없으면 빈 표다.
   */
  aliases: Map<string, string[]>;
  playbooks: Map<string, Playbook>;
  /**
   * 화면 언어로 옮긴 노트(노트 id → 글). 한국어 화면에서는 비어 있다 — 원문이 한국어다.
   * 번역 원자를 노트 단위로 이은 것이라(`build-note-translations.ts`) 원자가 있는 챔피언만 있다.
   */
  noteTranslations?: Record<string, string>;
  /** 불러온 화면 언어. 없으면 한국어로 본다(Node 로더·측정 도구). */
  locale?: string;
  /** 아이템 id → 세 언어 공식 이름(llm/item-names.json). 다른 언어로 쓴 아이템 이름을 찾는다. 없어도 된다. */
  itemNames?: Map<string, string[]>;
  tips: CuratedTip[];
  /** 룬·소환사 주문 판정 규칙. 이름으로 찾는다. */
  ruleIndex: RuleIndex;
  mechanics: MechanicsIndex;
  /** 카드에 실제로 쓰인 효과 태그. 판정 질문을 알아보는 데 쓴다. */
  effectTags: string[];
  items: NormalizedItem[];
  runes: NormalizedRune[];
  summoners: NormalizedSummonerSpell[];
  wikiItems: Map<string, WikiItemMeta>;
}

export function dataUrl(patch: string, relative: string): string {
  return `${import.meta.env.BASE_URL}data/${patch}/${relative}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
/** 카드에 쓰인 효과 태그를 모은다. 긴 이름을 먼저 맞춰야 "이동기" 가 "이동 속도 증가" 를 가리지 않는다. */
export function collectEffectTags(cards: ChampionCard[]): string[] {
  const tags = new Set<string>();
  for (const card of cards) for (const spell of card.spells) for (const tag of spell.effects) tags.add(tag);
  return [...tags].sort((a, b) => b.length - a.length);
}

/**
 * 화면 언어가 아닌 이름 표(`AdvisorData.aliases`). 이름 색인(llm/champion-names.json)의 이름과 DDragon id 에서
 * 화면 언어 이름을 뺀다.
 */
export function championAliases(cards: ChampionCard[], names: Record<string, string[]>): Map<string, string[]> {
  return new Map(cards.map((c) => [c.id, [...new Set([...(names[c.id] ?? []), c.id])].filter((name) => name !== c.name)]));
}

/**
 * 받아 둔 재료. 패치·언어마다 따로 둔다.
 *
 * 하나만 쥐고 있었더니 화면 언어를 바꿔도 처음 받은 언어의 자료가 그대로 돌아왔다 — 영어로
 * 바꾼 뒤에도 "오공 into 럼블", "마법무효화의 망토" 가 나왔다. 새로고침해야만 풀렸다.
 */
const cached = new Map<string, Promise<AdvisorData>>();

/** 재료를 한 번만 받아 두고 재사용한다 */
export function loadAdvisorData(patch: string, locale = "ko_KR"): Promise<AdvisorData> {
  const key = `${patch}:${locale}`;
  const hit = cached.get(key);
  if (hit) return hit;
  const loading = (async () => {
    const knowledge = await getJson<KnowledgeBundle>(
      dataUrl(patch, "llm/advisor-knowledge.json"),
    );
    const [cardFile, itemFile, runeFile, summonerFile, wikiItemFile] =
      await Promise.all([
        getJson<ChampionCardFile>(dataUrl(patch, `llm/champion-cards-${locale}.json`)),
        getJson<ItemFile>(dataUrl(patch, `items-normalized-${locale}.json`)),
        getJson<RuneFile>(dataUrl(patch, `runes-normalized-${locale}.json`)),
        getJson<SummonerFile>(dataUrl(patch, `summoner-normalized-${locale}.json`)),
        getJson<WikiItemFile>(dataUrl(patch, "llm/item-wiki-meta.json")).catch(
          (): WikiItemFile => ({}),
        ),
      ]);
    // 노트 번역도 없어도 된다. 없으면 영어·중국어 답은 지금처럼 도출 문장만으로 짓는다.
    const translations =
      locale === "ko_KR"
        ? undefined
        : await getJson<{ notes: Record<string, string> }>(dataUrl(patch, `llm/note-translations-${locale}.json`)).catch(() => undefined);
    // 이름 색인은 없어도 된다. 없으면 화면 언어 이름으로만 찾는다.
    const names = await getJson<{ names: Record<string, string[]> }>(dataUrl(patch, "llm/champion-names.json")).catch(
      () => ({ names: {} as Record<string, string[]> }),
    );
    const itemNames = await getJson<{ names: Record<string, string[]> }>(dataUrl(patch, "llm/item-names.json")).catch(
      () => ({ names: {} as Record<string, string[]> }),
    );

    return {
      patch,
      knowledgePatch: knowledge.patchVersion,
      stale: knowledge.patchVersion !== patch,
      cards: cardFile.cards,
      cardById: new Map(cardFile.cards.map((c) => [c.id, c])),
      aliases: championAliases(cardFile.cards, names.names),
      playbooks: new Map(Object.entries(knowledge.playbooks)),
      noteTranslations: translations?.notes,
      locale,
      itemNames: new Map(Object.entries(itemNames.names)),
      tips: knowledge.tips,
      ruleIndex: indexRules(knowledge.rules ?? []),
      mechanics: knowledge.mechanics ?? [],
      effectTags: collectEffectTags(cardFile.cards),
      items: itemFile.items,
      runes: runeFile.runes,
      summoners: summonerFile.spells,
      // Node 로더와 같은 키를 쓴다. 이름이 아니라 아이템 id 다.
      wikiItems: new Map((wikiItemFile.items ?? []).map((i) => [i.id, i])),
    } satisfies AdvisorData;
  })();
  cached.set(key, loading);
  // 받다가 실패하면 쥐고 있지 않는다. 다음에 다시 받는다(오프라인에서 돌아온 경우).
  loading.catch(() => cached.delete(key));
  return loading;
}

/**
 * 질문이 가리키는 스킬 슬롯. "럼블 E는", "가렌 궁", "제드 패시브" 를 모두 받는다.
 *
 * 영어 낱말 속 알파벳에 걸리지 않도록 슬롯 문자는 앞뒤가 한글이거나 경계일 때만 센다.
 */
export function detectSlot(question: string): string | undefined {
  if (/패시브|기본\s?지속/.test(question)) return "P";
  // 한글에는 \b 가 듣지 않는다. "가렌 궁 뭐야" 를 놓쳤다.
  if (/궁극기|궁(?=[\s을은이의로]|$)/.test(question)) return "R";
  const match = /(^|[^A-Za-z])([QWERqwer])($|[^A-Za-z])/.exec(question);
  return match ? match[2].toUpperCase() : undefined;
}

/**
 * "아리 W는 이동기야?" 처럼 **효과 태그로 답이 정해지는** 질문의 답.
 *
 * **모델을 거치지 않는다.** 태그가 없다는 사실(부재)을 근거로 "아니다" 라고 말하는 것은
 * 소형 모델이 못 하는 추론이다. e2b 도 e4b 도 "이동 속도가 증가합니다" 라고 딴말을 했다.
 * 우리 카드는 태그를 이미 들고 있으므로 세어서 답하면 된다.
 *
 * 태그 이름은 데이터에서 모은다. 손으로 목록을 적으면 태그가 늘 때 따라가지 못한다.
 */
export function buildTagAnswer(
  data: AdvisorData,
  card: ChampionCard,
  question: string,
): string | undefined {
  const asked = data.effectTags.filter((tag) => question.includes(tag));
  if (asked.length === 0) return undefined;
  // 슬롯을 집어 물으면 그 스킬만 본다.
  const slot = /\b([QWER])\b|패시브/i.exec(question);
  const wanted = slot
    ? [slot[0].toUpperCase() === "패시브" ? "P" : slot[0].toUpperCase()]
    : ["P", "Q", "W", "E", "R"];

  const lines: string[] = [];
  for (const tag of asked) {
    const hits = card.spells.filter(
      (spell) => wanted.includes(spell.slot) && spell.effects.includes(tag),
    );
    if (hits.length === 0) {
      lines.push(
        slot
          ? `아니요. ${card.name} ${wanted[0]} 에는 ${withParticle(tag, "이", "가")} 없습니다.`
          : `아니요. ${card.name}에게는 ${tag} 스킬이 없습니다.`,
      );
      continue;
    }
    lines.push(
      `네. ${hits.map((h) => `${h.slot} ${h.name}`).join(", ")}에 ${withParticle(tag, "이", "가")} 있습니다.`,
    );
    for (const hit of hits) lines.push(`- ${hit.slot} ${hit.name}: ${hit.summary}`);
  }
  return `${lines.join("\n")}\n\n패치 ${data.patch} 기준 스킬 효과입니다.`;
}

/** 받침 유무로 조사를 고른다. "보호막는" 처럼 나가면 답이 어설퍼 보인다. */
function withParticle(word: string, withFinal: string, withoutFinal: string): string {
  const last = word.charCodeAt(word.length - 1);
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${word}${hasFinal ? withFinal : withoutFinal}`;
}

/**
 * 설명문에서 그 낱말이 나온 문장을 찾는다. 판정의 근거로 함께 보여 준다.
 * 근거 없이 "네/아니오" 만 내면 사용자가 확인할 방법이 없다.
 */
function sentenceWith(body: string, term: string): string | undefined {
  return body
    .split(/\n|(?<=니다\.)\s*/)
    .map((line) => line.trim())
    .find((line) => line.includes(term));
}

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
export function buildItemCard(
  data: AdvisorData,
  question: string,
  /** 이름을 생략했을 때 쓸 아이템. 대화에서 방금 다룬 것 — "거기 둔화 있어?" */
  recent?: string,
): AdvisorAnswer | undefined {
  const named = findItems(data, question);
  // 이름이 없어도 효과 낱말을 물었으면 방금 다룬 아이템에 대한 질문이다.
  const items =
    named.length === 0 && recent && data.effectTags.some((tag) => question.includes(tag))
      ? data.items.filter((item) => String(item.id) === recent).slice(0, 1)
      : named;
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
    stats: (item.statDescriptions ?? [])
      .map((line) => {
        // "공격력 <span>45</span>" → 마지막 낱말이 값, 앞이 이름. "공격 속도 25%" 도 같다.
        const text = htmlToText(line).replace(/\s+/g, " ").trim();
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
  return `${blocks.join("\n\n")}\n\n패치 ${data.patch} 기준 아이템 설명입니다.`;
}

/**
 * 챔피언과 무관한 규칙을 묻는 질문의 답.
 *
 * **모델을 거치지 않는다.** 룬·주문 판정과 같은 이유다. 브라우저에서 재어 보니
 * 1B 모델이 "감소가 먼저, 관통이 나중" 을 "관통이 감소보다 먼저" 로 뒤집고,
 * "V14.1 이후 레벨에 비례하지 않는다" 를 "비례합니다" 로 바꿔 답했다.
 * 적용 순서와 부정문은 요약하는 순간 틀리므로 원문을 그대로 낸다.
 */
export function buildMechanicsAnswer(
  data: AdvisorData,
  question: string,
): string | undefined {
  const text = mechanicsToText(findMechanics(data.mechanics, question));
  if (!text) return undefined;
  return `${text}\n\n패치 ${data.patch} 기준으로 정리해 둔 규칙을 그대로 옮긴 것입니다.`;
}

/** 문서 id(`mech:스킬-가속`)로 답한다. 검색 벡터가 고른 절을 보일 때 쓴다. */
export function buildMechanicsAnswerById(data: AdvisorData, id: string): string | undefined {
  const section = data.mechanics.find((entry) => `mech:${entry.id}` === id);
  const text = section ? mechanicsToText([section]) : undefined;
  if (!text) return undefined;
  return `${text}\n\n패치 ${data.patch} 기준으로 정리해 둔 규칙을 그대로 옮긴 것입니다.`;
}

/** 설명문은 HTML 이라 그대로 실으면 태그가 답에 샌다. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 질문에서 아이템 이름을 찾는다.
 * 챔피언과 같은 이유로 긴 이름을 먼저 맞춘다. "판금 장화" 를 "장화" 로 자르면 안 된다.
 */
function findItems(data: AdvisorData, question: string, limit = 3) {
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
    take(item, question.indexOf(item.name), item.name.length);
    if (found.length >= limit) return found;
  }
  /*
   * 줄임말("쇼진 몇 골드야?", "botrk passive", "中亚能挡什么"). knowledge/item-aliases.json — 협곡 기본 아이템 id 마다 세 언어.
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
  const championAliases = [...(data.aliases?.values() ?? [])].flat().filter((alias) => alias.length >= 2 && question.includes(alias));
  for (const { id, alias } of itemAliasList()) {
    const item = byId.get(id);
    if (!item) continue;
    if (championAliases.some((name) => name !== alias && name.includes(alias))) continue;
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
