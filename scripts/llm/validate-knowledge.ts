/**
 * 지식 계층 검증
 *
 * 1) 팁/플레이북이 참조하는 챔피언 id 가 실제 존재하는지
 * 2) `refs` 에 적은 아이템/룬/소환사 주문 이름이 현재 패치 데이터에 존재하는지 (오타·삭제·개명 탐지)
 * 3) `refs`/`avoid` 이름이 생성 후 최종 본문에도 등장하는지; `reviewRefs`는 작성용 이름의 유효성만 검사
 * 4) 조건(`when`)의 효과 태그가 facts.ts 가 만들어내는 태그 집합에 있는지
 * 5) `refs` 의 아이템이 그 챔피언의 계수와 맞는지 (AP 챔피언에게 공격력 아이템을 권하지 않았는지)
 *
 * 자유 텍스트에서 고유명사를 추론하지 않는다. 작성자가 refs 로 명시하고 검증기가 대조한다.
 *
 * 사용: npm run llm:validate
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "node:url";
import { loadStaticData, PUBLIC_DATA_ROOT, type StaticDataBundle } from "./lib/data";
import type { ChampionCard } from "../../src/lib/knowledge/facts";
import type { CuratedTip } from "../../src/lib/knowledge/knowledgeCore";
import { loadCuratedTips } from "./lib/knowledge";
import { fillGenerated, loadPlaybooks, type Playbook, type PlaybookRefs } from "./lib/playbook";

interface Finding {
  where: string;
  message: string;
}

export function validateKnowledge(
  data: StaticDataBundle,
  cards: ChampionCard[],
  playbooks: Map<string, Playbook>,
  tips: CuratedTip[],
): { findings: Finding[]; entryCount: number } {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  // 소환사의 협곡에서 실제로 구매 가능한 아이템만 유효로 본다.
  // (아레나 등 다른 모드 전용 아이템은 협곡 조언에 등장하면 안 된다)
  const riftItemNames = new Set(
    data.items.items
      .filter((i) => i.availableOnMap11 && i.purchasable !== false && i.inStore !== false)
      .map((i) => i.name),
  );
  const otherModeItemNames = new Set(
    data.items.items.filter((i) => !riftItemNames.has(i.name)).map((i) => i.name),
  );
  const runeNames = new Set([
    ...data.runes.runes.map((r) => r.name),
    ...data.runes.statShards.map((s) => s.name),
  ]);
  const summonerNames = new Set(data.summoners.spells.map((s) => s.name));

  // 아이템이 주는 공격 스탯. 계수와 어긋난 추천을 잡는 데 쓴다.
  const itemOffense = new Map<string, { ap: boolean; ad: boolean }>();
  for (const item of data.items.items) {
    if (!riftItemNames.has(item.name)) continue;
    const stats = item.stats ?? [];
    const gives = (stat: string) => stats.some((s) => s.stat === stat && s.value > 0);
    itemOffense.set(item.name, {
      ap: gives("ABILITY_POWER"),
      ad: gives("ATTACK_DAMAGE"),
    });
  }
  /**
   * 챔피언의 계수는 라이엇 damageType 을 우선한다.
   * 툴팁 집계는 계수 없는 스킬 때문에 틀릴 때가 있다(나서스가 AP 로 잡히던 문제).
   */
  const scalingOf = (championId: string): "AD" | "AP" | undefined => {
    const card = cardsById.get(championId);
    if (!card) return undefined;
    if (card.riot?.damageType === "물리") return "AD";
    if (card.riot?.damageType === "마법") return "AP";
    return undefined;
  };
  const championIds = new Set(data.champions.map((c) => c.id));
  const effectTags = new Set(cards.flatMap((c) => c.mechanics));

  const findings: Finding[] = [];

  const checkRefs = (where: string, refs: PlaybookRefs | undefined, text: string, label0: "refs" | "avoid" | "reviewRefs" = "refs") => {
    if (!refs) return;
    const groups: Array<[keyof PlaybookRefs, Set<string>, string]> = [
      ["items", riftItemNames, "아이템"],
      ["runes", runeNames, "룬"],
      ["summoners", summonerNames, "소환사 주문"],
    ];
    for (const [key, known, label] of groups) {
      for (const name of refs[key] ?? []) {
        if (!known.has(name)) {
          const hint =
            key === "items" && otherModeItemNames.has(name)
              ? `협곡에서 구매할 수 없는 ${label}(다른 게임 모드 전용): "${name}"`
              : `데이터에 없는 ${label} 이름: "${name}"`;
          findings.push({ where, message: hint });
          continue;
        }
        if (label0 !== "reviewRefs" && !text.includes(name)) {
          findings.push({ where, message: `${label0} 에 적었으나 본문에 없는 ${label}: "${name}"` });
        }
      }
    }
  };

  for (const tip of tips) {
    const where = `tips/${tip.champion}.json [${tip.id}]`;
    if (!championIds.has(tip.champion)) findings.push({ where, message: `없는 챔피언 id: ${tip.champion}` });
    if (tip.vs && !championIds.has(tip.vs)) findings.push({ where, message: `없는 상대 id: ${tip.vs}` });
    checkRefs(where, tip.refs, tip.text);
    checkRefs(where, tip.avoid, tip.text, "avoid");
  }

  let entryCount = 0;
  for (const [champion, book] of playbooks) {
    if (!championIds.has(champion)) {
      findings.push({ where: `playbooks/${champion}.json`, message: `없는 챔피언 id: ${champion}` });
    }
    for (const [scope, entries] of [
      ["playing", book.playing],
      ["against", book.against],
    ] as const) {
      entries.forEach((sourceEntry, index) => {
        entryCount += 1;
        const card = cardsById.get(champion);
        const entry = fillGenerated(sourceEntry, card);
        const where = `playbooks/${champion}.json [${entry.id ?? `${scope}#${index + 1}`}]`;
        if (sourceEntry.generated && !card) {
          findings.push({ where, message: "생성 노트에 필요한 챔피언 사실 카드가 없음" });
        }
        checkRefs(where, sourceEntry.reviewRefs, "", "reviewRefs");
        checkRefs(where, entry.refs, entry.text);
        checkRefs(where, entry.avoid, entry.text, "avoid");
        // playing 쪽 추천만 본다. against 는 상대가 살 아이템을 말하는 자리다.
        if (scope === "playing") {
          const scaling = scalingOf(champion);
          for (const name of entry.refs?.items ?? []) {
            const offense = itemOffense.get(name);
            if (!offense || !scaling) continue;
            if (scaling === "AP" && offense.ad && !offense.ap) {
              findings.push({ where, message: `마법 피해 챔피언에게 공격력 아이템을 권함: "${name}"` });
            }
            if (scaling === "AD" && offense.ap && !offense.ad) {
              findings.push({ where, message: `물리 피해 챔피언에게 주문력 아이템을 권함: "${name}"` });
            }
          }
        }
        for (const name of [
          ...(entry.avoid?.items ?? []),
          ...(entry.avoid?.runes ?? []),
          ...(entry.avoid?.summoners ?? []),
        ]) {
          const recommended = [
            ...(entry.refs?.items ?? []),
            ...(entry.refs?.runes ?? []),
            ...(entry.refs?.summoners ?? []),
          ];
          if (recommended.includes(name)) {
            findings.push({ where, message: `refs 와 avoid 에 동시에 있는 이름: "${name}"` });
          }
        }
        for (const target of entry.when?.enemyIds ?? []) {
          if (!championIds.has(target)) findings.push({ where, message: `없는 상대 id: ${target}` });
        }
        // 태그에는 지정형인지가 없다. "지정형 군중 제어" 를 말하는 노트에 고리를 달면 논타겟 스킬(소나 R)을 부른다.
        if (entry.hooks?.length && /지정형/.test(entry.text)) {
          findings.push({ where, message: "지정형 스킬을 말하는 노트에 고리를 달았다 — 태그로는 지정형을 가리지 못한다" });
        }
        for (const hook of entry.hooks ?? []) {
          if (!/\{spells/.test(hook.text)) findings.push({ where, message: `고리 문형에 {spells} 자리가 없음: "${hook.text}"` });
          for (const tag of hook.effects) {
            if (!effectTags.has(tag)) findings.push({ where, message: `고리의 효과 태그가 어떤 챔피언에게도 없음: "${tag}"` });
          }
        }
        for (const tag of [...(entry.when?.enemyHasEffects ?? []), ...(entry.when?.enemyLacksEffects ?? [])]) {
          if (!effectTags.has(tag)) {
            findings.push({ where, message: `어떤 챔피언에게도 없는 효과 태그: "${tag}"` });
          }
        }
      });
    }
  }

  return { findings, entryCount };
}

function main() {
  const data = loadStaticData("ko_KR");
  const file = path.join(PUBLIC_DATA_ROOT, data.patch, "llm", "champion-cards-ko_KR.json");
  const cardFile = JSON.parse(fs.readFileSync(file, "utf8")) as { patch: string; cards: ChampionCard[] };
  if (cardFile.patch !== data.patch) throw new Error(`사실 카드 패치 불일치: ${cardFile.patch} / ${data.patch}`);
  const tips = loadCuratedTips();
  const { findings, entryCount } = validateKnowledge(data, cardFile.cards, loadPlaybooks(), tips);
  console.log(`검사 대상: 팁 ${tips.length}건, 플레이북 항목 ${entryCount}건 (패치 ${data.patch})`);

  if (findings.length === 0) {
    console.log("불일치 부재. 통과.");
    return;
  }
  console.log(`\n불일치 ${findings.length}건:`);
  for (const f of findings) console.log(`  ${f.where} → ${f.message}`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
