/**
 * 타입 답변 회귀 테스트
 *
 * 질문이 가리키는 사실을 코드가 골라내는지 고정한다. 실제 26.18 카드로 잰다.
 * 여기서 통과하면 화면 카드의 헤드라인·강조 문장이 같은 값으로 나온다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard, SpellFact } from "./llm/lib/facts";
import type { RuleNotes } from "./llm/lib/rules";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import {
  buildRuleAnswer,
  buildSpellAnswer,
  detectSpellFocus,
  editDistance,
  splitSentences,
  suggestChampions,
} from "../src/lib/advisor/answer";

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;
const rules = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "advisor-knowledge.json"), "utf8")) as { rules?: RuleNotes[] }
).rules ?? [];

const card = (id: string): ChampionCard => {
  const found = cards.find((c) => c.id === id);
  assert.ok(found, `${id} 카드`);
  return found;
};
const spellOf = (id: string, slot: string): SpellFact => {
  const found = card(id).spells.find((s) => s.slot === slot);
  assert.ok(found, `${id} ${slot}`);
  return found;
};
const ruleOf = (name: string): RuleNotes => {
  const found = rules.find((r) => r.name === name);
  assert.ok(found, `${name} 규칙`);
  return found;
};

// ── 묻는 사실 가려내기 ────────────────────────────────────────────────
assert.equal(detectSpellFocus("말파 W 쿨타임")?.focus, "cooldown");
assert.equal(detectSpellFocus("말파 W 쿨 몇이야")?.focus, "cooldown");
assert.equal(detectSpellFocus("럼블 Q 마나 얼마 먹어")?.focus, "cost");
assert.equal(detectSpellFocus("럼블 Q 계수")?.focus, "ratio");
assert.deepEqual(detectSpellFocus("럼블 E 마저 몇 깎여?"), { focus: "effect", keywords: ["마법 저항력"] });
assert.equal(detectSpellFocus("럼블 E 둔화 몇 퍼")?.focus, "effect");
assert.equal(detectSpellFocus("럼블 E 뭐야"), undefined, "사실을 안 짚으면 초점 없음");

// ── 스킬 답: 쿨타임은 헤드라인으로 ─────────────────────────────────────
{
  const answer = buildSpellAnswer(card("Malphite"), spellOf("Malphite", "W"), "말파 W 쿨타임");
  assert.equal(answer.kind, "spell");
  if (answer.kind === "spell") {
    assert.equal(answer.headline?.label, "재사용 대기시간");
    assert.match(answer.headline?.value ?? "", /^10\/9\.5\/9\/8\.5\/8초$/, "말파 W 쿨 10/9.5/9/8.5/8");
    assert.ok(!answer.facts.some((f) => f.label === "재사용 대기시간"), "헤드라인에 올린 사실은 표에 되풀이하지 않는다");
  }
}

// ── 스킬 답: 효과 수치는 본문 문장으로 ──────────────────────────────────
{
  const answer = buildSpellAnswer(card("Rumble"), spellOf("Rumble", "E"), "럼블 E 마저 몇 깎여?");
  assert.equal(answer.kind, "spell");
  if (answer.kind === "spell") {
    assert.equal(answer.focus, "effect");
    assert.ok(answer.highlighted.length >= 1, "마법 저항력 문장이 하나는 잡혀야 한다");
    assert.ok(
      answer.highlighted.some((s) => /10\/12\/14\/16\/18%/.test(s)),
      `마저 감소 10/12/14/16/18% 문장이 강조되어야 한다: ${answer.highlighted.join(" | ")}`,
    );
    assert.equal(answer.headline, undefined, "본문 수치 질문에는 구조 헤드라인이 없다");
  }
}

// ── 문장 가르기: 툴팁 평문이 종결어미로 갈려야 한다 ─────────────────────
{
  const sentences = splitSentences(spellOf("Rumble", "E").text);
  assert.ok(sentences.length >= 3, `럼블 E 본문이 문장 셋 이상으로 갈려야 한다 (${sentences.length})`);
  assert.ok(sentences.every((s) => s.length < 200), "한 문장이 200자를 넘으면 안 갈린 것이다");
}

// ── 규칙 답: 함께 나온 이름이 든 문장이 앞에 ────────────────────────────
{
  const ignite = ruleOf("점화");
  const answer = buildRuleAnswer(ignite, ["정복자", "점화"]);
  assert.equal(answer.kind, "rule");
  if (answer.kind === "rule") {
    assert.equal(answer.highlighted.length, 1, "정복자를 담은 문장은 하나");
    assert.match(answer.highlighted[0], /정복자 중첩 2개/);
    assert.equal(answer.highlighted.length + answer.rest.length, ignite.notes.length, "문장을 잃지 않는다");
  }
  // 다른 이름이 없으면 강조 없이 전부 rest
  const alone = buildRuleAnswer(ignite, ["점화"]);
  if (alone.kind === "rule") assert.equal(alone.highlighted.length, 0);
}

// ── 오타: 한 글자 틀린 이름을 짚는다 ───────────────────────────────────
{
  assert.equal(editDistance("럼미", "럼블"), 1);
  assert.equal(editDistance("말파이트", "말파이트"), 0);
  assert.equal(editDistance("애쉬", "애니"), 1);

  // 줄임말 표는 intent.ts 가 만든다. 여기서는 정식 이름만으로도 잡혀야 한다.
  const none = new Map<string, ChampionCard>();
  const typo = suggestChampions("럼미 E 마저 몇 깎여?", cards, none);
  assert.ok(typo, "럼미 → 후보가 있어야 한다");
  assert.equal(typo?.original, "럼미");
  assert.ok(typo?.candidates.some((c) => c.id === "Rumble"), "후보에 럼블");

  // 멀쩡한 문장에서 헛짚으면 안 된다. 챔피언 이름이 없는 일반 질문들.
  for (const plain of ["정복자에 점화 들어가?", "쇼진의 창 효과", "cs가 뭐야?", "와드 몇 개까지 박을 수 있어?"]) {
    const wrong = suggestChampions(plain, cards, none);
    assert.equal(wrong, undefined, `"${plain}" 에서 챔피언을 짚으면 안 된다: ${wrong?.original} → ${wrong?.candidates.map((c) => c.name).join(",")}`);
  }
}

console.log(`✅ Advisor answer passed (카드 ${cards.length}, 규칙 ${rules.length})`);
