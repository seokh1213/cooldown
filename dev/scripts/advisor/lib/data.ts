/**
 * 정적 데이터 로더 (public/data/<patch>/...)
 *
 * 챔피언 데이터는 로케일별 디렉터리에 챔피언 하나당 한 파일로 배포된다.
 *   public/data/<patch>/champions/<locale>/<ChampionId>.json
 *   public/data/<patch>/champions/<locale>/index.json  (목록)
 */
import * as fs from "fs";
import * as path from "path";
import { decodeDataManifest } from "../../../../src/domain/game/contracts/dataManifest";
import type {
  NormalizedItemDataFile,
  NormalizedRuneDataFile,
  NormalizedSummonerDataFile,
} from "../../../../src/domain/game/types/combatNormalized";
import type {
  ChampionRecord,
  RiotChampionMeta,
  WikiChampionMeta,
  WikiItemMeta,
} from "../../../../src/domain/knowledge/cards/sourceRecords";

export type LlmLocale = "ko_KR" | "en_US" | "zh_CN";

export interface StaticDataBundle {
  patch: string;
  lang: LlmLocale;
  champions: ChampionRecord[];
  /** 라이엇 분류 메타데이터. 아직 수집하지 않았으면 빈 Map */
  riotMeta: Map<string, RiotChampionMeta>;
  /** LoL Wiki 분류 메타데이터. 아직 수집하지 않았으면 빈 Map */
  wikiMeta: Map<string, WikiChampionMeta>;
  /** LoL Wiki 아이템 상점 분류. 아직 수집하지 않았으면 빈 Map */
  wikiItemMeta: Map<string, WikiItemMeta>;
  items: NormalizedItemDataFile;
  runes: NormalizedRuneDataFile;
  summoners: NormalizedSummonerDataFile;
}

export const PUBLIC_DATA_ROOT = path.resolve(process.cwd(), "public", "data");

export function readCurrentPatchVersion(dataDirectory = PUBLIC_DATA_ROOT): string {
  const manifest = decodeDataManifest(JSON.parse(fs.readFileSync(path.join(dataDirectory, "version.json"), "utf8")));
  if (!/^\d+\.\d+$/.test(manifest.patchVersion)) throw new Error("Invalid current patch directory");
  return manifest.patchVersion;
}

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
    .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
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

function loadWikiItemMeta(base: string): Map<string, WikiItemMeta> {
  const file = path.join(base, "llm", "item-wiki-meta.json");
  const map = new Map<string, WikiItemMeta>();
  if (!fs.existsSync(file)) return map;
  const parsed = readJson<{ items?: WikiItemMeta[] }>(file);
  for (const meta of parsed.items ?? []) map.set(meta.id, meta);
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
    wikiItemMeta: loadWikiItemMeta(base),
    items: readJson<NormalizedItemDataFile>(path.join(base, `items-normalized-${lang}.json`)),
    runes: readJson<NormalizedRuneDataFile>(path.join(base, `runes-normalized-${lang}.json`)),
    summoners: readJson<NormalizedSummonerDataFile>(
      path.join(base, `summoner-normalized-${lang}.json`),
    ),
  };
}
