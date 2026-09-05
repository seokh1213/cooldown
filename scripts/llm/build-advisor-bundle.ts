/**
 * 브라우저 상성 코치용 지식 번들
 *
 * 지식 카드는 `knowledge/` 아래에 있어 브라우저가 못 읽는다. 사실 카드와 통계는 이미
 * `public/data/<patch>/` 에 있으므로 여기서는 **지식 계층만** 하나로 묶어 내보낸다.
 *
 * 챔피언마다 파일을 따로 두면 상성 하나에 두 번 받아야 하고, 캐시 무효화도 잘게 쪼개진다.
 * 전체가 2MB 남짓이라 한 파일로 두고 한 번만 받는 편이 낫다.
 *
 * 사용: npm run llm:bundle
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { loadCuratedTips } from "./lib/knowledge";
import { loadOracleBundle } from "./lib/oracle";
import { loadPlaybooks } from "./lib/playbook";
import type { CuratedTip } from "./lib/knowledgeCore";
import type { Playbook } from "./lib/playbookCore";

export const ADVISOR_BUNDLE_FILE = "advisor-knowledge.json";

export interface AdvisorKnowledgeBundle {
  schemaVersion: 1;
  patchVersion: string;
  generatedAt: string;
  /** 챔피언 id → 플레이북 */
  playbooks: Record<string, Playbook>;
  /** 상성 한정 팁 */
  tips: CuratedTip[];
  /**
   * 통계 오라클 파일 이름.
   * 지역·티어가 이름에 들어가 고정할 수 없으므로, 브라우저가 무엇을 받아야 하는지 여기 적어 둔다.
   */
  oracleFile?: string;
  counts: { champions: number; entries: number; tips: number };
}

function main() {
  const patch = resolvePatchVersion();
  const playbooks = loadPlaybooks();
  const tips = loadCuratedTips();
  const oracleFile = loadOracleBundle(patch)?.fileName;

  const byChampion: Record<string, Playbook> = {};
  let entries = 0;
  for (const [champion, book] of playbooks) {
    byChampion[champion] = book;
    entries += book.playing.length + book.against.length;
  }

  const bundle: AdvisorKnowledgeBundle = {
    schemaVersion: 1,
    patchVersion: patch,
    generatedAt: new Date().toISOString(),
    playbooks: byChampion,
    tips,
    oracleFile,
    counts: { champions: playbooks.size, entries, tips: tips.length },
  };

  const out = path.join(PUBLIC_DATA_ROOT, patch, "llm", ADVISOR_BUNDLE_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(bundle), "utf8");

  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(
    `생성: ${path.relative(process.cwd(), out)} ` +
      `(챔피언 ${playbooks.size}종, 항목 ${entries}건, 팁 ${tips.length}건, ${kb} KB)` +
      `\n오라클: ${oracleFile ?? "없음"}`,
  );
}

main();
