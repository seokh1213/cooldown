/**
 * 정적 데이터 로더 (public/data/<patch>/...)
 *
 * 챔피언 데이터는 로케일별 디렉터리에 챔피언 하나당 한 파일로 배포된다.
 *   public/data/<patch>/champions/<locale>/<ChampionId>.json
 *   public/data/<patch>/champions/<locale>/index.json  (목록)
 */
import * as fs from "fs";
import * as path from "path";
import type {
  ChampionBaseStats,
  ChampionSpellSlot,
  NormalizedItemDataFile,
  NormalizedRuneDataFile,
  NormalizedSummonerDataFile,
  NormalizedSpellScaling,
} from "../../../src/types/combatNormalized";

export type LlmLocale = "ko_KR" | "en_US";

export interface AbilityCostInfo {
  values: number[];
  resource?: string;
}

export interface AbilitySimulationTerm {
  stat: string;
  coefficientsByRank: number[];
}

export interface AbilitySimulation {
  status: "complete" | "unsupported" | "unavailable";
  primary?: {
    id: string;
    kind: string;
    baseByRank?: number[];
    terms?: AbilitySimulationTerm[];
  };
}

export interface ChampionAbility {
  slot: ChampionSpellSlot;
  id: string;
  name: string;
  maxRank?: number;
  /** 한 줄 요약 */
  summary?: string;
  /** 상세 설명 (HTML) */
  bodyHtml?: string;
  cooldownSeconds?: number[];
  cost?: AbilityCostInfo;
  range?: number[];
  rankValues?: Array<{ label: string; values: string }>;
  scalings?: NormalizedSpellScaling[];
  simulation?: AbilitySimulation;
}

export interface ChampionRecord {
  id: string;
  key: string;
  name: string;
  title?: string;
  tags?: string[];
  baseStats: ChampionBaseStats;
  abilities: Partial<Record<ChampionSpellSlot, ChampionAbility>>;
}

/** 라이엇 공식 챔피언 분류 (scripts/llm/fetch-riot-meta.ts 로 수집) */
export interface RiotChampionMeta {
  id: string;
  key: number;
  name: string;
  roles: string[];
  tagPrimary?: string;
  tagSecondary?: string;
  /** kPhysical | kMagic | kMixed | kTrue */
  damageType?: string;
  /** melee | ranged */
  attackType?: string;
  difficulty?: number;
  playstyle?: {
    damage: number;
    durability: number;
    crowdControl: number;
    mobility: number;
    utility: number;
  };
}

/** LoL Wiki(Fandom) 챔피언 분류 (scripts/llm/fetch-wiki-meta.ts 로 수집) */
export interface WikiChampionMeta {
  id: string;
  key?: number;
  /** 주 클래스 (Fighter, Tank, Mage, Marksman, Assassin, Support) */
  heroType?: string;
  /** 부 클래스 */
  altType?: string;
  /** 하위 클래스 (Juggernaut, Diver, Skirmisher, Vanguard, Warden, Battlemage, Burst, Artillery, Assassin, Enchanter, Catcher, Marksman, Specialist) */
  subclasses: string[];
  rangeType?: string;
  resource?: string;
  difficulty?: number;
  /** 클라이언트 기준 포지션 (Top, Jungle, Middle, Bottom, Support) */
  positions: string[];
  externalPositions: string[];
}

export interface StaticDataBundle {
  patch: string;
  lang: LlmLocale;
  champions: ChampionRecord[];
  /** 라이엇 분류 메타데이터. 아직 수집하지 않았으면 빈 Map */
  riotMeta: Map<string, RiotChampionMeta>;
  /** LoL Wiki 분류 메타데이터. 아직 수집하지 않았으면 빈 Map */
  wikiMeta: Map<string, WikiChampionMeta>;
  items: NormalizedItemDataFile;
  runes: NormalizedRuneDataFile;
  summoners: NormalizedSummonerDataFile;
}

export const PUBLIC_DATA_ROOT = path.resolve(process.cwd(), "public", "data");

export function resolvePatchVersion(explicit?: string): string {
  if (explicit) return explicit;
  const versionFile = path.join(PUBLIC_DATA_ROOT, "version.json");
  if (fs.existsSync(versionFile)) {
    const parsed = JSON.parse(fs.readFileSync(versionFile, "utf8")) as {
      patchVersion?: string;
    };
    if (parsed.patchVersion) return parsed.patchVersion;
  }
  const dirs = fs
    .readdirSync(PUBLIC_DATA_ROOT)
    .filter((d) => /^\d+\.\d+$/.test(d))
    .sort((a, b) => Number(b.split(".")[1]) - Number(a.split(".")[1]));
  if (dirs.length === 0) throw new Error("public/data 에 패치 디렉터리가 없습니다.");
  return dirs[0];
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function loadChampions(base: string, lang: LlmLocale): ChampionRecord[] {
  const dir = path.join(base, "champions", lang);
  if (!fs.existsSync(dir)) {
    throw new Error(`챔피언 데이터 디렉터리 부재: ${dir}`);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");
  const champions: ChampionRecord[] = [];
  for (const file of files.sort()) {
    const parsed = readJson<{ champion?: ChampionRecord }>(path.join(dir, file));
    if (parsed.champion) champions.push(parsed.champion);
  }
  return champions;
}

function loadRiotMeta(base: string, lang: LlmLocale): Map<string, RiotChampionMeta> {
  const file = path.join(base, "llm", `champion-riot-meta-${lang}.json`);
  const map = new Map<string, RiotChampionMeta>();
  if (!fs.existsSync(file)) return map;
  const parsed = readJson<{ champions?: RiotChampionMeta[] }>(file);
  for (const meta of parsed.champions ?? []) map.set(meta.id, meta);
  return map;
}

function loadWikiMeta(base: string): Map<string, WikiChampionMeta> {
  const file = path.join(base, "llm", "champion-wiki-meta.json");
  const map = new Map<string, WikiChampionMeta>();
  if (!fs.existsSync(file)) return map;
  const parsed = readJson<{ champions?: WikiChampionMeta[] }>(file);
  for (const meta of parsed.champions ?? []) map.set(meta.id, meta);
  return map;
}

export function loadStaticData(lang: LlmLocale = "ko_KR", patch?: string): StaticDataBundle {
  const resolvedPatch = resolvePatchVersion(patch);
  const base = path.join(PUBLIC_DATA_ROOT, resolvedPatch);
  return {
    patch: resolvedPatch,
    lang,
    champions: loadChampions(base, lang),
    riotMeta: loadRiotMeta(base, lang),
    wikiMeta: loadWikiMeta(base),
    items: readJson<NormalizedItemDataFile>(path.join(base, `items-normalized-${lang}.json`)),
    runes: readJson<NormalizedRuneDataFile>(path.join(base, `runes-normalized-${lang}.json`)),
    summoners: readJson<NormalizedSummonerDataFile>(
      path.join(base, `summoner-normalized-${lang}.json`),
    ),
  };
}
