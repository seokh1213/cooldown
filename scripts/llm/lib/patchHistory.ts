/**
 * 패치 히스토리 조회
 *
 * 현재 패치에 없는 설명을 과거 패치에서 찾을 때 쓴다. 두 가지 결측을 구분한다.
 *
 * 1. **자리표시자 결측** — 본문은 있는데 참조를 못 풀어 `?` 나 토큰이 남은 경우.
 *    우리 파서의 한계라 과거 패치에서도 같은 자리가 비어 있을 때가 많다.
 * 2. **문장 소실** — 예전 패치 설명에 있던 문장이 지금은 통째로 빠진 경우.
 *    라이엇이 요약문을 줄이면서 메커니즘 서술을 지운 경우가 여기 해당한다.
 *    (코르키 짐 꾸러미는 13.24 까지 패시브 설명에 있었고 그 뒤 사라졌다.)
 *
 * DDragon 의 `championFull.json` 은 전 챔피언의 패시브·스킬 설명을 한 파일에 담는다.
 * 패치 하나당 요청 한 번이면 되므로 수십 패치를 거슬러 올라가도 부담이 적다.
 */
import * as fs from "fs";
import * as path from "path";
import { toOfficialPatchVersion } from "../../../src/lib/staticDataRelease";
import { stripHtml } from "./text";

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CACHE_ROOT = path.resolve(process.cwd(), "research", ".patch-cache");

export interface PatchSpell {
  id: string;
  name: string;
  description: string;
  tooltip: string;
}

export interface PatchChampion {
  id: string;
  name: string;
  passive: { name: string; description: string };
  spells: PatchSpell[];
}

export type PatchChampions = Map<string, PatchChampion>;

interface ChampionFullResponse {
  data?: Record<
    string,
    {
      id: string;
      name: string;
      passive?: { name?: string; description?: string };
      spells?: Array<{
        id?: string;
        name?: string;
        description?: string;
        tooltip?: string;
      }>;
    }
  >;
}

export async function fetchDDragonVersions(): Promise<string[]> {
  const file = path.join(CACHE_ROOT, "versions.json");
  // 버전 목록은 자주 바뀌므로 6시간만 재사용한다
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 6 * 3600_000) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as string[];
  }
  const versions = (await (await fetch(VERSION_URL)).json()) as string[];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(versions), "utf8");
  return versions;
}

/**
 * 한 패치의 전 챔피언 설명을 가져온다. 패치당 요청 한 번.
 *
 * 응답 원본은 1.8MB 가 넘고 우리가 쓰는 것은 설명뿐이라, 캐시에는 추려서 담는다.
 * 수십 패치를 거슬러 올라가므로 원본을 그대로 두면 캐시가 금세 백 메가를 넘긴다.
 */
export async function fetchPatchChampions(
  ddragonVersion: string,
  locale = "ko_KR",
): Promise<PatchChampions> {
  const file = path.join(CACHE_ROOT, ddragonVersion, `descriptions-${locale}.json`);
  if (fs.existsSync(file)) {
    const cached = JSON.parse(fs.readFileSync(file, "utf8")) as PatchChampion[];
    return new Map(cached.map((c) => [c.id, c]));
  }

  const url = `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/${locale}/championFull.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`championFull ${ddragonVersion}/${locale}: HTTP ${res.status}`);
  const body = (await res.json()) as ChampionFullResponse;

  const champions: PatchChampion[] = [];
  for (const [id, champion] of Object.entries(body.data ?? {})) {
    champions.push({
      id,
      name: champion.name ?? id,
      passive: {
        name: champion.passive?.name ?? "",
        description: champion.passive?.description ?? "",
      },
      spells: (champion.spells ?? []).map((spell) => ({
        id: spell.id ?? "",
        name: spell.name ?? "",
        description: spell.description ?? "",
        tooltip: spell.tooltip ?? "",
      })),
    });
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(champions), "utf8");
  return new Map(champions.map((c) => [c.id, c]));
}

export const SLOTS = ["P", "Q", "W", "E", "R"] as const;
export type Slot = (typeof SLOTS)[number];

/**
 * DDragon 의 `tooltip` 은 `{{ totaldamagepersecond }}` 같은 치환 자리를 그대로 담고 있다.
 * 자리 이름은 패치마다 바뀌므로 비교에 쓰면 멀쩡한 문장이 사라진 것처럼 보인다. 값 자리를 지운다.
 */
function stripTemplates(text: string): string {
  return text
    .replace(/\{\{[^}]*\}\}/g, " ")
    .replace(/@[A-Za-z0-9_.*+-]+@/g, " ")
    .replace(/\(?%i:[A-Za-z0-9_]+%\)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slotText(champion: PatchChampion, slot: Slot): { name: string; text: string } {
  if (slot === "P") {
    return {
      name: champion.passive.name,
      text: stripTemplates(stripHtml(champion.passive.description)),
    };
  }
  const index = SLOTS.indexOf(slot) - 1;
  const spell = champion.spells[index];
  if (!spell) return { name: "", text: "" };
  return {
    name: spell.name,
    // 요약(description)과 상세(tooltip)를 모두 본다. 둘 중 한쪽에서만 사라지기도 한다.
    text: `${stripTemplates(stripHtml(spell.description))}\n${stripTemplates(stripHtml(spell.tooltip))}`,
  };
}

/* -------------------------------------------------------------- 문장 비교 */

/** 문장 단위로 자른다. 한국어 설명은 마침표로 끊기지 않는 경우가 많아 줄바꿈도 경계로 본다. */
export function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    // 자리 이름을 지운 뒤 "초당 총 피해량:" 처럼 껍데기만 남은 조각은 버린다
    .filter((s) => s.replace(/[\d.,%/~()[\]{}+\-:\s]/g, "").length >= 10);
}

/** 수치와 서식을 지운다. 패치마다 값이 바뀌므로 문장 동일성 판정에서 제외한다. */
function normalize(sentence: string): string {
  return sentence
    .replace(/[\d.,%/~()[\]{}+\-–—:;'"·]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function bigrams(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 2 <= text.length; i += 1) out.push(text.slice(i, i + 2));
  return out;
}

/** 과거 문장의 글자 조각이 현재 본문에 얼마나 남아 있는지 */
function coverage(sentence: string, corpus: string): number {
  const grams = bigrams(sentence);
  if (!grams.length) return 1;
  let kept = 0;
  for (const g of grams) if (corpus.includes(g)) kept += 1;
  return kept / grams.length;
}

/**
 * 문장이 재작성만 된 것인지 통째로 사라진 것인지 가르는 기준.
 *
 * 문장끼리 유사도를 재면 안 된다. 라이엇은 한 문장을 여러 문장으로 쪼개거나 어순을 바꾸는데,
 * 그때마다 문장 단위 유사도가 뚝 떨어져 멀쩡히 살아 있는 설명이 사라진 것처럼 잡힌다.
 * 대신 과거 문장의 글자 조각이 **현재 챔피언 본문 전체**에 얼마나 남아 있는지를 본다.
 * 표현이 바뀌어도 고유한 낱말(폭탄 꾸러미, 저지 불가)은 남으므로, 포함률이 낮다는 것은
 * 그 개념 자체가 본문에서 없어졌다는 뜻이다.
 */
const KEPT_RATIO = 0.62;

export interface LostCandidate {
  text: string;
  /** 현재 본문에 남아 있는 글자 조각의 비율. 낮을수록 확실히 사라진 것 */
  kept: number;
}

/**
 * 과거 문장 중 현재 본문에서 자취를 찾을 수 없는 것을 고른다.
 *
 * 문장이 사라진 이유는 두 가지이고 자동으로는 구분되지 않는다.
 * - 설명만 줄어든 경우: 메커니즘은 그대로다. 되살릴 값어치가 있다.
 * - 실제로 삭제·변경된 경우: 그 패치에서 메커니즘이 바뀐 것이다. 되살리면 틀린 설명이 된다.
 * 그래서 판정을 단정하지 않고 `kept` 점수를 함께 돌려준다. 사람이 낮은 것부터 확인한다.
 */
export function lostSentences(pastText: string, currentText: string): LostCandidate[] {
  const corpus = normalize(currentText);
  const lost: LostCandidate[] = [];
  for (const sentence of toSentences(pastText)) {
    const norm = normalize(sentence);
    if (!norm) continue;
    if (corpus.includes(norm)) continue;
    const kept = coverage(norm, corpus);
    if (kept >= KEPT_RATIO) continue;
    lost.push({ text: sentence, kept: Number(kept.toFixed(3)) });
  }
  return lost;
}

export { toOfficialPatchVersion };

/* ------------------------------------------------- 현재 패치 본문 (비교 기준) */

/**
 * 비교의 기준은 **현재 로컬 데이터의 본문**이다.
 *
 * DDragon 의 요약문끼리 비교하면 오탐이 쏟아진다. 라이엇이 요약을 줄여도 상세 툴팁에는
 * 그 내용이 남아 있는 경우가 대부분이기 때문이다. 우리가 실제로 쓰는 본문은 CommunityDragon
 * 으로 조립한 `bodyHtml` 이고 이쪽이 훨씬 촘촘하므로, 과거 문장이 여기에도 없을 때만
 * 진짜로 사라진 것으로 본다.
 *
 * 슬롯을 가리지 않고 챔피언 전체 본문과 대조한다. 설명이 패시브에서 스킬로 옮겨 가기도 한다.
 */
export interface CurrentAbilityText {
  bySlot: Record<string, { name: string; text: string }>;
  whole: string;
}

export function loadCurrentText(
  championDetail: {
    champion: {
      abilities?: Record<string, { name?: string; summary?: string; bodyHtml?: string }>;
    };
  },
): CurrentAbilityText {
  const bySlot: Record<string, { name: string; text: string }> = {};
  const parts: string[] = [];
  for (const [slot, ability] of Object.entries(championDetail.champion.abilities ?? {})) {
    const text = stripTemplates(
      `${stripHtml(ability.summary)}\n${stripHtml(ability.bodyHtml)}`,
    );
    bySlot[slot] = { name: ability.name ?? "", text };
    parts.push(text);
  }
  return { bySlot, whole: parts.join("\n") };
}
