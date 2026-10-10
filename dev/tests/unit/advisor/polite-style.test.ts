/**
 * 한다체 → 합니다체 변환 검사
 *
 * 노트 원본을 통째로 고치는 변환이라, 규칙이 어긋나면 9천 문장이 한꺼번에 상한다.
 * 어간 규칙과 이미 존댓말인 문장의 대표 경계를 남긴다.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { toPoliteSentence, toPoliteText } from "../../../../src/domain/knowledge/text/politeStyle";

const CASES: Array<[string, string]> = [
  // ~는다 (자음 어간 동사)
  ["W를 켜고 평타를 넣는다.", "W를 켜고 평타를 넣습니다."],
  // ~ㄴ다 (모음 어간 동사)
  ["상대가 라인을 민다.", "상대가 라인을 밉니다."],
  // 형용사·지정사
  ["딜 교환이 유리하다.", "딜 교환이 유리합니다."],
  ["대응할 방법이 없다.", "대응할 방법이 없습니다."],
  ["서두를 일이 아니다.", "서두를 일이 아닙니다."],
  // 손대지 않는 것
  ["이미 합니다체입니다.", "이미 합니다체입니다."],
  ["W를 켠 뒤에 붙으십시오.", "W를 켠 뒤에 붙으십시오."],
  ["궁을 아껴 두고", "궁을 아껴 두고"],
];

for (const [input, want] of CASES) {
  test(input, () => {
    assert.equal(toPoliteSentence(input), want);
  });
}

test("여러 문장이 이어진 글", () => {
  const long = "W는 다음 평타를 강화한다. E는 상대 공격 속도를 깎으니 나중에 쓴다. 물몸 상대는 한 사이클에 정리된다.";
  const wantLong = "W는 다음 평타를 강화합니다. E는 상대 공격 속도를 깎으니 나중에 씁니다. 물몸 상대는 한 사이클에 정리됩니다.";
  assert.equal(toPoliteText(long), wantLong);
});
