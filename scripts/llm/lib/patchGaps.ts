/**
 * 과거 패치 소급 결과 읽기
 *
 * `npm run llm:fetch-fallbacks` 와 `npm run llm:find-lost` 가 만든 두 파일을 챔피언별로 꺼낸다.
 * 자료 묶음(`llm:source-pack`)이 이걸 실어 주면, 지식 카드를 쓰는 쪽에서
 * "현재 툴팁이 비어 있는 부분에 원래 무슨 설명이 있었는지"를 함께 볼 수 있다.
 *
 * 두 파일의 성격이 다르므로 섞지 않는다.
 * - `ability-fallbacks.json` : 자리표시자가 남은 자리를 과거 패치 본문으로 메운 것. 수치까지 들어 있다.
 * - `ability-lost-descriptions.json` : 과거에는 있었고 지금은 없는 문장. 확인 대기 목록이다.
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./data";

export interface AbilityFallback {
  slot: string;
  abilityName: string;
  gapKinds: string[];
  fromPatch: string;
  bodyText: string;
}

export interface AbilityLostSentence {
  slot: string;
  abilityName: string;
  lastSeenIn: string;
  kept: number;
  text: string;
}

export interface ChampionPatchGaps {
  fallbacks: AbilityFallback[];
  lost: AbilityLostSentence[];
  /** 소급했지만 끝내 못 채운 자리 */
  unresolved: Array<{ slot: string; abilityName: string; kinds: string[] }>;
}

interface FallbackFileShape {
  searchedPatches?: string[];
  entries?: Array<{
    championId: string;
    slot: string;
    abilityName: string;
    gaps?: Array<{ kind: string }>;
    recoveredFrom?: { patchVersion: string };
    text?: Record<string, { bodyHtml?: string }>;
  }>;
}

interface LostFileShape {
  entries?: Array<{
    championId: string;
    slot: string;
    abilityName: string;
    sentences?: Array<{ text: string; lastSeenIn: string; kept: number }>;
  }>;
}

function readJson<T>(patch: string, fileName: string): T | undefined {
  const file = path.join(PUBLIC_DATA_ROOT, patch, "llm", fileName);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

function toPlain(html: string | undefined): string {
  return (html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function loadPatchGaps(patch?: string): Map<string, ChampionPatchGaps> {
  const resolved = resolvePatchVersion(patch);
  const map = new Map<string, ChampionPatchGaps>();
  const ensure = (id: string): ChampionPatchGaps => {
    let entry = map.get(id);
    if (!entry) {
      entry = { fallbacks: [], lost: [], unresolved: [] };
      map.set(id, entry);
    }
    return entry;
  };

  const fallbackFile = readJson<FallbackFileShape>(resolved, "ability-fallbacks.json");
  for (const entry of fallbackFile?.entries ?? []) {
    const target = ensure(entry.championId);
    const kinds = (entry.gaps ?? []).map((g) => g.kind);
    if (entry.recoveredFrom && entry.text?.ko_KR) {
      target.fallbacks.push({
        slot: entry.slot,
        abilityName: entry.abilityName,
        gapKinds: kinds,
        fromPatch: entry.recoveredFrom.patchVersion,
        bodyText: toPlain(entry.text.ko_KR.bodyHtml),
      });
    } else {
      target.unresolved.push({ slot: entry.slot, abilityName: entry.abilityName, kinds });
    }
  }

  const lostFile = readJson<LostFileShape>(resolved, "ability-lost-descriptions.json");
  for (const entry of lostFile?.entries ?? []) {
    const target = ensure(entry.championId);
    for (const sentence of entry.sentences ?? []) {
      target.lost.push({
        slot: entry.slot,
        abilityName: entry.abilityName,
        lastSeenIn: sentence.lastSeenIn,
        kept: sentence.kept,
        text: sentence.text,
      });
    }
  }
  return map;
}

/** 자료 묶음에 실을 문단. 없으면 undefined. */
export function patchGapsToText(gaps: ChampionPatchGaps | undefined): string | undefined {
  if (!gaps) return undefined;
  if (!gaps.fallbacks.length && !gaps.lost.length && !gaps.unresolved.length) return undefined;

  const lines: string[] = [];
  if (gaps.fallbacks.length) {
    lines.push("### 과거 패치에서 메운 자리 (수치는 그 패치 기준)");
    for (const f of gaps.fallbacks) {
      lines.push(`[${f.slot}] ${f.abilityName} — ${f.fromPatch} 본문`);
      lines.push(`  ${f.bodyText.slice(0, 400)}`);
    }
  }
  if (gaps.lost.length) {
    lines.push("");
    lines.push("### 예전에는 있었고 지금은 없는 설명 (확인 필요)");
    lines.push("메커니즘이 남아 있는데 문장만 빠진 것일 수도, 그 패치에서 실제로 바뀐 것일 수도 있다.");
    for (const l of gaps.lost.slice(0, 12)) {
      lines.push(`[${l.slot}] ${l.abilityName} (${l.lastSeenIn}까지) ${l.text}`);
    }
  }
  if (gaps.unresolved.length) {
    lines.push("");
    lines.push(
      `### 소급해도 못 채운 자리: ${gaps.unresolved
        .map((u) => `${u.slot} ${u.abilityName}`)
        .join(", ")}`,
    );
    lines.push("이 스킬의 수치는 사실 카드의 계수·쿨타임을 보고, 본문 서술은 피한다.");
  }
  return lines.join("\n");
}
