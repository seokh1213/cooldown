/**
 * 브라우저 질의 컨텍스트 조립
 *
 * CLI 와 **같은 코드로** 자료를 만든다. `src/domain/knowledge/` 의 조립 로직은 파일을 읽지 않으므로
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
import { revisionedDataPath } from "@/app/pwa/release";
import type {
NormalizedItem,
NormalizedRune,
NormalizedSummonerSpell,
} from "@/domain/game/types/combatNormalized";
import type { ChampionCard } from "@/domain/knowledge/cards/contracts";
import type { WikiItemMeta } from "@/domain/knowledge/cards/sourceRecords";
import type { CuratedTip } from "@/domain/knowledge/notes/knowledgeCore";
import {
findMechanics,
mechanicsToText,
type MechanicsIndex,
} from "@/domain/knowledge/notes/mechanics";
import type { Playbook } from "@/domain/knowledge/notes/playbookCore";
import {
indexRules,
type RuleIndex,
type RuleNotes,
} from "@/domain/knowledge/notes/rules";
import { withParticle } from "../answers/presentation/answerText";
import { abilityIndex,type Ability,type AbilityBundle } from "../mechanics/types";

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
  /** 현재 원문과 승인 해시가 일치하는 구조화 스킬 규칙. 파일이 없으면 기존 조회를 사용한다. */
  abilityRules?: Map<string, Ability>;
  /** 카드에 실제로 쓰인 효과 태그. 판정 질문을 알아보는 데 쓴다. */
  effectTags: string[];
  items: NormalizedItem[];
  runes: NormalizedRune[];
  summoners: NormalizedSummonerSpell[];
  wikiItems: Map<string, WikiItemMeta>;
}

/**
 * 도우미 자료 URL. 정적 자료와 같은 판(release) 경로를 쓴다 — 서비스 워커가 `data/` 아래를 CacheFirst(60일)로 잡아 두어,
 * 같은 URL 로 다시 만든 `advisor-knowledge.json` 이 배포 뒤에도 옛것으로 남았다(2026-09-30, 규칙 문서 절을 빼고도 그 절이 답으로 나감).
 * 판 경로는 내용 해시가 들어 있어 자료가 바뀌면 URL 이 바뀐다.
 */
export function dataUrl(patch: string, relative: string): string {
  return `${import.meta.env?.BASE_URL ?? "/"}${revisionedDataPath(`data/${patch}/${relative}`)}`;
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
    const [cardFile, itemFile, runeFile, summonerFile, wikiItemFile, abilityFile] =
      await Promise.all([
        getJson<ChampionCardFile>(dataUrl(patch, `llm/champion-cards-${locale}.json`)),
        getJson<ItemFile>(dataUrl(patch, `items-normalized-${locale}.json`)),
        getJson<RuneFile>(dataUrl(patch, `runes-normalized-${locale}.json`)),
        getJson<SummonerFile>(dataUrl(patch, `summoner-normalized-${locale}.json`)),
        getJson<WikiItemFile>(dataUrl(patch, "llm/item-wiki-meta.json")).catch(
          (): WikiItemFile => ({}),
        ),
        locale === "ko_KR" ? getJson<AbilityBundle>(dataUrl(patch, "llm/champion-mechanics.json")).catch(() => undefined) : undefined,
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
      abilityRules: abilityIndex(abilityFile, patch),
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
  if (/패시브|기본\s?지속|\bpassive\b|被动/i.test(question)) return "P";
  // 한글에는 \b 가 듣지 않는다. "가렌 궁 뭐야" 를 놓쳤다.
  // 영어 "ult·ulti·ultimate" 와 중국어 "大招" 도 궁이다. 상성 대화 중 "give me the ult cooldowns for both",
  // "两人大招CD各是多少" 가 슬롯 없이 네 스킬 표로 나갔다. 영어는 낱말 경계로 잰다("result", "ultra" 에 걸리면 안 된다).
  if (/궁극기|궁(?=[\s을은이의으로에만도]|$)|\bult(?:i|imate)?\b|大招|(?:一|二|三|1|2|3)级大(?=能|的|招|多|冷|飞)/i.test(question)) return "R";
  const compact = /\b([QWER])(?=mana|cost|cooldown|range)/i.exec(question);
  if (compact) return compact[1].toUpperCase();
  const match = /(^|[^A-Za-z])([PQWERpqwer])($|[^A-Za-z])/.exec(question);
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
  return `${lines.join("\n")}\n\n_v${data.patch}_`;
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
  const text = mechanicsToText(findMechanics(data.mechanics, question), data.locale);
  if (!text) return undefined;
  return `${text}\n\n_v${data.patch}_`;
}

/** 문서 id(`mech:스킬-가속`)로 답한다. 검색 벡터가 고른 절을 보일 때 쓴다. */
export function buildMechanicsAnswerById(data: AdvisorData, id: string): string | undefined {
  const section = data.mechanics.find((entry) => `mech:${entry.id}` === id);
  const text = section ? mechanicsToText([section], data.locale) : undefined;
  if (!text) return undefined;
  return `${text}\n\n_v${data.patch}_`;
}

/** 설명문은 HTML 이라 그대로 실으면 태그가 답에 샌다. */

export { buildItemAnswer,buildItemCard } from "../answers/builders/itemAnswer";
