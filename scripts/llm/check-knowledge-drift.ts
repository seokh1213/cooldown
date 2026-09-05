/**
 * 지식 카드가 낡았는지 검사한다
 *
 * 사실 카드와 통계는 패치마다 자동으로 다시 만들어진다. **사람이 쓴 지식 카드만 그대로 남는다.**
 * 3,380항목이 전부 `verifiedPatch: "26.17"` 에 묶여 있는데, 패치가 넘어가면 그중 무엇이
 * 실제로 틀렸는지 알 방법이 없다. 리워크된 챔피언의 콤보 설명이 조용히 거짓이 된다.
 *
 * 그래서 **스킬 설명이 바뀐 챔피언**을 찾아 그 챔피언의 카드를 재검토 대상으로 올린다.
 * 전부를 다시 쓰라는 게 아니라, 다시 볼 것만 골라 준다.
 *
 * 판정 기준
 * - 스킬 이름이 바뀌면 리워크다. 그 챔피언 카드는 통째로 다시 봐야 한다.
 * - 설명 문장이 오가면 판정이나 수치가 바뀐 것이다. 해당 슬롯을 언급한 항목만 본다.
 * - 표현만 다듬은 것은 걸러 낸다. 글자 조각이 대부분 남아 있으면 같은 내용으로 본다.
 *
 * 사용:
 *   npm run llm:check-drift                 # 카드의 verifiedPatch 와 현재 패치를 비교
 *   npm run llm:check-drift -- --since 26.10
 *   npm run llm:check-drift -- --json
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import {
  fetchDDragonVersions,
  fetchPatchChampions,
  lostSentences,
  SLOTS,
  slotText,
  toOfficialPatchVersion,
  type PatchChampion,
  type Slot,
} from "./lib/patchHistory";
import { loadPlaybooks } from "./lib/playbook";
import type { PlaybookEntry } from "./lib/playbookCore";

export const DRIFT_FILE = "knowledge-drift.json";

export type DriftKind = "renamed" | "changed";

export interface AbilityDrift {
  slot: Slot;
  kind: DriftKind;
  before: string;
  after: string;
  /** 사라지거나 새로 생긴 문장 (최대 3개) */
  samples: string[];
}

export interface ChampionDrift {
  championId: string;
  championName: string;
  fromPatch: string;
  toPatch: string;
  abilities: AbilityDrift[];
  /** 다시 봐야 할 지식 카드 항목 id */
  affectedEntries: string[];
}

export interface DriftReport {
  currentPatch: string;
  generatedAt: string;
  comparedFrom: string;
  championCount: number;
  entryCount: number;
  champions: ChampionDrift[];
}

/** 이 항목이 그 슬롯을 언급하는가 */
function mentionsSlot(entry: PlaybookEntry, slot: Slot, abilityName: string): boolean {
  const text = entry.text;
  if (abilityName && text.includes(abilityName)) return true;
  // "Q 는", "R 로", "E 사거리" 처럼 슬롯 문자를 단독으로 쓴 경우
  return new RegExp(`(^|[\\s(])${slot}([\\s)]|을|를|은|는|로|가|의|\\b)`).test(text);
}

function diffAbility(
  before: PatchChampion,
  after: PatchChampion,
  slot: Slot,
): AbilityDrift | undefined {
  const oldSide = slotText(before, slot);
  const newSide = slotText(after, slot);
  if (!oldSide.text.trim() || !newSide.text.trim()) return undefined;

  if (oldSide.name && newSide.name && oldSide.name !== newSide.name) {
    return {
      slot,
      kind: "renamed",
      before: oldSide.name,
      after: newSide.name,
      samples: [],
    };
  }

  // 양방향으로 본다. 사라진 문장과 새로 생긴 문장 모두 변경 신호다.
  const removed = lostSentences(oldSide.text, newSide.text);
  const added = lostSentences(newSide.text, oldSide.text);
  if (!removed.length && !added.length) return undefined;

  return {
    slot,
    kind: "changed",
    before: oldSide.name,
    after: newSide.name,
    samples: [
      ...removed.slice(0, 2).map((s) => `− ${s.text}`),
      ...added.slice(0, 2).map((s) => `+ ${s.text}`),
    ].slice(0, 3),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const currentPatch = resolvePatchVersion();
  const playbooks = loadPlaybooks();

  // 카드가 어느 패치에서 검증됐는지. 여러 값이 섞이면 가장 오래된 것을 기준으로 본다.
  const verified = new Set<string>();
  for (const book of playbooks.values()) {
    for (const entry of [...book.playing, ...book.against]) {
      if (entry.verifiedPatch) verified.add(entry.verifiedPatch);
    }
  }
  const comparedFrom =
    get("--since") ?? [...verified].sort()[0] ?? currentPatch;

  console.log(`# 지식 카드 낡음 검사\n`);
  console.log(`기준 패치 ${comparedFrom} → 현재 패치 ${currentPatch}`);
  if (comparedFrom === currentPatch) {
    console.log("\n같은 패치다. 비교할 것이 없다. `--since <패치>` 로 지난 패치와 견줄 수 있다.");
    return;
  }

  const versions = await fetchDDragonVersions();
  const findVersion = (patch: string) =>
    versions.find((v) => toOfficialPatchVersion(v) === patch);
  const fromVersion = findVersion(comparedFrom);
  const toVersion = findVersion(currentPatch);
  if (!fromVersion || !toVersion) {
    throw new Error(`DDragon 목록에서 패치를 찾지 못했다: ${comparedFrom} / ${currentPatch}`);
  }

  const [before, after] = await Promise.all([
    fetchPatchChampions(fromVersion),
    fetchPatchChampions(toVersion),
  ]);

  const champions: ChampionDrift[] = [];
  let entryCount = 0;

  for (const [championId, book] of playbooks) {
    const oldChampion = before.get(championId);
    const newChampion = after.get(championId);
    // 그 패치에 없던 챔피언이면 비교 대상이 아니다
    if (!oldChampion || !newChampion) continue;

    const abilities = SLOTS.map((slot) => diffAbility(oldChampion, newChampion, slot)).filter(
      (d): d is AbilityDrift => !!d,
    );
    if (!abilities.length) continue;

    const renamed = abilities.some((a) => a.kind === "renamed");
    const entries = [...book.playing, ...book.against];
    // 이름이 바뀌었으면 리워크다. 그 챔피언 카드는 전부 다시 본다.
    const affected = renamed
      ? entries
      : entries.filter((entry) =>
          abilities.some((a) => mentionsSlot(entry, a.slot, a.after || a.before)),
        );

    entryCount += affected.length;
    champions.push({
      championId,
      championName: newChampion.name,
      fromPatch: comparedFrom,
      toPatch: currentPatch,
      abilities,
      affectedEntries: affected.map((e) => e.id).filter((id): id is string => Boolean(id)),
    });
  }

  champions.sort((a, b) => b.affectedEntries.length - a.affectedEntries.length);

  const report: DriftReport = {
    currentPatch,
    generatedAt: new Date().toISOString(),
    comparedFrom,
    championCount: champions.length,
    entryCount,
    champions,
  };

  const out = path.join(PUBLIC_DATA_ROOT, currentPatch, "llm", DRIFT_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

  if (argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n스킬이 바뀐 챔피언 ${champions.length}종, 다시 볼 항목 ${entryCount}건`);
  console.log(`저장: ${path.relative(process.cwd(), out)}\n`);
  for (const champion of champions.slice(0, 25)) {
    const marks = champion.abilities
      .map((a) => (a.kind === "renamed" ? `${a.slot} 리워크(${a.before}→${a.after})` : a.slot))
      .join(", ");
    console.log(`${champion.championName.padEnd(10)} ${marks}  → 항목 ${champion.affectedEntries.length}건`);
    for (const ability of champion.abilities.slice(0, 2)) {
      for (const sample of ability.samples.slice(0, 1)) {
        console.log(`   ${ability.slot} ${sample.slice(0, 100)}`);
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error("검사 실패", error);
  process.exit(1);
});
