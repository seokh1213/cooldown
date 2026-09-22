/**
 * 브라우저 질의 컨텍스트 조립
 *
 * CLI 와 **같은 코드로** 자료를 만든다. `scripts/llm/lib/` 의 조립 로직은 파일을 읽지 않으므로
 * 그대로 가져다 쓸 수 있고, 여기서는 파일 대신 `fetch` 로 재료를 모아 넘기기만 한다.
 *
 * 답하는 범위는 챔피언 한 명에 대한 조회와 룬·주문 판정 두 가지다.
 * 상성 서술과 통계는 다루지 않는다.
 *
 * 받아 오는 재료
 * - 사실 카드: `llm/champion-cards-<locale>.json` (`npm run llm:build` 산출물)
 * - 지식 카드: `llm/advisor-knowledge.json` (`npm run llm:bundle` 산출물)
 * - 아이템·룬·주문·아이템 위키 분류: 앱이 이미 쓰는 정규화 데이터
 *
 * 합쳐 7MB 남짓이다. 모델이 3GB 인 것에 비하면 작고, 한 번 받으면 캐시에 남는다.
 */
import { championCardToText, type ChampionCard } from "../../../scripts/llm/lib/facts";
import type { CuratedTip } from "../../../scripts/llm/lib/knowledgeCore";
import {
  buildRuleAnswer,
  findMentionedRules,
  findRulesMentioning,
  indexRules,
  type RuleIndex,
  type RuleNotes,
} from "../../../scripts/llm/lib/rules";
import { playbookToText, selectPlaybook, type Playbook } from "../../../scripts/llm/lib/playbookCore";
import { selectNotes, type NotePerspective, type SelectedNotes } from "./noteSelect";
import { deriveMatchupClaims, renderMatchupClaims } from "../../../scripts/llm/lib/claims";
import {
  findMechanics,
  mechanicsToText,
  type MechanicsIndex,
} from "../../../scripts/llm/lib/mechanics";
import type { WikiItemMeta } from "../../../scripts/llm/lib/data";
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
  playbooks: Map<string, Playbook>;
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

function dataUrl(patch: string, relative: string): string {
  return `${import.meta.env.BASE_URL}data/${patch}/${relative}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
/** 카드에 쓰인 효과 태그를 모은다. 긴 이름을 먼저 맞춰야 "이동기" 가 "이동 속도 증가" 를 가리지 않는다. */
function collectEffectTags(cards: ChampionCard[]): string[] {
  const tags = new Set<string>();
  for (const card of cards) for (const spell of card.spells) for (const tag of spell.effects) tags.add(tag);
  return [...tags].sort((a, b) => b.length - a.length);
}

let cached: Promise<AdvisorData> | null = null;

/** 재료를 한 번만 받아 두고 재사용한다 */
export function loadAdvisorData(patch: string, locale = "ko_KR"): Promise<AdvisorData> {
  if (cached) return cached;
  cached = (async () => {
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

    return {
      patch,
      knowledgePatch: knowledge.patchVersion,
      stale: knowledge.patchVersion !== patch,
      cards: cardFile.cards,
      cardById: new Map(cardFile.cards.map((c) => [c.id, c])),
      playbooks: new Map(Object.entries(knowledge.playbooks)),
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
  return cached;
}

const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 한국어 이름, 영어 이름, DDragon id 를 모두 받아 준다 */
export function findChampion(data: AdvisorData, query: string): ChampionCard | undefined {
  const q = normalize(query);
  if (!q) return undefined;
  return (
    data.cards.find((c) => normalize(c.id) === q) ??
    data.cards.find((c) => normalize(c.name) === q) ??
    data.cards.find((c) => normalize(c.name).includes(q)) ??
    data.cards.find((c) => normalize(c.id).includes(q))
  );
}

/**
 * 챔피언 하나에 대한 질문에 붙일 자료.
 *
 * 자료 없이 두면 모델이 "오공(Dragon Knight)" 같은 이름부터 지어낸다.
 * 실제로 그렇게 답했다.
 *
 * 사실 카드와 사람이 쓴 지식 카드만 싣는다. 통계는 더 이상 싣지 않는다.
 */
/**
 * 챔피언 여럿을 묻는 질문에 붙일 자료.
 *
 * "럼블 마법저항력 1렙에 몇이고 오공은 몇이야" 처럼 둘을 나란히 묻는 질문이 있다.
 * 한 명일 때만 자료를 붙였더니 이런 질문이 통째로 빈손으로 나갔다.
 */
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
 * 스킬 하나를 묻는 질문의 답.
 *
 * **모델을 거치지 않는다.** "럼블 E는 마법저항력이 깎이나?" 에 모델은
 * "네, 감소합니다" 라고만 답하고 수치를 빠뜨렸다. 물어본 사람이 알고 싶은 것은
 * 몇이 깎이느냐인데 그 값은 툴팁에 이미 있다.
 *
 * 효과 태그로 못 잡는 이유도 여기 있다. 태그는 "적 마법 저항력 감소" 인데 질문은
 * "마법저항력이 깎이나" 라 글자가 맞지 않는다. 동의어 표를 만드는 대신 슬롯이
 * 드러난 질문은 그 스킬을 통째로 보여 준다.
 */
export function buildSpellAnswer(
  data: AdvisorData,
  card: ChampionCard,
  question: string,
): string | undefined {
  const slot = detectSlot(question);
  if (!slot) return undefined;
  const spell = card.spells.find((s) => s.slot === slot);
  if (!spell) return undefined;

  const lines = [`## ${card.name} ${spell.slot} ${spell.name}`];
  const facts: string[] = [];
  if (spell.cooldown) facts.push(`재사용 대기시간 ${spell.cooldown}초`);
  const cost = (spell as { cost?: string }).cost;
  if (cost) facts.push(`소모값 ${cost}`);
  if (spell.damageTypes?.length) facts.push(`피해 유형 ${spell.damageTypes.join("·")}`);
  if (facts.length) lines.push(facts.join(" · "));

  if (spell.effects.length) lines.push(`효과: ${spell.effects.join(", ")}`);
  const ratios = Object.entries(spell.ratios ?? {});
  if (ratios.length) {
    lines.push(`계수: ${ratios.map(([stat, value]) => `${stat} ${value}%`).join(", ")}`);
  }
  if (spell.text) lines.push(`\n${spell.text}`);
  lines.push(`\n패치 ${data.patch} 기준 스킬 설명입니다.`);
  return lines.join("\n");
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

/**
 * 챔피언 한 명을 묻는 질문의 답.
 *
 * **모델을 거치지 않는다.** 자료를 붙여 모델에게 넘겼더니 받아 적기만 하다가
 * 900토큰에서 잘렸다. 럼블은 카드 본문만 2,654자라 끝까지 닿지 못했고,
 * 능력치 표를 통째로 빠뜨린 채 문장 중간에서 끊겼다.
 *
 * 자료가 곧 답인 질문이다. 코드가 내면 잘리지 않고, 빠뜨리지 않고, 즉시 나간다.
 *
 * 프롬프트가 아니므로 지식 카드를 자르지 않는다. `buildChampionBrief` 가 4건·3건으로
 * 줄이는 것은 프롬프트가 6천 자에 닿으면 브라우저 런타임이 죽기 때문인데,
 * 여기는 화면에 바로 나가는 글이라 그 제약이 없다.
 */
/*
 * 상성 해설 재료를 따로 만들던 `buildMatchupTips` 는 걷어냈다.
 *
 * 상성 프롬프트에 노트가 아예 안 실리던 것을 고치면서 `buildCommentaryPrompt` 안에
 * 노트를 넣었는데, 화면 코드가 이 함수로 같은 노트를 한 번 더 붙이고 있었다. 다섯
 * 줄이 두 번씩 실려 프롬프트가 3,172자까지 부풀었다. 재료를 만드는 자리는 하나면
 * 된다.
 */

/** 상성 카드에 그대로 보일 노트. 해설 재료도 이것을 쓴다. */
export function matchupNotes(data: AdvisorData, me: ChampionCard, enemy: ChampionCard): { mine: string[]; enemy: string[] } {
  const selected = selectPlaybook(data.playbooks, me, enemy);
  /*
   * 조합은 삼만 쌍에 가까워 손으로 쓸 수 없다. 그런데 **미리 만들 필요가 없다.**
   * 두 카드만 있으면 그 자리에서 계산되므로 물어볼 때 짓는다.
   *
   * 맨 앞에 둔다. 사람이 쓴 노트는 한쪽 챔피언만 보고 쓴 것이라 이 조합에 관한
   * 말이 아니고, 도출한 쪽이 물음에 더 가깝다. 이 문장들은 재료에 그대로 실리므로
   * 근거 검사도 통과한다.
   */
  const derived = renderMatchupClaims(me, enemy, deriveMatchupClaims(me, enemy));
  return {
    mine: [...derived, ...selected.mine.slice(0, 3).map((entry) => entry.text)],
    enemy: selected.vsEnemy.slice(0, 3).map((entry) => entry.text),
  };
}

/**
 * 챔피언 카드에 얹을 운용 노트. 사람이 검증한 플레이북에서 고른다.
 *
 * 카드의 수치·태그만으로 해설을 시키면 "생존력이 뛰어나다", "압박이 중요하다" 같은 어느
 * 챔피언에나 맞는 말이 나왔다. 실전에 쓸 말은 여기 있다 — "R 은 저지 불가라 CC 로 끊을
 * 수 없다", "방패를 먼저 깨고 콤보를 시작해야 한다". 카드가 그대로 보이고, 모델은 이것을
 * 재료로 우선순위만 정한다.
 *
 * 고르는 기준은 **질문**이다. 예전에는 갈래 순서가 고정이라("스킬 먼저, 콤보 다음")
 * "한타에서 뭘 조심하냐" 에도 스킬 운용 노트가 먼저 나왔다. 자료가 없어서가 아니라
 * 질문을 안 봐서 생긴 헛발이다. 고르는 일은 `noteSelect` 가 한다.
 */
export function championNotes(
  data: AdvisorData,
  card: ChampionCard,
  /** 사용자가 실제로 쓴 문장. 갈래와 관점을 여기서 읽는다. */
  question: string,
  /** 화면에서 골라 준 관점. 문장으로 못 가릴 때만 들어온다. */
  forced?: NotePerspective,
): SelectedNotes {
  const book = data.playbooks.get(card.id);
  if (!book) return { playing: [], against: [], perspective: "both" };
  return selectNotes(book, question, forced);
}

export function buildChampionAnswer(data: AdvisorData, card: ChampionCard): string {
  const parts: string[] = [championCardToText(card, { includeSpellText: true, spellTextMax: 600 })];

  const book = data.playbooks.get(card.id);
  if (book) {
    parts.push(
      playbookToText(
        { mine: book.playing, vsEnemy: book.against },
        card.name,
        card.name,
        data.patch,
      ),
    );
  }

  parts.push(`패치 ${data.patch} 기준 자료를 그대로 옮긴 것입니다.`);
  return parts.join("\n\n");
}

export function buildChampionsBrief(data: AdvisorData, cards: ChampionCard[]): string {
  if (cards.length === 1) return buildChampionBrief(data, cards[0]);
  const lines = [`[패치] ${data.patch}`];
  for (const card of cards) {
    lines.push(
      `[${card.name} 자료]\n${championCardToText(card, { includeSpellText: true, spellTextMax: 420 })}`,
    );
  }
  lines.push(
    "[요청] 위 자료 안의 사실만 근거로 삼으십시오. " +
      "묻는 챔피언을 모두 답하고, 자료에 없는 수치를 지어내지 마십시오.",
  );
  return lines.join("\n\n");
}

export function buildChampionBrief(data: AdvisorData, card: ChampionCard): string {
  const book = data.playbooks.get(card.id);
  const lines: string[] = [
    `[패치] ${data.patch}`,
    // **스킬 본문을 싣는다.** 빼고 넘겼더니 "럼블 E 마법 저항력 감소가 몇이냐" 에
    // "자료로는 확실하지 않습니다" 라고 답했다. 수치는 툴팁 본문에만 있다.
    `[챔피언 자료]\n${championCardToText(card, { includeSpellText: true, spellTextMax: 600 })}`,
  ];

  if (book) {
    // 이 챔피언을 플레이할 때와 상대할 때를 모두 싣는다. 어느 쪽을 묻는지 알 수 없다.
    // 스킬 본문을 싣기 시작하면서 프롬프트가 6천 자에 닿았고, 거기서 ORT 가
    // "operation does not support unaligned accesses" 로 죽었다. 지식 카드를 줄여 맞춘다.
    const selected = { mine: book.playing.slice(0, 4), vsEnemy: book.against.slice(0, 3) };
    lines.push(
      `[지식 카드 — 사람이 검증한 내용입니다. 이 표현을 따르십시오]\n${playbookToText(
        selected,
        card.name,
        card.name,
        data.patch,
      )}`,
    );
  }

  lines.push(
    "[요청] 위 자료 안의 사실만 근거로 삼으십시오. " +
      "자료에 없는 아이템·룬·스킬 이름이나 수치를 만들어내지 마십시오. " +
      "스킬은 슬롯 문자와 이름을 함께 씁니다.",
  );
  return lines.join("\n\n");
}

/**
 * 룬·주문 판정을 묻는 질문에 붙일 자료.
 *
 * "정복자에 점화 스택이 되나" 같은 질문은 툴팁만 보면 틀린다. 실제로 그렇게 틀렸다.
 * 문장에서 룬·주문 이름을 찾아 위키에서 모은 판정 규칙을 싣는다.
 */

/**
 * 아이템 질문의 답.
 *
 * **모델을 거치지 않는다.** 설명문을 요약시켰더니 두 가지로 틀렸다.
 * "쇼진의 창은 궁극기에도 적용되나요" 에 "적용되지 않습니다" 라고 답했고
 * (설명문은 "챔피언 스킬" 이라 적는데 궁극기가 거기 든다는 추론을 못 한다),
 * "몰락한 왕의 검은 어떤 효과야" 에는 능력치만 읊고 고유 효과 두 개를 빠뜨렸다.
 * e4b 로 키워도 같았다. 설명문 자체가 답이므로 그대로 낸다.
 */
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
 * 아이템 답을 구조로. 설명문을 통째로 던지지 않고 능력치·효과로 갈라 둔다.
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
  for (const item of named) {
    const index = question.indexOf(item.name);
    if (index < 0) continue;
    if (taken.some(([start, end]) => index < end && index + item.name.length > start)) continue;
    taken.push([index, index + item.name.length]);
    found.push(item);
    if (found.length >= limit) break;
  }
  return found;
}

export function buildRuleBrief(data: AdvisorData, question: string): string | undefined {
  const named = findMentionedRules(data.ruleIndex, question);
  if (!named.length) return undefined;
  // 답이 다른 문서에 있을 수 있다. 그 이름을 본문에 언급한 규칙도 끌어온다.
  const related = findRulesMentioning(
    data.ruleIndex,
    named.map((r) => r.name),
  );
  return buildRuleAnswer([...named, ...related], data.patch);
}