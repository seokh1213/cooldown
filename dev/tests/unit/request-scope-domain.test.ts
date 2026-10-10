import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRequestInput } from "../../../src/features/advisor/understanding/classifyRequestInput";
import type { ResolvedQuestion } from "../../../src/features/advisor/understanding/resolvedQuestion";
import type { PlanDeps } from "../../../src/features/advisor/contracts/planTypes";
import type { RequestScope } from "../../../src/features/advisor/understanding/requestIntent";

const question = (text: string): ResolvedQuestion => ({ text, mentions: [], champions: [], spellFocus: undefined });
const classify = (scope: RequestScope): PlanDeps => ({ judge: async () => [], search: async () => [],
  classifyRequest: async () => ({ scope, confidence: 0 }) });

test("수치·규칙 질문을 도우미 소개나 잡담으로 바꾸지 않는다", async () => {
  for (const text of ["사전 준비가 기본 저항력에 더하는 비율은?", "감전 발동 지연은 몇 초야?", "서렌은 몇 분부터 가능해?"]) {
    for (const scope of ["chat", "identity"] as const) {
      const resolved = question(text);
      assert.equal(await classifyRequestInput(resolved, classify(scope)), resolved);
    }
  }
});

test("실제 잡담·도우미 질문과 챔피언 요청 범위는 보존한다", async () => {
  for (const [text, scope] of [["고마워", "chat"], ["Who are you?", "identity"],
    ["你是谁", "identity"], ["오공으로 짧게 딜교하려면?", "combo"], ["오공 스킬 전부 설명해줘", "skills"]] as const) {
    assert.equal((await classifyRequestInput(question(text), classify(scope))).requestIntent?.scope, scope);
  }
});

test("높은 확신의 로지스틱 판정은 기존 정책을 유지한다", async () => {
  const deps = classify("identity");
  deps.classifyRequest = async () => ({ scope: "identity", confidence: 0.95 });
  assert.equal((await classifyRequestInput(question("도우미를 소개해줘"), deps)).requestIntent?.scope, "identity");
});

test("높은 확신이어도 게임 질문을 자기소개로 바꾸지 않는다", async () => {
  const deps = classify("identity");
  deps.classifyRequest = async () => ({ scope: "identity", confidence: 0.95 });
  for (const text of ["무한의 대검 능력치 뭐야?", "둘 다 라인전에서 뭘 조심해?"]) {
    const resolved = question(text);
    assert.equal(await classifyRequestInput(resolved, deps), resolved);
  }
});
