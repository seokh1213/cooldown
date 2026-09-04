/**
 * 지식 계층 검증
 *
 * 1) 팁/플레이북이 참조하는 챔피언 id 가 실제 존재하는지
 * 2) `refs` 에 적은 아이템/룬/소환사 주문 이름이 현재 패치 데이터에 존재하는지 (오타·삭제·개명 탐지)
 * 3) `refs` 에 적은 이름이 본문에도 실제로 등장하는지 (참조와 본문 불일치 탐지)
 * 4) 조건(`when`)의 효과 태그가 facts.ts 가 만들어내는 태그 집합에 있는지
 *
 * 자유 텍스트에서 고유명사를 추론하지 않는다. 작성자가 refs 로 명시하고 검증기가 대조한다.
 *
 * 사용: npm run llm:validate
 */
import { loadStaticData } from "./lib/data";
import { createChampionCardBuilder } from "./lib/facts";
import { loadCuratedTips } from "./lib/knowledge";
import { loadPlaybooks, type PlaybookRefs } from "./lib/playbook";

interface Finding {
  where: string;
  message: string;
}

function main() {
  const data = loadStaticData("ko_KR");
  const builder = createChampionCardBuilder(data.champions);
  const cards = builder.buildAll();

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
  const championIds = new Set(data.champions.map((c) => c.id));
  const effectTags = new Set(cards.flatMap((c) => c.mechanics));

  const findings: Finding[] = [];

  const checkRefs = (where: string, refs: PlaybookRefs | undefined, text: string, label0 = "refs") => {
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
        if (!text.includes(name)) {
          findings.push({ where, message: `${label0} 에 적었으나 본문에 없는 ${label}: "${name}"` });
        }
      }
    }
  };

  for (const tip of loadCuratedTips()) {
    const where = `tips/${tip.champion}.json [${tip.id}]`;
    if (!championIds.has(tip.champion)) findings.push({ where, message: `없는 챔피언 id: ${tip.champion}` });
    if (tip.vs && !championIds.has(tip.vs)) findings.push({ where, message: `없는 상대 id: ${tip.vs}` });
    checkRefs(where, tip.refs, tip.text);
    checkRefs(where, tip.avoid, tip.text, "avoid");
  }

  let entryCount = 0;
  for (const [champion, book] of loadPlaybooks()) {
    if (!championIds.has(champion)) {
      findings.push({ where: `playbooks/${champion}.json`, message: `없는 챔피언 id: ${champion}` });
    }
    for (const [scope, entries] of [
      ["playing", book.playing],
      ["against", book.against],
    ] as const) {
      entries.forEach((entry, index) => {
        entryCount += 1;
        const where = `playbooks/${champion}.json [${entry.id ?? `${scope}#${index + 1}`}]`;
        checkRefs(where, entry.refs, entry.text);
        checkRefs(where, entry.avoid, entry.text, "avoid");
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
        for (const tag of [...(entry.when?.enemyHasEffects ?? []), ...(entry.when?.enemyLacksEffects ?? [])]) {
          if (!effectTags.has(tag)) {
            findings.push({ where, message: `어떤 챔피언에게도 없는 효과 태그: "${tag}"` });
          }
        }
      });
    }
  }

  const tips = loadCuratedTips();
  console.log(`검사 대상: 팁 ${tips.length}건, 플레이북 항목 ${entryCount}건 (패치 ${data.patch})`);

  if (findings.length === 0) {
    console.log("불일치 부재. 통과.");
    return;
  }
  console.log(`\n불일치 ${findings.length}건:`);
  for (const f of findings) console.log(`  ${f.where} → ${f.message}`);
  process.exitCode = 1;
}

main();
