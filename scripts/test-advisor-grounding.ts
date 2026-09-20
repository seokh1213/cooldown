/**
 * 근거 검사 시험
 *
 * 모델이 쓴 해설에서 **틀렸다고 증명되는 문장만** 걷어내는지 본다. 멀쩡한 문장을
 * 지우면 해설이 토막 나므로, 지나치게 지우지 않는 것도 같은 무게로 확인한다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { groundCommentary } from "../src/lib/advisor/grounding";
import type { AdvisorAnswer } from "../src/lib/advisor/answer";

const llmDir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;

const card = (id: string): ChampionCard => {
  const found = cards.find((c) => c.id === id);
  assert.ok(found, `${id} 카드`);
  return found;
};

const malphite = card("Malphite");
const answer: AdvisorAnswer = {
  kind: "champion",
  card: malphite,
  notes: {
    playing: ["화강암 방패가 살아 있을 때 딜 교환을 시작합니다."],
    against: [],
    perspective: "both",
  },
};

/** 카드가 실제로 가진 짝인지 먼저 확인한다. 시험이 자료를 앞질러 낡으면 안 된다. */
const ult = malphite.spells.find((s) => s.slot === "R");
assert.ok(ult, "말파이트 R");
assert.ok(ult.effects.includes("에어본"), "R 에 에어본이 있어야 이 시험이 성립한다");
const q = malphite.spells.find((s) => s.slot === "Q");
assert.ok(q && !q.effects.includes("에어본"), "Q 에는 에어본이 없어야 한다");

{
  // 짝이 틀린 문장은 걷어낸다. 에어본은 R 것이지 Q 것이 아니다.
  const text = `${q.name}으로 에어본을 겁니다. 한타에서는 진입 순서를 먼저 정합니다.`;
  const result = groundCommentary(text, answer);
  assert.equal(result.dropped.length, 1, "틀린 짝 한 문장");
  assert.equal(result.dropped[0].verdict, "card-wrong");
  assert.match(result.text, /진입 순서/, "멀쩡한 문장은 남는다");
  assert.doesNotMatch(result.text, /에어본/, "틀린 문장은 사라진다");
}

{
  // 맞는 짝은 남긴다.
  const text = `${ult.name}으로 에어본을 걸어 한타를 엽니다.`;
  const result = groundCommentary(text, answer);
  assert.equal(result.dropped.length, 0, "맞는 짝은 지우지 않는다");
}

{
  // 숫자는 해설에 쓰지 말라고 일러 두었다. 새어 나오면 대조할 방법이 없다.
  const result = groundCommentary("궁극기 쿨타임은 130초입니다.", answer);
  assert.equal(result.dropped[0]?.verdict, "number");
}

{
  // 근거 없는 이음말은 기본값에서 남긴다. 다 지우면 해설이 토막 난다.
  const text = "한타에서는 진입 타이밍이 가장 중요합니다.";
  assert.equal(groundCommentary(text, answer).dropped.length, 0, "기본값은 관대하다");
  assert.equal(groundCommentary(text, answer, { strict: true }).dropped.length, 1, "strict 는 지운다");
}

{
  // 노트에서 온 문장은 정의상 옳다. strict 에서도 남아야 한다.
  const text = "화강암 방패가 살아 있을 때 딜 교환을 시작합니다.";
  assert.equal(groundCommentary(text, answer, { strict: true }).dropped.length, 0, "노트 문장은 남는다");
}

{
  // 스트리밍 중이다. 끝나지 않은 꼬리는 아직 판단하지 않는다.
  const result = groundCommentary(`${q.name}으로 에어본을`, answer);
  assert.equal(result.dropped.length, 0, "덜 쓴 문장은 건드리지 않는다");
}

{
  // 대조할 자료가 없는 답(스킬 하나·아이템·규칙)은 손대지 않는다.
  const text = "아무 말이나 130 썼습니다.";
  assert.equal(groundCommentary(text, undefined).text, text, "카드가 없으면 그대로 둔다");
}

{
  // 굵은 소제목은 사실을 주장하지 않는다.
  const result = groundCommentary("**플레이할 때**", answer, { strict: true });
  assert.equal(result.dropped.length, 0, "소제목은 대조 대상이 아니다");
}

{
  // 소수점은 문장 끝이 아니다. 쿨타임 "8/7.5/7" 을 문장 경계로 읽어 토막 내던 버그다.
  const text = `${ult.name} 재사용 대기시간은 130/115/100초입니다. 뒤 문장입니다.`;
  const result = groundCommentary(text, answer);
  assert.equal(result.dropped.length, 1, "숫자 문장 하나만 걸린다");
  assert.equal(result.text, "뒤 문장입니다.", "나머지는 온전히 남는다");
}

{
  // 소수점이 든 문장이 남아야 할 때도 토막 나면 안 된다.
  const kept = groundCommentary("쿨은 8/7.5/7초입니다.", answer);
  assert.equal(kept.dropped.length, 1, "숫자 규칙에 걸린다");
  assert.equal(kept.text, "", "쪼개진 토막이 남지 않는다");
}

console.log("✅ 근거 검사 통과 (12건)");
