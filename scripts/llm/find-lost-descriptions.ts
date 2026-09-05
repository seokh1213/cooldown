/**
 * 사라진 스킬 설명 찾기
 *
 * 라이엇이 설명을 줄이면서 메커니즘 서술이 통째로 빠지는 일이 있다.
 * 데이터에는 그 메커니즘이 남아 있는데 문장만 없어지므로, 현재 패치만 보면 존재를 알 수 없다.
 *
 * 실제 사례: 코르키의 짐 꾸러미는 13.24 패치까지 패시브 설명에 있었다.
 *   13.24 "코르키는 이따금 기지에서 폭탄 꾸러미를 회수합니다. … 발키리가 업그레이드됩니다."
 *   14.10 이후 이 두 문장이 사라졌고, 지금 설명에는 고정 피해 전환만 남아 있다.
 *   게임 데이터에는 여전히 `Corki_ThePackage` 아이콘과 `PackageDuration` 이 있다.
 *
 * 그래서 **직전 패치부터 거슬러 올라가며 지금은 없는 문장**을 찾는다.
 * 수치는 패치마다 바뀌므로 비교 전에 지운다. 표현만 바뀐 문장은 유사도로 걸러 낸다.
 *
 * 자리표시자(`?`)나 미해결 토큰이 남은 결측은 성격이 다르다.
 * 그쪽은 `npm run llm:fetch-fallbacks` 가 담당한다.
 *
 * 사용:
 *   npm run llm:find-lost                    # 기본 70패치 소급
 *   npm run llm:find-lost -- --depth 24      # 최근 1년만
 *   npm run llm:find-lost -- --champ Corki   # 한 챔피언만
 *   npm run llm:find-lost -- --min 2         # 문장 2개 이상 사라진 것만
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import {
  fetchDDragonVersions,
  fetchPatchChampions,
  loadCurrentText,
  lostSentences,
  SLOTS,
  slotText,
  toOfficialPatchVersion,
  type CurrentAbilityText,
  type PatchChampions,
  type Slot,
} from "./lib/patchHistory";

// 코르키 짐 꾸러미는 70패치 전에 사라졌다. 기본값이 얕으면 오래된 소실을 놓친다.
// 패치당 요청 한 번이고 캐시가 남으므로 깊게 잡아도 부담이 적다.
const DEFAULT_DEPTH = 70;
export const LOST_FILE = "ability-lost-descriptions.json";

export interface LostSentence {
  text: string;
  /** 이 문장이 마지막으로 남아 있던 패치 */
  lastSeenIn: string;
  /** 현재 본문에 남아 있는 글자 비율. 낮을수록 확실히 사라진 것 */
  kept: number;
}

export interface LostEntry {
  championId: string;
  championName: string;
  slot: Slot;
  abilityName: string;
  sentences: LostSentence[];
}

export interface LostFile {
  patchVersion: string;
  generatedAt: string;
  searchedPatches: string[];
  entryCount: number;
  sentenceCount: number;
  entries: LostEntry[];
}

/** 현재 패치의 로컬 챔피언 본문을 읽는다. 비교 기준은 이쪽이다. */
function loadLocalText(patch: string): Map<string, CurrentAbilityText> {
  const dir = path.join(PUBLIC_DATA_ROOT, patch, "champions", "ko_KR");
  const map = new Map<string, CurrentAbilityText>();
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "index.json") continue;
    const detail = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    map.set(file.replace(/\.json$/, ""), loadCurrentText(detail));
  }
  return map;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const depth = Number(get("--depth") ?? DEFAULT_DEPTH);
  const minSentences = Number(get("--min") ?? 1);
  const only = get("--champ")
    ? new Set(get("--champ")!.split(",").map((s) => s.trim()))
    : undefined;

  const patch = resolvePatchVersion();
  const versions = await fetchDDragonVersions();
  const currentIndex = versions.findIndex((v) => toOfficialPatchVersion(v) === patch);
  if (currentIndex < 0) throw new Error(`DDragon 버전 목록에서 ${patch} 를 찾지 못했다`);

  console.log(`# ${patch} 사라진 스킬 설명 찾기\n`);
  const current = await fetchPatchChampions(versions[currentIndex]);
  const currentText = loadLocalText(patch);
  const older = versions.slice(currentIndex + 1, currentIndex + 1 + depth);
  console.log(
    `소급 대상 ${older.length}개 패치: ${toOfficialPatchVersion(older[0])} → ${toOfficialPatchVersion(older[older.length - 1])}\n`,
  );

  // championId|slot|정규화문장 → 가장 최근에 그 문장이 있던 패치
  const seen = new Map<string, LostSentence & { championId: string; slot: Slot }>();
  const searchedPatches: string[] = [];

  for (const version of older) {
    const patchVersion = toOfficialPatchVersion(version);
    let past: PatchChampions;
    try {
      past = await fetchPatchChampions(version);
    } catch (error) {
      console.log(`  ! ${patchVersion} 조회 실패: ${(error as Error).message}`);
      continue;
    }
    searchedPatches.push(patchVersion);

    let found = 0;
    for (const [championId, pastChampion] of past) {
      if (only && !only.has(championId)) continue;
      const currentChampion = current.get(championId);
      if (!currentChampion) continue; // 그 뒤 삭제된 챔피언
      const local = currentText.get(championId);
      if (!local) continue;
      for (const slot of SLOTS) {
        const pastSlot = slotText(pastChampion, slot);
        const currentSlot = local.bySlot[slot];
        if (!pastSlot.text.trim() || !currentSlot?.text.trim()) continue;
        // 스킬 자체가 리워크로 이름까지 바뀌었으면 "사라진 문장"이 아니라 다른 스킬이다
        if (pastSlot.name && currentSlot.name && pastSlot.name !== currentSlot.name) continue;
        // 챔피언 본문 전체와 대조한다. 설명이 다른 슬롯으로 옮겨 갔을 수 있다.
        for (const candidate of lostSentences(pastSlot.text, local.whole)) {
          const key = `${championId}|${slot}|${candidate.text.replace(/[\d.,%\s]/g, "")}`;
          if (seen.has(key)) continue; // 더 최근 패치에서 이미 잡았다
          seen.set(key, {
            championId,
            slot,
            text: candidate.text,
            kept: candidate.kept,
            lastSeenIn: patchVersion,
          });
          found += 1;
        }
      }
    }
    console.log(`## ${patchVersion} — 이 패치에만 있던 문장 ${found}건`);
  }

  const byAbility = new Map<string, LostEntry>();
  for (const item of seen.values()) {
    const key = `${item.championId}|${item.slot}`;
    let entry = byAbility.get(key);
    if (!entry) {
      const champion = current.get(item.championId)!;
      entry = {
        championId: item.championId,
        championName: champion.name,
        slot: item.slot,
        abilityName: currentText.get(item.championId)?.bySlot[item.slot]?.name ?? "",
        sentences: [],
      };
      byAbility.set(key, entry);
    }
    entry.sentences.push({ text: item.text, kept: item.kept, lastSeenIn: item.lastSeenIn });
  }

  const entries = [...byAbility.values()].filter((e) => e.sentences.length >= minSentences);
  for (const entry of entries) {
    // 확실히 사라진 문장(kept 가 낮은 것)을 앞으로
    entry.sentences.sort((a, b) => a.kept - b.kept);
  }
  // 스킬도 가장 확실한 것부터 본다
  entries.sort((a, b) => a.sentences[0].kept - b.sentences[0].kept);

  const file: LostFile = {
    patchVersion: patch,
    generatedAt: new Date().toISOString(),
    searchedPatches,
    entryCount: entries.length,
    sentenceCount: entries.reduce((n, e) => n + e.sentences.length, 0),
    entries,
  };
  const out = path.join(PUBLIC_DATA_ROOT, patch, "llm", LOST_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(file, null, 2), "utf8");

  console.log(`\n스킬 ${file.entryCount}개에서 문장 ${file.sentenceCount}건이 사라졌다`);
  console.log(`저장: ${path.relative(process.cwd(), out)}`);
  console.log(
    "\n주의: 설명만 줄어든 경우와 그 패치에서 메커니즘이 실제로 바뀐 경우가 섞여 있다.\n" +
      "되살리기 전에 확인이 필요하다. kept 가 낮을수록 현재 본문에 흔적이 적다는 뜻이다.\n",
  );
  for (const entry of entries.slice(0, 30)) {
    console.log(`${entry.championId} ${entry.slot} ${entry.abilityName} (${entry.sentences.length}건)`);
    for (const s of entry.sentences.slice(0, 2)) {
      console.log(`  [${s.lastSeenIn} kept ${s.kept}] ${s.text.slice(0, 100)}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error("탐색 실패", error);
  process.exit(1);
});
