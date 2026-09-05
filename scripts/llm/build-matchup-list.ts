/**
 * 사전 생성할 매치업 목록을 통계로 짠다
 *
 * 기존 목록은 지식 카드가 8종이던 시절 것이라 탑 56건뿐이었다.
 * 이제 173종이 갖춰졌으니 **실제로 그 라인에서 만나는 조합**으로 다시 짠다.
 *
 * 173 × 172 × 5라인 = 14만 건은 만들 수 없다. 두 가지로 줄인다.
 * - 라인마다 표본이 큰 상위 N종만 쓴다. 픽률이 낮은 조합은 볼 사람이 없다.
 * - 통계가 짚은 상성(어려운·쉬운 상대)은 N 밖이어도 넣는다. 그게 사람들이 찾는 조합이다.
 *
 * 사용:
 *   npm run llm:matchup-list                # 라인당 20종
 *   npm run llm:matchup-list -- --top 30
 *   npm run llm:matchup-list -- --dry-run
 */
import * as fs from "fs";
import * as path from "path";
import { loadOracleBundle } from "./lib/oracle";
import { loadPlaybooks } from "./lib/playbook";

interface MatchupTarget {
  me: string;
  enemy: string;
  lane: string;
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const top = Number(get("--top") ?? 20);
  const dryRun = argv.includes("--dry-run");

  const oracle = loadOracleBundle();
  if (!oracle) throw new Error("오라클이 없다. npm run oracle:build 를 먼저 돌려라");
  const playbooks = loadPlaybooks();

  // 라인별로 표본이 큰 순서대로 모은다
  const byLane = new Map<string, Array<{ id: string; games: number }>>();
  for (const champion of oracle.byChampion.values()) {
    // 지식 카드가 없으면 조언 품질이 떨어진다. 목록에 넣지 않는다.
    if (!playbooks.has(champion.id)) continue;
    for (const lane of champion.lanes) {
      const list = byLane.get(lane.lane) ?? [];
      list.push({ id: champion.id, games: lane.games ?? 0 });
      byLane.set(lane.lane, list);
    }
  }

  const targets: MatchupTarget[] = [];
  const seen = new Set<string>();
  const add = (me: string, enemy: string, lane: string) => {
    if (me === enemy) return;
    if (!playbooks.has(me) || !playbooks.has(enemy)) return;
    const key = `${lane}|${me}|${enemy}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ me, enemy, lane });
  };

  const summary: string[] = [];
  for (const [lane, all] of byLane) {
    const ranked = [...all].sort((a, b) => b.games - a.games);
    const core = ranked.slice(0, top).map((c) => c.id);
    const before = targets.length;

    // 상위 N 끼리 양방향
    for (const me of core) for (const enemy of core) add(me, enemy, lane);

    // 통계가 짚은 상성은 N 밖이어도 넣는다
    for (const champion of oracle.byChampion.values()) {
      const laneData = champion.lanes.find((l) => l.lane === lane);
      const matchups = laneData?.matchups;
      if (!matchups) continue;
      for (const m of [...matchups.hard, ...matchups.easy]) {
        add(champion.id, m.id, lane);
        add(m.id, champion.id, lane);
      }
    }
    summary.push(`${lane.padEnd(8)} 상위 ${core.length}종 → ${targets.length - before}건`);
  }

  console.log(`매치업 ${targets.length}건 (라인당 상위 ${top}종 + 통계가 짚은 상성)\n`);
  for (const line of summary) console.log(`  ${line}`);

  // e2b 기준 매치업당 약 16초
  const hours = (targets.length * 16) / 3600;
  console.log(
    `\n예상 생성 시간: 약 ${hours.toFixed(1)}시간 (e2b 16초/건 기준), ` +
      `CI 4분할이면 ${(hours / 4).toFixed(1)}시간`,
  );

  if (dryRun) return;
  const out = path.resolve(process.cwd(), "knowledge", "matchup-list.json");
  fs.writeFileSync(
    out,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), top, matchups: targets }, null, 2)}\n`,
    "utf8",
  );
  console.log(`\n저장: ${path.relative(process.cwd(), out)}`);
}

main();
