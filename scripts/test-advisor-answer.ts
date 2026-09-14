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
import { indexRules, type RuleNotes } from "./llm/lib/rules";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import {
  answerChampionIds,
  asksComparison,
  asksMatchup,
  asksSkillsOverview,
  buildCompareAnswer,
  looksChampionDirected,
  spellFocusValue,
  buildRuleAnswer,
  buildSpellAnswer,
  detectSpellFocus,
  editDistance,
  percentileLabel,
  ruleVerdict,
  spellOneLiner,
  splitSentences,
  suggestChampions,
  buildCommentaryPrompt,
} from "../src/lib/advisor/answer";
import { readPageContext } from "../src/lib/advisor/pageContext";
import { nicknames } from "../src/lib/advisor/intent";
import { dehydrateAnswer, reviveAnswer, reviveTurns, type StoredAnswer, type StoredTurn } from "../src/lib/advisor/history";
import type { AdvisorAnswer } from "../src/lib/advisor/answer";
import type { AdvisorData } from "../src/lib/advisor/context";

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

  // 충전형 스킬은 쿨타임 필드가 연속 시전 간격(0.5초)이다. 재충전 시간이 답이어야 한다.
  const charged = buildSpellAnswer(card("Rumble"), spellOf("Rumble", "E"), "럼블 E 쿨타임");
  if (charged.kind === "spell") {
    assert.equal(charged.headline?.label, "재충전 대기시간");
    assert.match(charged.headline?.value ?? "", /^6초 · 2회 충전 · 연속 시전 0\.5초$/, "럼블 E 재충전 6초·2회");
  }
  assert.match(spellOneLiner(spellOf("Rumble", "E")), /^재충전 6/, "한 줄 요약도 재충전을 앞세운다");
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

// ── 해설 재료: 순수 조회에는 없고, 효과 질문에는 있다 ──────────────────
{
  const lookup = buildSpellAnswer(card("Malphite"), spellOf("Malphite", "W"), "말파 W 쿨타임");
  assert.equal(buildCommentaryPrompt(lookup, patch), undefined, "쿨타임 조회에는 해설 재료를 주지 않는다");
  const effect = buildSpellAnswer(card("Rumble"), spellOf("Rumble", "E"), "럼블 E 마저 몇 깎여?");
  assert.ok(buildCommentaryPrompt(effect, patch)?.includes("수치를 쓰지 마십시오"), "효과 질문에는 재료를 주고 숫자 금지를 명시한다");
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
  // 첫 글자가 다른 나미·유미는 후보가 아니다. 후보가 하나여야 묻지 않고 바로 간다.
  assert.deepEqual(typo?.candidates.map((c) => c.id), ["Rumble"], "럼미 → 럼블 하나");

  // 비교 질문에서 둘째 이름만 틀렸을 때. "말파이트랑" 은 조사이지 오타가 아니다.
  const malphite = new Set(["Malphite"]);
  const second = suggestChampions("말파이트랑 럼베 중 1레벨 체력 누가 더 높아?", cards, none, malphite);
  assert.equal(second?.original, "럼베");
  assert.deepEqual(second?.candidates.map((c) => c.id), ["Rumble"], "말파이트랑 럼베 → 럼블");
  assert.equal(
    suggestChampions("말파이트랑 럼블 중 누가 더 높아?", cards, none, new Set(["Malphite", "Rumble"])),
    undefined,
    "둘 다 맞게 썼으면 오타가 없다",
  );

  // 줄임말 표를 함께 줘도 게임 어휘는 후보가 아니다. "스킬" 이 "스카"(스카너) 로 잡혔다.
  const withNicks = suggestChampions("말파이트 스킬 쿨타임", cards, nicknames(cards), new Set(["Malphite"]));
  assert.equal(withNicks, undefined, `스킬 → ${withNicks?.candidates.map((c) => c.name).join(",")}`);

  // 멀쩡한 문장에서 헛짚으면 안 된다. 챔피언 이름이 없는 일반 질문들.
  for (const plain of ["정복자에 점화 들어가?", "쇼진의 창 효과", "cs가 뭐야?", "와드 몇 개까지 박을 수 있어?", "누가 더 높아?", "누구 골라야 해?"]) {
    const wrong = suggestChampions(plain, cards, none);
    assert.equal(wrong, undefined, `"${plain}" 에서 챔피언을 짚으면 안 된다: ${wrong?.original} → ${wrong?.candidates.map((c) => c.name).join(",")}`);
  }
}

// ── 비교: 코드가 표로 견준다 ───────────────────────────────────────────
{
  assert.ok(asksComparison("말파이트랑 럼블 중 1레벨 체력 누가 더 높아?", 2));
  assert.ok(!asksComparison("말파이트 W 쿨타임", 1));
  assert.ok(!asksComparison("누가 더 높아?", 1), "챔피언이 하나면 비교가 아니다");

  const pair = [card("Malphite"), card("Rumble")];
  const hp = buildCompareAnswer(pair, "말파이트랑 럼블 중 1레벨 체력 누가 더 높아?");
  assert.equal(hp.kind, "compare");
  if (hp.kind === "compare") {
    assert.equal(hp.level, 1);
    assert.equal(hp.headline?.label, "체력 (1레벨)");
    assert.match(hp.headline?.value ?? "", /^말파이트 665 > 럼블 640$/, "큰 쪽부터, 부등호로");
    const row = hp.rows.find((r) => r.hit);
    assert.equal(row?.label, "체력");
    assert.equal(row?.winner, 0, "말파이트 열이 굵다");
    assert.equal(buildCommentaryPrompt(hp, "26.18"), undefined, "사실 하나를 물은 비교에는 해설이 없다");
  }

  const late = buildCompareAnswer(pair, "18레벨 마저는 누가 더 높아");
  if (late.kind === "compare") {
    assert.equal(late.level, 18);
    assert.equal(late.rows.find((r) => r.hit)?.label, "마법 저항력");
  }

  const open = buildCompareAnswer(pair, "말파이트랑 럼블 중 누가 더 세?");
  if (open.kind === "compare") {
    assert.equal(open.headline, undefined, "능력치를 짚지 않으면 헤드라인이 없다");
    const prompt = buildCommentaryPrompt(open, "26.18") ?? "";
    assert.match(prompt, /말파이트 vs 럼블/, "열린 비교에는 해설 재료가 붙는다");
    assert.match(prompt, /수치를 쓰지 마십시오/);
  }

  const q = buildCompareAnswer(pair, "말파이트 럼블 Q 쿨 누가 더 짧아?", "Q");
  if (q.kind === "compare") {
    assert.equal(q.slot, "Q");
    const row = q.rows.find((r) => r.hit);
    assert.equal(row?.label, "재사용 대기시간");
    assert.equal(row?.winner, undefined, "스킬 행은 크기 비교를 하지 않는다");
    assert.equal(buildCommentaryPrompt(q, "26.18"), undefined);
  }
}

// ── 대화 맥락: 상성·이름 생략 ─────────────────────────────────────────────
{
  assert.ok(asksMatchup("제이스랑 상대한다생각하면 어떻게되는거지"));
  assert.ok(asksMatchup("럼블 만나면 어떻게 해?"));
  assert.ok(!asksMatchup("제이스 설명해줘"));

  assert.ok(looksChampionDirected("W 쿨타임", "W"));
  assert.ok(looksChampionDirected("설명해줘"));
  assert.ok(looksChampionDirected("스킬 계수"));
  assert.ok(!looksChampionDirected("cs가 뭐야?"), "게임 용어 질문은 챔피언을 겨냥하지 않는다");

  const pair = [card("Malphite"), card("Jayce")];
  const matchup = buildCompareAnswer(pair, "제이스랑 상대한다 생각하면", undefined, { matchup: true });
  if (matchup.kind === "compare") {
    assert.equal(matchup.matchup, true);
    assert.equal(matchup.headline, undefined);
    assert.deepEqual(answerChampionIds(matchup), ["Malphite", "Jayce"]);
    const prompt = buildCommentaryPrompt(matchup, "26.18") ?? "";
    assert.match(prompt, /말파이트를 잡고 제이스를 상대/, "내 챔피언 시점으로 쓰라고 한다");
  }

  // "스킬 설명해줘" 는 스킬 요약 화면이다. 운용 노트가 재료로 들어가고, 일반론은 금지한다.
  assert.ok(asksSkillsOverview("말아피트 스킬 설명도 해줘"));
  assert.ok(asksSkillsOverview("스킬 뭐 있어"));
  assert.ok(!asksSkillsOverview("말파이트 스킬 쿨타임"), "쿨타임은 사실 조회지 설명이 아니다");
  const skills: AdvisorAnswer = {
    kind: "champion",
    card: card("Malphite"),
    view: "skills",
    notes: { playing: ["화강암 방패는 피해를 받지 않는 시간이 쌓여야 다시 생긴다."], against: ["R은 저지 불가라 끊을 수 없다."] },
  };
  const skillsPrompt = buildCommentaryPrompt(skills, "26.18") ?? "";
  assert.match(skillsPrompt, /화강암 방패는 피해를 받지 않는/, "운용 노트가 재료다");
  assert.match(skillsPrompt, /R 멈출 수 없는 힘: /, "스킬 요약이 재료다");
  assert.match(skillsPrompt, /어느 챔피언에나 맞는 말은 쓰지 마십시오/);
  assert.match(skillsPrompt, /서로 어떻게 맞물리는지/, "스킬셋 질문은 스킬 사이의 관계를 묻는다");
  assert.match(skillsPrompt, /상대가 파고드는 지점으로/, "약점은 상대가 조심할 것이 아니다");
  assert.ok(asksSkillsOverview("오공은 스킬셋이 어떻게 되어있지?"));

  // 슬롯 없이 사실 하나: 스킬 다섯 개의 그 사실. 해설은 없다.
  const focused: ReturnType<typeof buildCompareAnswer> = { kind: "champion", card: card("Rumble"), focus: "cooldown" };
  assert.equal(buildCommentaryPrompt(focused, "26.18"), undefined);
  assert.equal(spellFocusValue(spellOf("Rumble", "E"), "cooldown"), "6초 · 2회 충전 · 연속 시전 0.5초");
  assert.equal(spellFocusValue(spellOf("Malphite", "Q"), "ratio"), "주문력 60%");
}

// ── 대화 기록: 카드는 id 로 저장하고 자료에서 되살린다 ─────────────────────
{
  const data = { cardById: new Map(cards.map((c) => [c.id, c])), ruleIndex: indexRules(rules) } as unknown as AdvisorData;
  const answers: AdvisorAnswer[] = [
    buildSpellAnswer(card("Rumble"), spellOf("Rumble", "E"), "럼블 E 마저 몇 깎여?"),
    { kind: "champion", card: card("Malphite"), focus: "cooldown" },
    buildRuleAnswer(ruleOf("점화"), ["정복자", "점화"]),
    buildCompareAnswer([card("Malphite"), card("Jayce")], "누가 더 세?", undefined, { matchup: true }),
    { kind: "suggestion", original: "럼미", candidates: [card("Rumble"), card("Nami")], reason: "typo" },
    { kind: "text", text: "그냥 글" },
  ];
  for (const answer of answers) {
    const stored = dehydrateAnswer(answer);
    const json = JSON.stringify(stored);
    assert.ok(!json.includes('"spells"'), `${answer.kind}: 카드 통째로 저장하면 안 된다`);
    const revived = reviveAnswer(JSON.parse(json) as StoredAnswer, data);
    assert.ok(revived, `${answer.kind}: 되살려야 한다`);
    assert.deepEqual(answerChampionIds(revived!), answerChampionIds(answer), `${answer.kind}: 챔피언이 같아야 한다`);
    assert.equal(revived!.kind, answer.kind);
  }
  // 자료에서 사라진 챔피언은 답과 그 질문을 함께 버린다.
  const gone: StoredTurn[] = [
    { id: 1, role: "user", content: "없는애 설명" },
    { id: 2, role: "assistant", content: "", answer: { kind: "champion", cardId: "NoSuchChampion" } },
    { id: 3, role: "user", content: "럼블 설명" },
    { id: 4, role: "assistant", content: "해설", answer: { kind: "champion", cardId: "Rumble" } },
  ];
  assert.deepEqual(reviveTurns(gone, data).map((t) => t.id), [3, 4]);
}

// ── 예/아니오 배지: 극성이 분명할 때만 ───────────────────────────────────
assert.equal(ruleVerdict("점화는 사용하는 순간 정복자 중첩 2개, 감전과 질풍 중첩을 각각 1개씩 줍니다."), "yes");
assert.equal(ruleVerdict("진급한 미니언이 처치해도 트위스티드 페이트 P 사기 주사위는 발동하지 않았습니다."), "no");
assert.equal(ruleVerdict("챔피언에게는 적용되지만 미니언에게는 적용되지 않습니다."), undefined, "조건이 갈리면 배지 없음");
assert.equal(ruleVerdict("피해량은 대상의 최대 체력에 비례합니다."), undefined, "긍정 서술어가 없으면 배지 없음");

// ── 스킬 한 줄 요약: 데이터에서 조립 ──────────────────────────────────────
{
  const q = spellOneLiner(spellOf("Rumble", "Q"));
  assert.match(q, /쿨 10\/9\/8\/7\/6/, `럼블 Q 요약에 쿨: ${q}`);
  assert.match(q, /주문력 105%/, `럼블 Q 요약에 최대 계수: ${q}`);
  assert.ok(q.length < 80, "한 줄이어야 한다");
}

// ── 백분위 표기 ───────────────────────────────────────────────────────────
assert.deepEqual(percentileLabel(69.5), { side: "top", value: 31 });
assert.deepEqual(percentileLabel(5), { side: "bottom", value: 5 });
assert.deepEqual(percentileLabel(100), { side: "top", value: 1 }, "최고도 상위 1% 로 보여 0% 를 피한다");

// ── 화면 맥락: 경로·저장소에서 챔피언을 읽는다 ─────────────────────────────
{
  const store = new Map<string, string>([
    ["cooldown_selected_champions", JSON.stringify([{ id: "Malphite", key: "54" }])],
  ]);
  const read = (key: string) => store.get(key) ?? null;
  assert.deepEqual(readPageContext("/", "", read), { route: "cooldown", championIds: ["Malphite"] });
  assert.deepEqual(readPageContext("/vs", "?a=Rumble&t=Malphite", read), { route: "vs", championIds: ["Rumble", "Malphite"] });
  assert.deepEqual(readPageContext("/encyclopedia", "?tab=items", read), { route: "encyclopedia", championIds: [], tab: "items" });
  assert.deepEqual(readPageContext("/encyclopedia", "", read), { route: "encyclopedia", championIds: [], tab: "champions" });
  assert.deepEqual(readPageContext("/", "", () => "not json"), { route: "cooldown", championIds: [] }, "깨진 저장값은 빈 목록");
}

console.log(`✅ Advisor answer passed (카드 ${cards.length}, 규칙 ${rules.length})`);
