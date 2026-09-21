/**
 * 챔피언이 바뀌었는지 본다
 *
 * 이 저장소의 지식은 두 층이다. 태그는 툴팁에서 **도출**하므로 챔피언이 바뀌면
 * 다시 빌드하는 것만으로 따라간다. 노트와 보정은 사람이 **쓴** 것이라 그러지
 * 못하고, 리워크가 오면 조용히 틀린 말을 하게 된다. 그 조용함을 여기서 깬다.
 *
 * 스킬 이름이 바뀌면 멈춘다. 리워크가 아니고서는 거의 안 바뀌는 값이고, 바뀌었다면
 * 그 챔피언의 노트는 전부 다시 읽어야 한다.
 *
 * 툴팁 문구가 바뀐 것은 알리기만 한다. 라이엇이 설명만 다듬는 일이 잦아서, 이것으로
 * 멈추면 곧 아무도 안 보게 된다. 둘 다 수치를 지우고 찍으므로 밸런스 판올림으로는
 * 울지 않는다.
 *
 * 고친 뒤에는 `npm run llm:stamp -- <ChampionId>` 로 지문을 새로 찍는다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { fingerprint, loadFingerprints, spellNameLine } from "./llm/lib/championFingerprint";
import { loadPlaybooks } from "./llm/lib/playbook";

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;

const rows = loadFingerprints();
const playbooks = loadPlaybooks();
const noteCount = (id: string) => {
  const book = playbooks.get(id);
  return book ? book.playing.length + book.against.length : 0;
};

const reworked: string[] = [];
const reworded: string[] = [];
const fresh: string[] = [];
/** 사람이 쓴 노트가 아직 없는 챔피언. 도출 노트는 저절로 나오므로 빈손은 아니다. */
const unwritten: string[] = [];

for (const card of cards) {
  if (noteCount(card.id) === 0) unwritten.push(card.name);
  const seen = rows[card.id];
  if (!seen) {
    fresh.push(card.id);
    continue;
  }
  const now = fingerprint(card, patch);
  if (now.names !== seen.names) {
    reworked.push(`${card.name}\n      전  ${seen.spells}\n      후  ${spellNameLine(card)}\n      노트 ${noteCount(card.id)}건을 다시 읽어야 합니다`);
  } else if (now.text !== seen.text) {
    reworded.push(`${card.name}(노트 ${noteCount(card.id)}건)`);
  }
}

// 새 챔피언은 지문이 없을 뿐이라 막지 않는다. 찍어 두라고만 알린다.
if (fresh.length) {
  console.log(`ℹ️  지문이 없는 챔피언 ${fresh.length}종: ${fresh.join(", ")} — npm run llm:stamp`);
}
if (unwritten.length) {
  // 막지 않는다. 도출 노트("무엇을 올릴까", "언제 물까", "성장 곡선")는 카드만
  // 있으면 나오므로 답이 빈손은 아니다. 다만 사람만 쓸 수 있는 것이 비어 있다.
  console.log(`ℹ️  사람이 쓴 노트가 없는 챔피언 ${unwritten.length}종: ${unwritten.join(", ")}`);
}
if (reworded.length) {
  console.log(`ℹ️  툴팁 문구가 바뀐 챔피언 ${reworded.length}종: ${reworded.join(", ")}`);
  console.log("    설명만 다듬은 것일 수 있습니다. 읽어 보고 npm run llm:stamp -- <ChampionId> 로 다시 찍으십시오.");
}

assert.equal(
  reworked.length,
  0,
  `스킬 이름이 바뀐 챔피언이 있습니다. 리워크로 보이며 그 챔피언의 노트와 보정을 다시 봐야 합니다.\n\n    ${reworked.join("\n\n    ")}\n`,
);

console.log(
  `✅ 챔피언 변동 검사 통과 (지문 ${Object.keys(rows).length}종 · 문구 변동 ${reworded.length}종 · ` +
    `노트 미작성 ${unwritten.length}종)`,
);
