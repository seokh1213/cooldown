/**
 * 노트 선택 시험
 *
 * 노트를 아무리 잘 써 두어도 그 질문에서 안 뽑히면 없는 것과 같다. 실제로
 * `situational-item` 을 도출로 바꾸고 `escape-window` 를 새로 만들었을 때, 정작
 * "마법 저항력 올려야 하나" 가 라인전 노트를 물어 왔다. 갈래를 늘릴 때마다 여기에
 * 물음을 한 줄 더한다.
 *
 * 관점은 **가릴 수 있을 때만** 가린다. "제드 라인전 어떻게 풀어" 는 내가 제드인지
 * 제드를 상대하는지 한국어로도 알 수 없다. 그런 것은 `both` 로 두어 양쪽을 다
 * 싣는 것이 맞고, 억지로 규칙을 늘리면 멀쩡한 판정이 같이 무너진다.
 */
import assert from "node:assert/strict";
import { noteOrder, notePerspective, type NoteCategory, type NotePerspective } from "../src/lib/advisor/noteSelect";
import { asksMatchup, matchupSidesDetailed } from "../src/lib/advisor/answer";

/** 시점 시험에 쓰는 이름들. 자료를 읽지 않고 이름만 있으면 된다. */
const NAMES = ["오공", "럼블", "야스오", "말파이트", "제드", "럭스"];

const CASES: Array<[question: string, category: NoteCategory, side: NotePerspective]> = [
  // 무엇을 올려야 하는가 — 물건 이름이 아니라 스탯으로 묻는 쪽이 더 잦다
  ["빅토르 상대로 마법 저항력 올려야 하나", "situational-item", "against"],
  ["빅토르 상대할 때 방어력 사도 돼?", "situational-item", "against"],
  ["야스오 상대로 뭐 올려야 함", "situational-item", "against"],
  ["제드한테 갑옷 쌓으면 돼?", "situational-item", "against"],
  ["카타리나 치유 감소 필요해?", "situational-item", "against"],
  ["말파이트 강인함 가야 하나", "situational-item", "against"],
  ["아이템 뭐 가야 돼", "situational-item", "both"],

  // 언제 물어야 하는가 — 상대의 이동기와 그 공백
  ["아칼리 언제 물어야 해", "escape-window", "against"],
  ["이즈리얼 진입 각 언제 나와", "escape-window", "against"],
  ["가렌 도망 못 가게 하려면", "escape-window", "against"],

  // 기존 갈래가 밀려나지 않는지
  ["리신 콤보 알려줘", "combo", "playing"],
  ["야스오로 딜교 어떻게 해", "combo", "playing"],
  ["그레이브즈 한타에서 뭐 해야 돼", "teamfight", "both"],
  ["제드 라인전 어떻게 풀어", "laning", "both"],
  ["나서스 후반 스케일 어때", "phase", "both"],
  ["아리 스킬 어떻게 생겼어", "skill", "both"],

  // 관점만 가리는 물음
  ["말파이트 상대법", "skill", "against"],
  ["말파이트로 하는 법", "skill", "playing"],
];

for (const [question, category, side] of CASES) {
  assert.equal(noteOrder(question)[0], category, `"${question}" 의 갈래`);
  assert.equal(notePerspective(question), side, `"${question}" 의 관점`);
}

// "상대로" 의 `로` 가 "말파로" 의 `로` 로 읽히면 관점이 통째로 무너진다.
assert.equal(notePerspective("빅토르 상대로 어떻게 해"), "against", "상대로 는 플레이 표시가 아닙니다");
assert.equal(notePerspective("빅토르로 어떻게 해"), "playing", "…로 는 플레이 표시입니다");

// 화면의 칩은 물었던 문장에 관점만 덧붙여 다시 묻는다. 주제는 그대로 남아야 한다.
for (const [original, category] of [
  ["제드 라인전 어떻게 풀어", "laning"],
  ["그레이브즈 한타에서 뭐 해야 돼", "teamfight"],
] as const) {
  assert.equal(notePerspective(original), "both", `"${original}" 은 문장만으로 못 가립니다`);
  for (const [suffix, side] of [["상대할 때", "against"], ["내가 할 때", "playing"]] as const) {
    const asked = `${original} (${suffix})`;
    assert.equal(notePerspective(asked), side, `"${asked}" 의 관점`);
    assert.equal(noteOrder(asked)[0], category, `"${asked}" 의 갈래가 바뀌면 안 됩니다`);
  }
}

// 갈래가 늘면 기본 순서에도 들어 있어야 한다. 빠지면 그 갈래는 영영 안 뽑힌다.
for (const category of ["situational-item", "escape-window"] as const) {
  assert.ok(noteOrder("아무 말").includes(category), `기본 순서에 ${category} 가 없습니다`);
}

/*
 * 상성 질문에서 누가 내 챔피언인지 가린다.
 *
 * 예전에는 문장에 먼저 나온 쪽으로 정했다. 상대를 먼저 말하면 통째로 뒤집혀서
 * "럼블 상대로 오공 하는데" 가 럼블 시점 해설이 됐다. 조사가 그 자리를 표시하므로
 * 조사를 본다. 스무 문항으로 재니 어순 4, 조사 16 이었다.
 *
 * 조사가 갈라 주지 못하는 꼴("나 오공", "상대 제드")은 `confident` 가 거짓이 되고,
 * 그때는 부르는 쪽이 모델에게 넘긴다. 여기서는 그 표시가 제대로 서는지까지 본다.
 */
const SIDES: Array<[string, string, boolean]> = [
  ["오공으로 럼블 상대가 어려운데 팁 없나?", "오공", true],
  ["럼블 상대로 오공 하는데 어려워", "오공", true],
  ["럼블을 오공으로 상대하려면?", "오공", true],
  ["상대가 럼블인데 오공으로 어떻게 해", "오공", true],
  ["야스오 상대로 말파이트 괜찮아?", "말파이트", true],
  ["말파이트로 야스오 카운터 되나", "말파이트", true],
  ["제드 상대하는 럭스 공략", "럭스", true],
  ["럭스로 제드 상대법", "럭스", true],
  // 조사가 갈라 주지 않는 꼴. 어순으로 떨어지고, 믿을 것이 못 된다고 표시해야 한다.
  ["오공이랑 럼블 붙으면 누가 이겨", "오공", false],
  ["럼블이랑 붙었는데 나 오공", "럼블", false],
];

for (const [question, expected, confident] of SIDES) {
  const found = [...NAMES]
    .filter((name) => question.includes(name))
    .sort((left, right) => question.indexOf(left) - question.indexOf(right))
    .map((name) => ({ name }));
  assert.equal(found.length, 2, `"${question}" 에서 챔피언 둘을 찾아야 한다`);
  assert.ok(asksMatchup(question), `"${question}" 은 상성 질문이어야 한다`);
  const detail = matchupSidesDetailed(question, found);
  assert.equal(detail.sides[0].name, expected, `"${question}" 의 내 챔피언`);
  assert.equal(detail.confident, confident, `"${question}" 의 확신 여부`);
}

console.log(`✅ 노트 선택 통과 (물음 ${CASES.length}개 · 시점 ${SIDES.length}개)`);
