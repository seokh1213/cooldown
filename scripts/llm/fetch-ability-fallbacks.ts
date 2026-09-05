/**
 * 스킬 설명 결측의 과거 패치 소급 탐색
 *
 * 현재 패치 데이터에는 설명이 비어 있거나 자리표시자로 남은 스킬이 있다.
 * 라이엇 원본 문자열이 그 패치에 없었거나, 툴팁의 참조 토큰을 우리 파서가 풀지 못한 경우다.
 * 이 스크립트는 그런 스킬을 **직전 패치 → 그 전 패치** 순으로 거슬러 올라가며 찾는다.
 *
 * 원칙
 * - **덮어쓰지 않는다.** 별도 오버레이 파일에 담고 어느 패치에서 가져왔는지 함께 적는다.
 *   과거 패치 수치는 지금과 다를 수 있으므로 출처 없이 섞으면 안 된다.
 * - **본문 생성 경로를 그대로 쓴다.** 결측 판정 기준이 현재 데이터와 어긋나지 않도록
 *   `scripts/data-pipeline` 의 정규화·툴팁 조립을 그대로 거친다.
 * - **결측이 남은 챔피언만 다음 패치로 넘긴다.** 패치 하나를 볼 때마다 대상이 줄어든다.
 *
 * 사용:
 *   npm run llm:fetch-fallbacks                 # 기본 6패치까지 소급
 *   npm run llm:fetch-fallbacks -- --depth 12   # 더 깊이
 *   npm run llm:fetch-fallbacks -- --scan       # 결측 목록만 출력하고 종료
 *   npm run llm:fetch-fallbacks -- --champ Corki,Smolder
 *   npm run llm:fetch-fallbacks -- --refresh    # 디스크 캐시 무시
 */
import * as fs from "fs";
import * as path from "path";
import type {
  AbilityV2,
  ChampionDetailV2,
} from "../../src/data/contracts/championData";
import { DATA_LOCALES, type DataLocale } from "../../src/data/contracts/staticData";
import { resolveStaticDataRelease } from "../../src/lib/staticDataRelease";
import type { Champion } from "../../src/types";
import { buildChampionDetailV2 } from "../data-pipeline/champion-data-v2";
import { extractActiveSpells } from "../data-pipeline/cdragon-active-spells";
import type { ChampionsByLocale } from "../data-pipeline/champion-source";
import {
  localizeActiveTooltips,
  localizePassiveTooltips,
} from "../data-pipeline/generation/tooltip-localizer";
import { normalizeChampion } from "../data-pipeline/normalization/champion";
import { fetchCDragonChampion } from "../data-pipeline/sources/cdragon-champion";
import { extractPassiveSpell } from "../passive-tooltip-data";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { stripHtml } from "./lib/text";

const VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const CACHE_ROOT = path.resolve(process.cwd(), "research", ".patch-cache");
const DEFAULT_DEPTH = 6;

/** 소급 결과를 읽는 쪽(사실 카드·자료 묶음)이 쓰는 파일 이름 */
export const FALLBACK_FILE = "ability-fallbacks.json";

export type GapKind = "empty" | "unresolvedTokens" | "placeholder";

export interface AbilityGap {
  kind: GapKind;
  /** unresolvedTokens 면 토큰 목록, placeholder 면 자리표시자가 낀 문장 */
  detail: string[];
}

export interface FallbackText {
  name: string;
  summary: string;
  bodyHtml: string;
}

export interface FallbackEntry {
  championId: string;
  championName: string;
  slot: string;
  abilityName: string;
  /** 현재 패치에서 무엇이 비었는지 */
  gaps: AbilityGap[];
  recoveredFrom?: {
    patchVersion: string;
    ddragon: string;
    cdragon: string;
  };
  /** 소급해서 찾은 설명. 로케일별 */
  text?: Partial<Record<DataLocale, FallbackText>>;
}

export interface FallbackFile {
  patchVersion: string;
  generatedAt: string;
  /** 거슬러 올라가며 확인한 패치 (오래된 쪽이 뒤) */
  searchedPatches: string[];
  recoveredCount: number;
  unresolvedCount: number;
  entries: FallbackEntry[];
}

/* ------------------------------------------------------------------ 결측 판정 */

/**
 * 툴팁 본문에 남은 자리표시자를 찾는다.
 *
 * 챔피언 스킬 설명은 의문문이 아니므로 물음표가 남아 있으면 참조를 풀지 못한 흔적이다.
 * 다만 실제 물음표를 쓰는 설명이 나중에 생길 수 있어, 문장 끝의 물음표는 제외한다.
 */
function findPlaceholders(text: string): string[] {
  const found: string[] = [];
  const re = /\?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const next = text[match.index + 1] ?? "";
    // 문장 끝 물음표(뒤가 공백이거나 끝)는 정상 문장으로 본다
    if (next === "" || next === " " || next === "\n") continue;
    const from = Math.max(0, match.index - 24);
    found.push(text.slice(from, match.index + 24).trim());
  }
  return found;
}

export function detectGaps(ability: AbilityV2): AbilityGap[] {
  const gaps: AbilityGap[] = [];
  const body = stripHtml(ability.bodyHtml);
  const summary = stripHtml(ability.summary);

  if (!body.trim() && !summary.trim()) {
    gaps.push({ kind: "empty", detail: [] });
    return gaps;
  }

  const tokens = ability.diagnostics?.unresolvedTokens ?? [];
  if (tokens.length) gaps.push({ kind: "unresolvedTokens", detail: [...tokens] });

  const placeholders = [...findPlaceholders(body), ...findPlaceholders(summary)];
  if (placeholders.length) {
    gaps.push({ kind: "placeholder", detail: placeholders.slice(0, 4) });
  }
  return gaps;
}

/* ------------------------------------------------------- 현재 패치 결측 수집 */

function championDir(patch: string, locale: DataLocale): string {
  return path.join(PUBLIC_DATA_ROOT, patch, "champions", locale);
}

function readDetail(patch: string, locale: DataLocale, championId: string): ChampionDetailV2 {
  const file = path.join(championDir(patch, locale), `${championId}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as ChampionDetailV2;
}

function listChampionIds(patch: string): string[] {
  return fs
    .readdirSync(championDir(patch, "ko_KR"))
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(/\.json$/, ""));
}

interface Target {
  championId: string;
  championName: string;
  slot: string;
  abilityName: string;
  gaps: AbilityGap[];
}

/**
 * 현재 패치에서 결측인 스킬을 모은다.
 *
 * 판정은 ko_KR 기준이다. 로케일마다 번역 진행도가 달라 한국어에서 비면 사용자에게 그대로 보이고,
 * 지식 카드도 한국어로 쓰기 때문이다.
 */
export function collectGapTargets(patch: string, only?: Set<string>): Target[] {
  const targets: Target[] = [];
  for (const championId of listChampionIds(patch)) {
    if (only && !only.has(championId)) continue;
    const detail = readDetail(patch, "ko_KR", championId);
    for (const [slot, ability] of Object.entries(detail.champion.abilities ?? {})) {
      const gaps = detectGaps(ability as AbilityV2);
      if (!gaps.length) continue;
      targets.push({
        championId,
        championName: detail.champion.name,
        slot,
        abilityName: (ability as AbilityV2).name,
        gaps,
      });
    }
  }
  return targets;
}

/* ------------------------------------------------------ 과거 패치 데이터 조립 */

function cachePath(ddragonVersion: string, kind: string, key: string): string {
  return path.join(CACHE_ROOT, ddragonVersion, kind, `${key}.json`);
}

async function cachedJson<T>(
  file: string,
  refresh: boolean,
  load: () => Promise<T>,
): Promise<T> {
  if (!refresh && fs.existsSync(file)) {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  }
  const value = await load();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value), "utf8");
  return value;
}

async function fetchDDragonChampion(
  ddragonVersion: string,
  locale: DataLocale,
  championId: string,
  refresh: boolean,
): Promise<Champion> {
  const file = cachePath(ddragonVersion, `ddragon-${locale}`, championId);
  return cachedJson(file, refresh, async () => {
    const url = `https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/data/${locale}/champion/${championId}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`DDragon ${championId}/${locale} @ ${ddragonVersion}: HTTP ${res.status}`);
    const body = (await res.json()) as { data?: Record<string, Champion> };
    const champion = body.data?.[championId];
    if (!champion) throw new Error(`DDragon 응답에 ${championId} 없음 (${ddragonVersion})`);
    return champion;
  });
}

/**
 * 한 챔피언의 과거 패치 스킬 데이터를 현재와 같은 경로로 조립한다.
 *
 * `generate-static-data` 와 같은 모듈을 쓰므로, 결측 판정 기준이 두 패치 사이에서 어긋나지 않는다.
 * 다만 디스크에는 쓰지 않는다. 과거 수치가 현재 데이터에 섞이면 안 되기 때문이다.
 */
async function buildPastDetail(
  ddragonVersion: string,
  championId: string,
  refresh: boolean,
): Promise<Partial<Record<DataLocale, ChampionDetailV2>>> {
  const release = resolveStaticDataRelease(ddragonVersion);
  const cdragonVersion = release.sources.cdragon;

  const byLocale = new Map<DataLocale, Map<string, Champion>>();
  for (const locale of DATA_LOCALES) {
    const champion = await fetchDDragonChampion(ddragonVersion, locale, championId, refresh);
    byLocale.set(locale, new Map([[championId, champion]]));
  }
  const championsByLocale = byLocale as unknown as ChampionsByLocale;

  const source = await cachedJson(
    cachePath(cdragonVersion, "cdragon", championId),
    refresh,
    () => fetchCDragonChampion(championId, cdragonVersion),
  );

  const activeSpells = extractActiveSpells(source, championId.toLowerCase());
  const passive = extractPassiveSpell(source, championId);

  const spellData: Record<string, unknown> = Object.fromEntries(
    Object.entries(activeSpells.aliases).map(([key, spell]) => {
      const { source: _source, ...calculation } = spell;
      return [key, calculation];
    }),
  );
  if (passive) {
    spellData.P = passive.spellData;
    spellData[passive.id] = passive.spellData;
  }

  const siblings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spellData)) {
    if (/^\d+$/.test(key)) continue;
    siblings[key.toLowerCase()] = value;
  }

  await localizeActiveTooltips(
    championsByLocale,
    championId,
    cdragonVersion,
    activeSpells.ordered,
    siblings as Parameters<typeof localizeActiveTooltips>[4],
  );
  await localizePassiveTooltips(championsByLocale, championId, cdragonVersion, passive);

  const details: Partial<Record<DataLocale, ChampionDetailV2>> = {};
  for (const locale of DATA_LOCALES) {
    const champion = byLocale.get(locale)?.get(championId);
    if (!champion) continue;
    const normalized = normalizeChampion({
      locale,
      championId,
      champion,
      spellData: spellData as Parameters<typeof normalizeChampion>[0]["spellData"],
    });
    details[locale] = buildChampionDetailV2({
      patchVersion: release.patchVersion,
      locale,
      sources: release.sources,
      champion,
      normalized,
      spellData: spellData as Parameters<typeof buildChampionDetailV2>[0]["spellData"],
    });
  }
  return details;
}

/* ---------------------------------------------------------------- 소급 실행 */

function abilityOf(detail: ChampionDetailV2 | undefined, slot: string): AbilityV2 | undefined {
  if (!detail) return undefined;
  return (detail.champion.abilities as Record<string, AbilityV2> | undefined)?.[slot];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const depth = Number(get("--depth") ?? DEFAULT_DEPTH);
  const refresh = argv.includes("--refresh");
  const only = get("--champ")
    ? new Set(get("--champ")!.split(",").map((s) => s.trim()))
    : undefined;

  const patch = resolvePatchVersion();
  const targets = collectGapTargets(patch, only);

  console.log(`# ${patch} 스킬 설명 결측 소급\n`);
  console.log(`결측 ${targets.length}건 (챔피언 ${new Set(targets.map((t) => t.championId)).size}종)`);
  const byKind = new Map<GapKind, number>();
  for (const t of targets) for (const g of t.gaps) byKind.set(g.kind, (byKind.get(g.kind) ?? 0) + 1);
  console.log(
    [...byKind].map(([k, v]) => `${k} ${v}`).join(", ") || "없음",
  );

  if (argv.includes("--scan")) {
    console.log("");
    for (const t of targets) {
      console.log(
        `${t.championId.padEnd(14)}${t.slot}  ${t.abilityName.padEnd(14)}` +
          t.gaps.map((g) => `${g.kind}(${g.detail.slice(0, 2).join(" / ") || "-"})`).join(" "),
      );
    }
    return;
  }
  if (!targets.length) return;

  const versions = (await (await fetch(VERSION_URL)).json()) as string[];
  const currentIndex = versions.findIndex(
    (v) => resolveStaticDataRelease(v).patchVersion === patch,
  );
  if (currentIndex < 0) throw new Error(`DDragon 버전 목록에서 ${patch} 를 찾지 못했다`);
  const older = versions.slice(currentIndex + 1, currentIndex + 1 + depth);
  console.log(`\n소급 대상 패치: ${older.map((v) => resolveStaticDataRelease(v).patchVersion).join(" → ")}\n`);

  const entries: FallbackEntry[] = targets.map((t) => ({ ...t }));
  const searchedPatches: string[] = [];

  for (const ddragonVersion of older) {
    const pending = entries.filter((e) => !e.recoveredFrom);
    if (!pending.length) break;
    const release = resolveStaticDataRelease(ddragonVersion);
    searchedPatches.push(release.patchVersion);

    const championIds = [...new Set(pending.map((e) => e.championId))];
    console.log(`## ${release.patchVersion} — 남은 결측 ${pending.length}건 / 챔피언 ${championIds.length}종`);

    for (const championId of championIds) {
      let details: Partial<Record<DataLocale, ChampionDetailV2>>;
      try {
        details = await buildPastDetail(ddragonVersion, championId, refresh);
      } catch (error) {
        console.log(`  ! ${championId} @ ${release.patchVersion} 조립 실패: ${(error as Error).message}`);
        continue;
      }
      for (const entry of pending.filter((e) => e.championId === championId)) {
        const past = abilityOf(details.ko_KR, entry.slot);
        if (!past) continue;
        if (detectGaps(past).length) continue; // 그 패치에도 결측이면 더 거슬러 올라간다
        entry.recoveredFrom = {
          patchVersion: release.patchVersion,
          ddragon: ddragonVersion,
          cdragon: release.sources.cdragon,
        };
        entry.text = {};
        for (const locale of DATA_LOCALES) {
          const ability = abilityOf(details[locale], entry.slot);
          if (!ability) continue;
          entry.text[locale] = {
            name: ability.name,
            summary: ability.summary,
            bodyHtml: ability.bodyHtml,
          };
        }
        console.log(`  ✓ ${championId} ${entry.slot} ${entry.abilityName} ← ${release.patchVersion}`);
      }
    }
  }

  const recovered = entries.filter((e) => e.recoveredFrom);
  const file: FallbackFile = {
    patchVersion: patch,
    generatedAt: new Date().toISOString(),
    searchedPatches,
    recoveredCount: recovered.length,
    unresolvedCount: entries.length - recovered.length,
    entries,
  };
  const out = path.join(PUBLIC_DATA_ROOT, patch, "llm", FALLBACK_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(file, null, 2), "utf8");

  console.log(`\n소급 완료 ${recovered.length}건 / 미해결 ${file.unresolvedCount}건`);
  console.log(`저장: ${path.relative(process.cwd(), out)}`);
  if (file.unresolvedCount) {
    console.log(`\n미해결 (${searchedPatches.length}개 패치 모두 결측):`);
    for (const e of entries.filter((x) => !x.recoveredFrom)) {
      console.log(`  ${e.championId} ${e.slot} ${e.abilityName} — ${e.gaps.map((g) => g.kind).join(",")}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error("소급 실패", error);
  process.exit(1);
});
