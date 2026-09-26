/**
 * 조언 자료 검색 회귀 테스트
 *
 * 질문을 넣었을 때 **어느 자료가 붙는지**를 고정한다. 모델 답을 채점하는 것이 아니라,
 * 모델에게 넘어가는 근거가 맞는지를 본다. 근거가 틀리면 모델이 무엇을 하든 답이 틀린다.
 *
 * 실제 브라우저 경로와 같은 함수를 쓴다. 여기서 통과하면 화면에서도 같은 자료가 붙는다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { indexRules, buildRuleAnswer, findMentionedRules, findRulesMentioning } from "./llm/lib/rules";
import { findMechanics, mechanicsToText, type MechanicsIndex } from "./llm/lib/mechanics";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { extractQuery, hitsToAnswer, lexicalSearch, type SearchDoc } from "../src/lib/advisor/searchFallback";
import { asksAboutHelper } from "../src/lib/advisor/intent";

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");

const bundle = JSON.parse(
  fs.readFileSync(path.join(llmDir, "advisor-knowledge.json"), "utf8"),
) as { rules?: Parameters<typeof indexRules>[0]; mechanics?: MechanicsIndex };

const items = JSON.parse(
  fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, `items-normalized-ko_KR.json`), "utf8"),
) as { items: Array<{ name: string; description?: string }> };

const cards = JSON.parse(
  fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8"),
) as {
  cards: Array<{
    id: string;
    name: string;
    spells: Array<{ slot: string; name: string; text: string; effects: string[] }>;
  }>;
};

const ruleIndex = indexRules(bundle.rules ?? []);
const mechanics = bundle.mechanics ?? [];

function ruleAnswer(question: string): string | undefined {
  const named = findMentionedRules(ruleIndex, question);
  if (!named.length) return undefined;
  const related = findRulesMentioning(ruleIndex, named.map((r) => r.name));
  return buildRuleAnswer([...named, ...related], patch);
}

function itemHit(question: string): string | undefined {
  const named = items.items
    .filter((i) => i.name && i.name.length >= 2 && i.description)
    .sort((a, b) => b.name.length - a.name.length);
  return named.find((i) => question.includes(i.name))?.description;
}

// --- 룬·소환사 주문 판정 ---

const conqueror = ruleAnswer("정복자 스택에 점화가 들어가나요?");
assert.ok(conqueror, "정복자+점화 질문에 규칙이 붙어야 한다");
assert.match(conqueror, /점화/);
assert.match(conqueror, /정복자 중첩 2개/);

assert.ok(ruleAnswer("감전은 평타로도 터지나요?"), "감전 질문에 규칙이 붙어야 한다");
assert.equal(ruleAnswer("오늘 날씨 어때"), undefined, "무관한 질문에는 규칙이 붙지 않아야 한다");

// --- 아이템 ---

const shojin = itemHit("쇼진의 창은 궁극기에도 적용되나요?");
assert.ok(shojin, "쇼진의 창을 알아봐야 한다");
assert.match(shojin, /챔피언 스킬/, "궁극기 포함 여부를 가릴 근거가 설명문에 있어야 한다");

const cleaver = itemHit("굶주린 히드라랑 몰락한 왕의 검 같이 사도 되나요?");
assert.ok(cleaver, "아이템 이름이 둘이어도 하나는 잡아야 한다");

// --- 게임 메커니즘 ---

const pen = mechanicsToText(findMechanics(mechanics, "치명타는 방어구 관통을 적용받나요?"));
assert.ok(pen, "관통 질문에 메커니즘 절이 붙어야 한다");
assert.match(pen, /관통/);

const order = mechanicsToText(findMechanics(mechanics, "관통이랑 감소랑 적용 순서가 어떻게 돼?"));
assert.ok(order, "적용 순서 질문에 절이 붙어야 한다");
assert.match(order, /고정 감소/, "적용 순서 본문이 실려야 한다");

const tenacity = mechanicsToText(findMechanics(mechanics, "강인함은 에어본에도 적용돼?"));
assert.ok(tenacity, "강인함 질문에 절이 붙어야 한다");

// 적용 순서와 부정문은 요약하면 뒤집힌다. 원문이 그대로 실려 나가는지 본다.
assert.match(order, /감소가 먼저, 관통이 나중/, "적용 순서 문장이 원문 그대로여야 한다");
assert.match(pen, /비례하지 않는다/, "부정문이 원문 그대로여야 한다");

assert.equal(
  mechanicsToText(findMechanics(mechanics, "오공 어떻게 해?")),
  undefined,
  "챔피언 질문에는 메커니즘 절이 붙지 않아야 한다",
);

// 질문이 "룬"·"스펠" 이라고 밝혔으면 그 갈래 규칙만. 흔한 낱말(와드·회복·미니언)이 규칙 이름이라 걸렸다.
assert.deepEqual(findMentionedRules(ruleIndex, "와드 없는 모드에서 킬로 트로피 모으는 룬").map((r) => r.name), [], "룬을 물었는데 와드(게임 요소)");
assert.deepEqual(findMentionedRules(ruleIndex, "킬 관여하면 피 채워주는 룬, 회복량은?").map((r) => r.name), [], "룬을 물었는데 회복(소환사 주문)");
assert.deepEqual(findMentionedRules(ruleIndex, "미니언을 키워 주던 스펠").map((r) => r.name), [], "스펠을 물었는데 미니언(게임 요소)");
assert.deepEqual(findMentionedRules(ruleIndex, "정복자에 점화 들어가?").map((r) => r.name).sort(), ["점화", "정복자"].sort(), "갈래를 안 밝히면 그대로");
assert.deepEqual(findMentionedRules(ruleIndex, "감전 룬 쿨타임").map((r) => r.name), ["감전"], "룬을 물었고 룬이 걸리면 그대로");

// 은어로도 찾는다(knowledge/search-aliases.json). 짧은 한국어 은어는 낱말 경계로.
assert.deepEqual(findMentionedRules(ruleIndex, "스마 충전 몇 초마다 차?").map((r) => r.name), ["강타"], "스마 → 강타");
assert.deepEqual(findMentionedRules(ruleIndex, "does PTA work on towers").map((r) => r.name), ["집중 공격"], "PTA → 집중 공격");
assert.deepEqual(findMentionedRules(ruleIndex, "텔포 타고 복귀").map((r) => r.name), ["순간이동"], "텔포 → 순간이동");
assert.deepEqual(findMentionedRules(ruleIndex, "플레이할 때 팁").map((r) => r.name), [], "플레이 의 플 은 점멸이 아니다");
assert.deepEqual(findMentionedRules(ruleIndex, "플 빠지면 바로 들어가").map((r) => r.name), ["점멸"], "플 + 조사 없는 띄어쓰기");
// 룬·스펠을 묻는다고 밝혔으면 게임 원리 절이 아니다(능력치 낱말 "공속" 이 절의 은어)
assert.deepEqual(findMechanics(mechanics, "싸울수록 공속 쌓이는 정밀 핵심룬"), [], "룬 질문은 게임 원리 절로 가지 않는다");
assert.ok(findMechanics(mechanics, "공속 상한 몇이야?").length > 0, "룬을 안 밝히면 공속 은어로 찾는다");

// 영문 낱말은 낱말 경계로만 찾는다. "damage" 안의 "Mage", "adds" 안의 "AD", "mid" 안의 "id" 가 걸렸다.
for (const question of ["the rune that deals more damage to low hp enemies", "the Domination rune that adds true damage", "swap summoner spells mid game"]) {
  assert.deepEqual(findMechanics(mechanics, question), [], `"${question}" 에 게임 원리 절이 붙지 않아야 한다`);
}

// --- 스킬 조회: 수치가 답에 들어가는가 ---

function detectSlot(question: string): string | undefined {
  if (/패시브|기본\s?지속/.test(question)) return "P";
  if (/궁극기|궁(?=[\s을은이의로]|$)/.test(question)) return "R";
  const match = /(^|[^A-Za-z])([QWERqwer])($|[^A-Za-z])/.exec(question);
  return match ? match[2].toUpperCase() : undefined;
}

function spellOf(id: string, slot: string) {
  const card = cards.cards.find((c) => c.id === id);
  assert.ok(card, `${id} 카드가 있어야 한다`);
  return card.spells.find((s) => s.slot === slot);
}

// "럼블 E는 마법저항력이 깎이나?" 는 효과 태그("적 마법 저항력 감소")와 글자가 맞지 않는다.
// 슬롯이 드러난 질문은 그 스킬을 통째로 내주므로 수치가 답에 들어간다.
assert.equal(detectSlot("럼블 E는 마법저항력이 깎이나?"), "E");
assert.equal(detectSlot("가렌 궁 뭐야?"), "R", "한글에는 \\b 가 듣지 않는다");
assert.equal(detectSlot("제드 패시브 알려줘"), "P");
assert.equal(detectSlot("아리 어때?"), undefined, "슬롯이 없으면 모델 경로로 간다");

const rumbleE = spellOf("Rumble", "E");
assert.ok(rumbleE, "럼블 E 가 있어야 한다");
assert.match(rumbleE.text, /10\/12\/14\/16\/18% 감소/, "감소 수치가 스킬 본문에 있어야 한다");
assert.ok(rumbleE.effects.includes("적 마법 저항력 감소"));

// --- 줄임말: 사람들이 부르는 이름으로도 찾아지는가 ---

/** 화면과 같은 규칙. 접두사와 머리글자를 이름에서 만들고, 겹치면 쓰지 않는다. */
function buildNicknames(list: typeof cards.cards): Map<string, (typeof cards.cards)[number]> {
  const owners = new Map<string, typeof cards.cards>();
  const add = (key: string, card: (typeof cards.cards)[number]) => {
    if (key.length < 2) return;
    const found = owners.get(key);
    if (found) found.push(card);
    else owners.set(key, [card]);
  };
  for (const card of list) {
    const compact = card.name.replace(/\s+/g, "");
    for (let length = 2; length < compact.length; length += 1) add(compact.slice(0, length), card);
    const words = card.name.split(/\s+/).filter(Boolean);
    if (words.length > 1) add(words.map((w) => w[0]).join(""), card);
  }
  const unique = new Map<string, (typeof cards.cards)[number]>();
  for (const [key, owned] of owners) {
    if (owned.length === 1 && !list.some((c) => c.name.replace(/\s+/g, "") === key)) {
      unique.set(key, owned[0]);
    }
  }
  return unique;
}

const nicknames = buildNicknames(cards.cards);
const byLongestName = [...cards.cards].sort((a, b) => b.name.length - a.name.length);
const byLongestNick = [...nicknames].sort((a, b) => b[0].length - a[0].length);

function resolveChampion(question: string): string | undefined {
  const exact = byLongestName.find(
    (c) => c.name.length >= 2 &&
      (question.includes(c.name) || question.includes(c.name.replace(/\s+/g, ""))),
  );
  if (exact) return exact.name;
  return byLongestNick.find(([key]) => question.includes(key))?.[1].name;
}

// "말파 w를 키면" 이 챔피언을 못 찾아 자료 없이 나갔었다. 별칭 표 없이 이름에서 만든다.
assert.equal(resolveChampion("말파 w를 키면 어떤 효과들이 있어?"), "말파이트");
assert.equal(resolveChampion("트페 궁 사거리 얼마야?"), "트위스티드 페이트", "머리글자도 받는다");
assert.equal(resolveChampion("갱플 q 쿨 얼마야"), "갱플랭크");
assert.equal(resolveChampion("리신 q 계수"), "리 신", "공백을 붙여 써도 찾는다");
assert.equal(resolveChampion("럼블 E 마법저항력"), "럼블");
// 겹치는 짧은 말은 쓰지 않는다. 어느 챔피언인지 정할 수 없다.
assert.ok(!nicknames.has("리"), "리 는 리 신·리븐·릴리아와 겹친다");

// --- 이동기 / 돌진 태그 분리 ---

function effectsOf(id: string, slot: string): string[] {
  const card = cards.cards.find((c) => c.id === id);
  assert.ok(card, `${id} 카드가 있어야 한다`);
  return card.spells.find((s) => s.slot === slot)?.effects ?? [];
}

// 쓰레쉬 W 는 아군이 돌진한다. 쓰레쉬 본인은 움직이지 않지만 그 돌진은 뽀삐 W 로 막힌다.
const threshW = effectsOf("Thresh", "W");
assert.ok(!threshW.includes("이동기"), "쓰레쉬 W 는 시전자가 움직이지 않는다");
assert.ok(threshW.includes("돌진"), "쓰레쉬 W 는 돌진 판정이 생긴다");

// 뽀삐 W 는 남의 돌진을 막을 뿐 제가 돌진하지 않는다.
const poppyW = effectsOf("Poppy", "W");
assert.ok(!poppyW.includes("이동기"), "뽀삐 W 는 이동기가 아니다");
assert.ok(!poppyW.includes("돌진"), "뽀삐 W 는 남의 돌진을 막는 쪽이다");

// 본인이 움직이는 스킬은 둘 다 잡힌다.
for (const [id, slot] of [["Zeri", "E"], ["Riven", "Q"], ["Yasuo", "E"]] as const) {
  assert.ok(effectsOf(id, slot).includes("이동기"), `${id} ${slot} 은 이동기다`);
}

// 투사체가 날아가는 것은 이동기가 아니다.
for (const [id, slot] of [["Ahri", "W"], ["Ashe", "E"], ["Lux", "Q"]] as const) {
  assert.ok(!effectsOf(id, slot).includes("이동기"), `${id} ${slot} 은 이동기가 아니다`);
}


/**
 * 개체가 안 잡힌 질문의 검색 폴백
 *
 * 모델이 만든 검색어로 코드가 찾는 경로다. 여기 쓰인 검색어는 지어낸 것이 아니라
 * gemma4:e2b 에게 실제로 물어서 받은 것을 그대로 옮겼다.
 *
 * **1위를 고정하지 않는다.** 실제 검색어로 재 보니 1위 적중은 4/8 이었지만
 * 상위 3위 안에는 8/8 로 들어왔다. 화면에서도 셋을 다 실어 모델이 고르게 하므로
 * 여기서도 셋 안에 있는지만 본다.
 */
const searchCorpus: SearchDoc[] = [
  ...[...ruleIndex.values()].map((rule) => ({
    kind: "rule" as const,
    title: rule.name,
    text: (rule.notesKo?.length === rule.notes.length ? rule.notesKo : rule.notes).join("\n"),
  })),
  ...mechanics.map((section) => ({
    kind: "mechanics" as const,
    title: section.title,
    text: section.text,
  })),
];

function titlesFor(query: string): string[] {
  return lexicalSearch(searchCorpus, query).map((hit) => hit.doc.title);
}

// 모델이 은어를 풀어 준 검색어는 자료에 닿아야 한다.
for (const [query, want] of [
  ["미니언 파밍 골드", "미니언"],
  ["미니언 사냥 효율 높이는 방법", "미니언"],
  ["와드 위치 추천", "와드"],
  ["와드 설치 위치 추천", "와드"],
  ["정복자 점화 효과", "점화"],
  ["부쉬에서 시야를 확보하는 방법", "덤불"],
] as const) {
  const titles = titlesFor(query);
  assert.ok(
    titles.includes(want),
    `"${query}" 는 ${want} 문서에 닿아야 한다 (받은 것: ${titles.join(", ") || "없음"})`,
  );
}

// 아이템·스킬은 이 경로에 오기 전에 이름으로 걸러진다. 여기 섞으면 규칙이 수적으로 밀린다.
assert.ok(
  searchCorpus.every((doc) => doc.kind === "rule" || doc.kind === "mechanics"),
  "검색 폴백 코퍼스에는 규칙과 메커니즘만 있어야 한다",
);

// 찾을 낱말이 하나도 없으면 빈 결과여야 한다. 그래야 훅이 다시 찾는다.
assert.equal(lexicalSearch(searchCorpus, "어떻게 하나요").length, 0, "없는 말뿐이면 빈 결과다");
assert.equal(lexicalSearch(searchCorpus, "").length, 0, "빈 검색어는 빈 결과다");

// 가벼운 모델은 찾은 자료를 그대로 옮긴다. 제목에 질문 낱말이 있는 문서만, 질문 낱말이 든 문장만.
{
  const ward = hitsToAnswer(lexicalSearch(searchCorpus, "와드 몇 개까지 설치돼?"), "와드 몇 개까지 설치돼?") ?? "";
  assert.ok(ward.startsWith("**와드**"), "와드 질문은 와드 문서가 먼저");
  assert.equal(
    hitsToAnswer(lexicalSearch(searchCorpus, "정글이 자꾸 탑으로 오는데 그럴 땐?"), "정글이 자꾸 탑으로 오는데 그럴 땐?"),
    undefined,
    "제목에 질문 낱말이 없는 문서(정글 식물 이야기)는 싣지 않는다",
  );
  // 영어 기능어("the")로 제목이 걸리면 안 된다. "Walk on the water"·"Press the Attack" 이 딸려 왔다.
  const english: SearchDoc[] = [
    { kind: "rule", title: "Press the Attack", text: "Hitting an enemy champion with 3 consecutive basic attacks deals bonus damage." },
    { kind: "rule", title: "Waterwalking", text: "Grants bonus movement speed in the river." },
  ];
  assert.equal(
    hitsToAnswer(lexicalSearch(english, "the rune that gives bonus damage after you dash"), "the rune that gives bonus damage after you dash"),
    undefined,
    "기능어만 겹친 제목은 싣지 않는다",
  );
  assert.ok(
    (hitsToAnswer(lexicalSearch(english, "does press the attack work on towers? bonus damage"), "does press the attack work on towers? bonus damage") ?? "").startsWith("**Press the Attack**"),
    "제목 낱말(press·attack)은 대소문자와 상관없이 찾는다",
  );
}

// 모델은 시키는 대로 안 할 때가 있다. 겉을 벗겨 낼 수 있어야 한다.
assert.equal(extractQuery('"미니언 파밍 골드"'), "미니언 파밍 골드", "따옴표를 벗긴다");
assert.equal(extractQuery("검색어: 와드 설치 위치"), "와드 설치 위치", "머리말을 벗긴다");
assert.equal(extractQuery("와드 설치 위치\n설명: …"), "와드 설치 위치", "첫 줄만 쓴다");
assert.equal(extractQuery("   "), "", "빈 응답은 빈 문자열이다");

/**
 * 문서의 부록은 자료가 아니다.
 *
 * 파이프라인 설명 절까지 색인했더니 "넌 누구야" 에 자료 이름으로
 * "위키 팁 — 수집했으나 프롬프트에는 넣지 않는다" 가 붙어 나갔다.
 */
for (const section of mechanics) {
  assert.doesNotMatch(section.title, /넣지 않는다|남는 한계|규칙 요약/, `부록이 자료로 들어왔다: ${section.title}`);
}

/**
 * 도우미 자신을 묻는 말은 검색으로 보내지 않는다.
 * 페르소나가 답을 들고 있고, 검색은 엉뚱한 자료 이름을 붙인다.
 */
{
  for (const q of ["넌 누구야", "너는 누구니", "너 뭐야", "what are you", "你是谁"]) {
    assert.ok(asksAboutHelper(q), `자기소개로 봐야 한다: ${q}`);
  }
  // 변형까지 표로 적지 않는다. 모델이 페르소나로 답한다.
  for (const q of ["무슨 모델 써?", "너 어디서 돌아?", "자기소개 해줘"]) {
    assert.ok(!asksAboutHelper(q), `표를 늘리지 않는다: ${q}`);
  }
  for (const q of ["말파이트 상대법", "오공 스킬 쿨타임", "누구를 골라야 해", "카운터가 뭐야", "와드 어디에 박아"]) {
    assert.ok(!asksAboutHelper(q), `게임 질문이다: ${q}`);
  }
}

console.log(
  `✅ Advisor retrieval passed (규칙 ${ruleIndex.size}종, 메커니즘 ${mechanics.length}절, 아이템 ${items.items.length}종, 검색 문서 ${searchCorpus.length}건)`,
);
