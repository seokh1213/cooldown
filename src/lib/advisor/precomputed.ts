/**
 * 미리 써 둔 상성 답 — 빌드할 때 큰 모델이 쓴 글을 조회해 보여 준다
 *
 * `scripts/llm/precompute-matchups.ts` 가 같은 포지션 쌍마다 주제별 2~4문장을 써 둔다
 * (llm/matchups/<내 챔피언>.json). 재료는 앱과 같은 검증된 노트·도출 문장이고, 스킬 이름·슬롯은
 * 코드 규칙(groundCommentary)으로 걸렀다. 앱은 주제 판정(topicFromWords·판정기)으로 칸 순서만 정한다.
 * 파일이 없거나 쌍이 없으면 undefined — 부르는 쪽이 노트 조립(`matchupDigest`)으로 간다.
 */
import type { Language } from "@/i18n";
import type { ChampionCard } from "@/lib/knowledge/facts";
import { checkedMatchupPair } from "./matchupFactCheck";
import { labelSlots } from "./slotLabels";
import { DIGEST_HEADINGS, FIGHT_TITLES } from "./prose";
import { dataUrl } from "./context";
import type { ScenarioCondition } from "./dialogueState";

export type PrecomputedKey = "watch" | "build" | "fight" | "laning" | "combo" | "escape" | "phase" | "teamfight";
export type PrecomputedPair = Partial<Record<PrecomputedKey, string>>;
export interface PrecomputedFile {
  patch: string;
  pairs: Record<string, PrecomputedPair>;
  /** 생성할 때의 재료 지문(상대 id → sha1 12자리). 앱은 쓰지 않는다 — 다시 쓸 쌍을 가리는 데 쓴다. */
  materials?: Record<string, string>;
}

/** 주제 → 맨 앞에 둘 칸 */
const LEAD: Record<string, PrecomputedKey> = {
  laning: "laning",
  combo: "combo",
  "escape-window": "escape",
  phase: "phase",
  teamfight: "teamfight",
  "situational-item": "build",
  skill: "watch",
  general: "watch",
};
const TOPIC_OF: Partial<Record<PrecomputedKey, string>> = { laning: "laning", combo: "combo", escape: "escape-window", phase: "phase", teamfight: "teamfight" };

/**
 * 칸 첫머리의 이음말을 뗀다. 생성 뒤 코드 규칙이 앞 문장을 버리면 "이후에는 미니언을 때려 …" 처럼
 * 앞이 없는 말로 시작했다.
 */
function leadClean(text: string): string {
  // "이후 라인을 밀고…", "그때 구체를…", "이 틈에 거리를…" 도 같은 흔적이다. 은행 7,416쌍에서 칸 첫머리의
  // 0.7~1.9%(laning·escape·phase·fight)가 이렇게 시작했다(`scripts/llm/audit-precomputed.ts`).
  return text.replace(/^(이후에는|이후에도|이후|그 뒤에는|그 뒤|그다음에는|그다음|그때는|그때|이때는|이때|이 틈에|그 틈에|그 사이에|그 순간|그래서|또한|또|다만|반대로|하지만|그러나)\s+/, "");
}

export interface PrecomputedSelection { text?: string; topics: PrecomputedKey[] }
export interface PrecomputedRequest {
  focus?: string;
  mode: "digest" | "topic" | "explain" | "advance";
  conditions?: ScenarioCondition[];
  shownTopics?: readonly string[];
}
const MORE_ORDER: PrecomputedKey[] = ["laning", "combo", "escape", "teamfight", "phase", "watch", "build", "fight"];

function digestKeys(focus: string | undefined): PrecomputedKey[] {
  const lead = LEAD[focus ?? "general"] ?? "watch";
  return [lead, ...(["watch", "build", "fight"] as PrecomputedKey[]).filter(key => key !== lead)].slice(0, 3);
}

function focusedKeys(pair: PrecomputedPair, request: PrecomputedRequest): PrecomputedKey[] {
  const conditions = request.conditions ?? [];
  let lead: PrecomputedKey = conditions.length && (request.focus === "skill" || request.focus === "general") ? "escape" : LEAD[request.focus ?? "general"] ?? "watch";
  if ((lead === "escape" || lead === "watch") && conditions.some(c => c.owner === "enemy" && c.status === "ready") && pair.watch) lead = "watch";
  if (!pair[lead]) return [];
  return request.mode === "explain" && lead !== "watch" && pair.watch ? [lead, "watch"] : [lead];
}

function renderSelection(pair: PrecomputedPair, keys: PrecomputedKey[], cards: ChampionCard[], lang: Language): PrecomputedSelection {
  const heading = DIGEST_HEADINGS[lang] ?? DIGEST_HEADINGS.ko_KR;
  const topics = keys.filter(key => pair[key]);
  const paragraphs = topics.map(key => {
    const title = key === "watch" || key === "build" || key === "fight" ? heading[key] : (FIGHT_TITLES[lang] ?? FIGHT_TITLES.ko_KR)[TOPIC_OF[key] ?? ""] ?? heading.fight;
    return `**${title}**\n${labelSlots(leadClean(pair[key]!), cards)}`;
  });
  return { text: paragraphs.join("\n\n") || undefined, topics };
}

/** 실제로 보여준 칸을 함께 반환한다. 남은 칸이 없으면 이전 답으로 되돌아가지 않는다. */
export function selectPrecomputed(input: PrecomputedPair, request: PrecomputedRequest, cards: ChampionCard[], lang: Language = "ko_KR"): PrecomputedSelection {
  const pair = checkedMatchupPair(input, cards);
  let keys: PrecomputedKey[];
  if (request.mode === "advance") {
    const shown = new Set(request.shownTopics ?? []);
    keys = MORE_ORDER.filter(key => !shown.has(key) && pair[key]).slice(0, 3);
  } else if (request.mode === "digest" || request.mode === "topic" && request.focus === "general" && !request.conditions?.length) {
    keys = digestKeys(request.focus);
    if (!pair[keys[0]] || keys.filter(key => pair[key]).length < 2) return { topics: [] };
  } else keys = focusedKeys(pair, request);
  return renderSelection(pair, keys, cards, lang);
}

/** 기존 단일 질문 조회의 문자열 API. 대화 조립은 selectPrecomputed로 실제 칸을 기록한다. */
export function precomputedDigest(pair: PrecomputedPair, focus: string | undefined, cards: ChampionCard[], lang: Language = "ko_KR"): string | undefined {
  return selectPrecomputed(pair, { focus, mode: "digest" }, cards, lang).text;
}
export function precomputedMore(pair: PrecomputedPair, focus: string | undefined, cards: ChampionCard[], lang: Language = "ko_KR"): string | undefined {
  return selectPrecomputed(pair, { focus, mode: "advance", shownTopics: digestKeys(focus) }, cards, lang).text;
}
export function precomputedFocus(pair: PrecomputedPair, request: { focus?: string; reason?: boolean; conditions?: ScenarioCondition[] }, cards: ChampionCard[], lang: Language = "ko_KR"): string | undefined {
  return selectPrecomputed(pair, { ...request, mode: request.reason ? "explain" : "topic" }, cards, lang).text;
}

const files = new Map<string, Promise<PrecomputedFile | undefined>>();

/**
 * 내 챔피언의 미리 쓴 답 파일. 한 번 받은 것은 쥐고 있고, 없거나 못 받으면 undefined.
 * 챔피언마다 파일을 나눠 두어 물어본 챔피언 것만 받는다(같은 포지션 상대 40여 명, 수십 KB).
 */
export function loadPrecomputed(patch: string, championId: string, lang: Language = "ko_KR"): Promise<PrecomputedFile | undefined> {
  const key = `${patch}:${championId}:${lang}`;
  let hit = files.get(key);
  if (!hit) {
    // 한국어가 원본(<id>.json), 영어·중국어는 옮긴 것(<id>.<lang>.json). 없으면 노트 조립으로 간다.
    const file = lang === "ko_KR" ? `${championId}.json` : `${championId}.${lang}.json`;
    hit = fetch(dataUrl(patch, `llm/matchups/${file}`))
      .then((res) => (res.ok ? (res.json() as Promise<PrecomputedFile>) : undefined))
      .catch(() => undefined);
    files.set(key, hit);
  }
  return hit;
}
