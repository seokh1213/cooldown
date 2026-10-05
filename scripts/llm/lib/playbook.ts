/**
 * 챔피언 지식 카드(플레이북) 로더
 *
 * `knowledge/playbooks/<ChampionId>.json` — 챔피언 하나당 한 파일.
 * 데이터로 계산할 수 없는 것만 담는다: 콤보, 힘의 구간, 조건부 룬/주문/아이템, 스킬 운용.
 * 상성별로 쓰지 않고 **챔피언 단위**로 쓰되, 조건(`when`)을 상대 카드로 코드가 판정한다.
 */
import * as fs from "fs";
import * as path from "path";
import type { Playbook } from "../../../src/lib/knowledge/playbookCore";
import { loadComboNotes } from "./comboNotes";

export * from "../../../src/lib/knowledge/playbookCore";

export const PLAYBOOK_ROOT = path.resolve(process.cwd(), "knowledge", "playbooks");

export function loadPlaybooks(root = PLAYBOOK_ROOT): Map<string, Playbook> {
  const map = new Map<string, Playbook>();
  if (!fs.existsSync(root)) return map;
  for (const file of fs.readdirSync(root).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as Playbook;
    map.set(parsed.champion, {
      champion: parsed.champion,
      playing: parsed.playing ?? [],
      against: parsed.against ?? [],
    });
  }
  if (root === PLAYBOOK_ROOT) {
    for (const [champion, entries] of loadComboNotes()) {
      const book = map.get(champion) ?? { champion, playing: [], against: [] };
      // 상성·조건 대응의 기존 우선순서는 보존한다. 명시적 콤보는 combo 메타데이터로 고른다.
      map.set(champion, { ...book, playing: [...book.playing, ...entries] });
    }
  }
  return map;
}
