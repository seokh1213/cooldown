/**
 * 브라우저 상성 컨텍스트 조립
 *
 * CLI 와 **같은 코드로** 프롬프트를 만든다. `scripts/llm/lib/` 의 조립 로직은 파일을 읽지 않으므로
 * 그대로 가져다 쓸 수 있고, 여기서는 파일 대신 `fetch` 로 재료를 모아 넘기기만 한다.
 * 조립을 따로 구현하면 CLI 에서 잰 품질이 브라우저에서 재현된다는 보장이 사라진다.
 *
 * 받아 오는 재료
 * - 사실 카드: `llm/champion-cards-<locale>.json` (`npm run llm:build` 산출물)
 * - 지식 카드: `llm/advisor-knowledge.json` (`npm run llm:bundle` 산출물)
 * - 통계 오라클: `oracle/lolps-*.json`
 * - 아이템·룬·주문·아이템 위키 분류: 앱이 이미 쓰는 정규화 데이터
 *
 * 합쳐 7MB 남짓이다. 모델이 3GB 인 것에 비하면 작고, 한 번 받으면 캐시에 남는다.
 */
import { championCardToText, type ChampionCard } from "../../../scripts/llm/lib/facts";
import { selectTips, type CuratedTip } from "../../../scripts/llm/lib/knowledgeCore";
import {
  oracleFacts,
  selectLane,
  type OracleBundle,
  type OracleFile,
} from "../../../scripts/llm/lib/oracleCore";
import { matchupToLine } from "../../../scripts/llm/lib/matchupReason";
import {
  playbookToText,
  selectPlaybook,
  type Playbook,
} from "../../../scripts/llm/lib/playbookCore";
import {
  buildSections,
  renderDecidedSections,
  type MatchupContext,
  type PromptSection,
} from "../../../scripts/llm/lib/prompt";
import {
  selectDefensiveItems,
  selectKeystones,
  selectRiftSummoners,
} from "../../../scripts/llm/lib/retrieval";
import type { WikiItemMeta } from "../../../scripts/llm/lib/data";
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
  oracleFile?: string;
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
  items: NormalizedItem[];
  runes: NormalizedRune[];
  summoners: NormalizedSummonerSpell[];
  wikiItems: Map<string, WikiItemMeta>;
  oracle?: OracleBundle;
}

function dataUrl(patch: string, relative: string): string {
  return `${import.meta.env.BASE_URL}data/${patch}/${relative}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** 오라클 파일 이름에는 지역·티어가 들어가 고정할 수 없어 지식 번들이 알려 준다 */
async function loadOracle(patch: string, file?: string): Promise<OracleBundle | undefined> {
  if (!file) return undefined;
  try {
    const parsed = await getJson<OracleFile>(dataUrl(patch, `oracle/${file}`));
    const { champions, ...meta } = parsed;
    return {
      meta,
      fileName: file,
      byChampion: new Map(champions.map((c) => [c.id, c])),
    };
  } catch {
    // 통계는 없어도 조언이 나온다. 조용히 건너뛴다.
    return undefined;
  }
}

let cached: Promise<AdvisorData> | null = null;

/** 재료를 한 번만 받아 두고 재사용한다 */
export function loadAdvisorData(patch: string, locale = "ko_KR"): Promise<AdvisorData> {
  if (cached) return cached;
  cached = (async () => {
    // 지식 번들이 오라클 파일 이름을 들고 있으므로 먼저 받는다
    const knowledge = await getJson<KnowledgeBundle>(
      dataUrl(patch, "llm/advisor-knowledge.json"),
    );
    const [cardFile, itemFile, runeFile, summonerFile, wikiItemFile, oracle] =
      await Promise.all([
        getJson<ChampionCardFile>(dataUrl(patch, `llm/champion-cards-${locale}.json`)),
        getJson<ItemFile>(dataUrl(patch, `items-normalized-${locale}.json`)),
        getJson<RuneFile>(dataUrl(patch, `runes-normalized-${locale}.json`)),
        getJson<SummonerFile>(dataUrl(patch, `summoner-normalized-${locale}.json`)),
        getJson<WikiItemFile>(dataUrl(patch, "llm/item-wiki-meta.json")).catch(
          (): WikiItemFile => ({}),
        ),
        loadOracle(patch, knowledge.oracleFile),
      ]);

    return {
      patch,
      knowledgePatch: knowledge.patchVersion,
      stale: knowledge.patchVersion !== patch,
      cards: cardFile.cards,
      cardById: new Map(cardFile.cards.map((c) => [c.id, c])),
      playbooks: new Map(Object.entries(knowledge.playbooks)),
      tips: knowledge.tips,
      items: itemFile.items,
      runes: runeFile.runes,
      summoners: summonerFile.spells,
      // Node 로더와 같은 키를 쓴다. 이름이 아니라 아이템 id 다.
      wikiItems: new Map((wikiItemFile.items ?? []).map((i) => [i.id, i])),
      oracle,
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

export interface MatchupRequest {
  me: ChampionCard;
  enemy: ChampionCard;
  lane?: string;
}

export interface BuiltMatchup {
  ctx: MatchupContext;
  /** 코드가 확정한 구간. 모델을 거치지 않고 그대로 보여 준다. */
  decided: string;
  /** 서술 구간. 호출마다 프롬프트가 다르다. */
  sections: PromptSection[];
}

/**
 * CLI 의 `buildMatchupContext` 와 같은 순서로 조립한다.
 *
 * 프로필은 `web` 을 쓴다. 후보 목록과 룬 목록, 공식 팁을 빼고 결론만 남겨
 * 호출당 프롬프트를 3~5k 토큰으로 유지한다.
 */
export function buildMatchup(data: AdvisorData, request: MatchupRequest): BuiltMatchup {
  const { me, enemy, lane } = request;

  const tips = selectTips(data.tips, { me: me.id, enemy: enemy.id, lane });
  const playbook = selectPlaybook(data.playbooks, me, enemy, lane);

  // 지식 카드와 팁이 이름으로 지목한 아이템은 후보 목록에서 잘리지 않게 고정한다
  const pinnedNames = [
    ...new Set([
      ...[...playbook.mine, ...playbook.vsEnemy].flatMap((e) => e.refs?.items ?? []),
      ...tips.flatMap((t) => t.refs?.items ?? []),
    ]),
  ];

  const oracleLane = data.oracle
    ? selectLane(data.oracle.byChampion.get(me.id), lane)
    : undefined;
  const oracle =
    data.oracle && oracleLane ? oracleFacts(data.oracle, oracleLane) : undefined;

  const ctx: MatchupContext = {
    patch: data.patch,
    lane,
    me,
    enemy,
    items: selectDefensiveItems(data.items, enemy, {
      me,
      pinnedNames,
      wikiItems: data.wikiItems,
    }),
    playbook,
    keystones: selectKeystones(data.runes),
    summoners: selectRiftSummoners(data.summoners),
    tips,
    oracle,
    compact: true,
    profile: "web",
  };

  return { ctx, decided: renderDecidedSections(ctx), sections: buildSections(ctx) };
}

/**
 * 챔피언 하나에 대한 질문에 붙일 자료.
 *
 * "오공의 카운터는?" 처럼 상대가 없는 질문에도 근거가 필요하다. 자료 없이 두면
 * 모델이 "오공(Dragon Knight)" 같은 이름부터 지어낸다. 실제로 그렇게 답했다.
 *
 * 상성 조언과 달리 확정 구간이 없으므로 사실 카드와 지식 카드만 싣는다.
 * 통계는 그 챔피언이 실제로 뭘 사는지 알려 주므로 함께 넣는다.
 */
export function buildChampionBrief(data: AdvisorData, card: ChampionCard): string {
  const book = data.playbooks.get(card.id);
  const lines: string[] = [
    `[패치] ${data.patch}`,
    `[챔피언 자료]\n${championCardToText(card, { includeSpellText: false, spellDetail: "meta" })}`,
  ];

  if (book) {
    // 이 챔피언을 플레이할 때와 상대할 때를 모두 싣는다. 어느 쪽을 묻는지 알 수 없다.
    const selected = { mine: book.playing.slice(0, 10), vsEnemy: book.against.slice(0, 8) };
    lines.push(
      `[지식 카드 — 사람이 검증한 내용입니다. 이 표현을 따르십시오]\n${playbookToText(
        selected,
        card.name,
        card.name,
        data.patch,
      )}`,
    );
  }

  const lane = data.oracle ? selectLane(data.oracle.byChampion.get(card.id)) : undefined;
  if (data.oracle && lane) {
    const facts = oracleFacts(data.oracle, lane);
    lines.push(
      `[통계 — ${facts.scope}]\n${facts.lines.map((l) => `- ${l}`).join("\n")}`,
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
 * "오공 카운터가 뭐야" 처럼 **상대 챔피언을 골라 달라는** 질문에 붙일 자료.
 *
 * 지금까지 이 질문에 답할 수 없었다. 지식 카드는 챔피언 단위고 통계도 챔피언·라인 단위라
 * "누가 이 챔피언에게 강한가" 를 담은 데이터가 없었기 때문이다.
 * lol.ps 요약에 상성별 승률이 있어 그것을 싣는다.
 *
 * 승률의 방향에 주의한다. `hard` 의 winRate 는 **그 챔피언(오공)의** 승률이므로
 * 낮을수록 상대가 유리하다. 뒤집어 말해야 사용자가 헷갈리지 않는다.
 */
export function buildCounterBrief(
  data: AdvisorData,
  card: ChampionCard,
  lane?: string,
): string | undefined {
  const oracleLane = data.oracle ? selectLane(data.oracle.byChampion.get(card.id), lane) : undefined;
  const matchups = oracleLane?.matchups;
  if (!matchups?.hard.length) return undefined;

  const facts = data.oracle && oracleLane ? oracleFacts(data.oracle, oracleLane) : undefined;
  // 지식 패치가 어긋나면 승률을 답에 싣지 않는다. 이름과 이유만 남긴다.
  const useNumbers = !data.stale;
  const line = (m: { id: string; name: string; winRate: number; count: number }) =>
    matchupToLine(card, data.cardById.get(m.id), m, useNumbers);

  const parts = [
    `[패치] ${data.patch}`,
    `[질문 대상] ${card.name} (${oracleLane?.laneLabel ?? "주 라인"})`,
    `[${card.name}을(를) 상대로 강한 챔피언 — 유리한 순서]\n${matchups.hard.map(line).join("\n")}`,
  ];
  if (matchups.easy.length) {
    parts.push(
      `[${card.name}이(가) 편하게 상대하는 챔피언]\n${matchups.easy
        .map((m) => `- ${m.name}`)
        .join("\n")}`,
    );
  }
  if (facts && useNumbers) parts.push(`[통계 기준] ${facts.scope}`);
  if (data.stale) {
    parts.push(
      `[주의] 통계는 ${data.knowledgePatch} 패치 기준이고 지금은 ${data.patch} 패치다. ` +
        "승률 수치는 말하지 말고, 순서와 이유만 전하면서 패치가 지나 달라졌을 수 있다고 덧붙여라.",
    );
  }

  parts.push(
    `[요청] 위 "${card.name}을(를) 상대로 강한 챔피언" 목록의 **${matchups.hard.length}종을 모두** ` +
      "적힌 순서대로 답하십시오. 목록에 없는 챔피언을 추천하지 마십시오.\n" +
      "챔피언마다 한 줄로, **왜 유리한지 이유를 중심으로** 쓰십시오. " +
      "이유는 목록에 함께 적힌 문장을 쓰고, 없으면 이유 없이 이름만 적으십시오. " +
      (useNumbers
        ? "승률은 이름 뒤 괄호에 짧게만 덧붙입니다."
        : "승률 수치는 적지 마십시오."),
  );
  return parts.join("\n\n");
}
