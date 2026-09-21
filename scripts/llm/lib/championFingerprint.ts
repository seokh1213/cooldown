/**
 * 챔피언이 바뀐 것을 알아챈다
 *
 * 노트 삼천 건과 보정 백여 자리는 **그때 그 챔피언**을 보고 쓴 글이다. 리메이크나
 * 리워크가 오면 스킬 이름과 구조가 통째로 바뀌는데, 글은 그대로 남아 조용히
 * 틀린 말을 한다. 자료에서 도출하는 태그는 새 툴팁에서 다시 뽑히므로 저절로
 * 따라가지만, 사람이 쓴 글은 그러지 못한다.
 *
 * 두 가지를 따로 찍는다. 갈라 두는 이유는 **울려야 할 때와 아닐 때가 다르기**
 * 때문이다.
 *
 *   이름   스킬 이름 다섯. 리워크가 아니면 거의 안 바뀐다 → 바뀌면 멈춘다.
 *   문구   툴팁 본문. 라이엇이 설명을 다듬기만 해도 바뀐다 → 알리기만 한다.
 *
 * 둘 다 **수치를 지우고** 찍는다. 밸런스 판올림마다 전부 어긋난 것으로 나오면
 * 아무도 안 보게 되고, 그러면 정작 리워크가 왔을 때도 안 보게 된다.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./facts";
import { withoutNumbers } from "./facts-analysis";

export const FINGERPRINT_FILE = path.resolve(process.cwd(), "knowledge", "champion-fingerprints.json");

export interface ChampionFingerprint {
  /** 스킬 이름 다섯을 이어 찍은 것. 리워크의 가장 또렷한 표시다. */
  names: string;
  /** 툴팁 본문을 이어 찍은 것. 설명을 다듬어도 바뀐다. */
  text: string;
  /** 사람이 마지막으로 확인한 판올림 */
  checkedPatch: string;
  /** 사람이 읽을 수 있게 남기는 이름 목록. 무엇이 바뀌었는지 눈으로 견주라고 둔다. */
  spells: string;
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export function spellNameLine(card: ChampionCard): string {
  return card.spells.map((s) => `${s.slot} ${s.name}`).join(" · ");
}

export function fingerprint(card: ChampionCard, patch: string): ChampionFingerprint {
  const names = spellNameLine(card);
  const text = card.spells.map((s) => withoutNumbers(s.text)).join(" ").replace(/\s+/g, " ").trim();
  return { names: hash(names), text: hash(text), checkedPatch: patch, spells: names };
}

export function loadFingerprints(file = FINGERPRINT_FILE): Record<string, ChampionFingerprint> {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, ChampionFingerprint>;
}

export function saveFingerprints(rows: Record<string, ChampionFingerprint>, file = FINGERPRINT_FILE): void {
  const sorted = Object.fromEntries(Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}
