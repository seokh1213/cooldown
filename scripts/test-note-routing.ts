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

// 갈래가 늘면 기본 순서에도 들어 있어야 한다. 빠지면 그 갈래는 영영 안 뽑힌다.
for (const category of ["situational-item", "escape-window"] as const) {
  assert.ok(noteOrder("아무 말").includes(category), `기본 순서에 ${category} 가 없습니다`);
}

console.log(`✅ 노트 선택 통과 (물음 ${CASES.length}개)`);
