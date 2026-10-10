/**
 * 챔피언 지식 카드(플레이북) 로더
 *
 * `dev/data/knowledge/playbooks/<ChampionId>.json` — 챔피언 하나당 한 파일.
 * 데이터로 계산할 수 없는 것만 담는다: 콤보, 힘의 구간, 조건부 룬/주문/아이템, 스킬 운용.
 * 상성별로 쓰지 않고 **챔피언 단위**로 쓰되, 조건(`when`)을 상대 카드로 코드가 판정한다.
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "../../../../src/domain/knowledge/cards/contracts";
import {
deriveEscapeClaims,
deriveItemClaims,
deriveStackClaims,
renderEscapeClaims,
renderItemClaims,
renderStackClaims,
} from "../../../../src/domain/knowledge/combat/claims";
import type { Playbook,PlaybookEntry } from "../../../../src/domain/knowledge/notes/playbookCore";
import { loadComboCompilation } from "../combos/comboNotes";
import { resolvePatchVersion } from "./data";

export * from "../../../../src/domain/knowledge/notes/playbookCore";

export const PLAYBOOK_ROOT = path.resolve(process.cwd(), "dev/data/knowledge", "playbooks");

/** 생성기와 검증기가 같은 본문을 쓰며, 작성용 검토 참조는 실행 번들에서 제외한다. */
export function fillGenerated(entry: PlaybookEntry, card: ChampionCard | undefined): PlaybookEntry {
  const { reviewRefs: _reviewRefs, ...runtimeEntry } = entry;
  if (!entry.generated) return runtimeEntry;
  const made = !card
    ? ""
    : entry.generated === "situational-item"
      ? renderItemClaims(card, deriveItemClaims(card))
      : entry.generated === "escape-window"
        ? renderEscapeClaims(card, deriveEscapeClaims(card))
        : renderStackClaims(card, deriveStackClaims(card));
  const text = [made, entry.nuance].filter(Boolean).join(" ").trim();
  const { generated: _generated, nuance: _nuance, ...rest } = runtimeEntry;
  return { ...rest, text };
}

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
    const { notes, reviews } = loadComboCompilation();
    for (const [champion, entries] of notes) {
      const book = map.get(champion) ?? { champion, playing: [], against: [] };
      const pendingIds = reviews.filter(review => review.champion === champion && review.status === "needs-review").map(review => review.id);
      const safe = (entries: PlaybookEntry[]) => pendingIds.length ? entries.filter(entry => entry.category !== "combo") : entries;
      map.set(champion, { ...book, playing: [...safe(book.playing), ...entries], against: safe(book.against),
        ...(pendingIds.length ? { comboReview: { patch: resolvePatchVersion(), pendingIds } } : {}) });
    }
  }
  return map;
}
