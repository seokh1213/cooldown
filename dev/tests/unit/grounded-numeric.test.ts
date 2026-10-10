import assert from "node:assert/strict";
import { test } from "node:test";
import { verifiedNumeric, numericContext } from "../../../src/features/advisor/answers/numericEvidence";
import { answerGroundedNumeric } from "../../../src/features/advisor/answers/groundedNumeric";
import { isJudgeCompatible } from "../../../src/features/advisor/model/judgeCompatibility";
import type { AdvisorData } from "../../../src/features/advisor/conversation/context";
import type { DialoguePlan } from "../../../src/features/advisor/conversation/dialoguePlanner";
import type { DialogueReply } from "../../../src/features/advisor/conversation/dialogueReply";
import type { AdvisorAnswer } from "../../../src/features/advisor/answers/answer";
import { ADVISOR_MODEL } from "../../../src/features/advisor/model/config";

const document = { id: "rule:감전", kind: "rule" as const, title: "감전", text: "발동 지연은 0.25초입니다.\n재사용 대기시간은 20초입니다." };
const question = "감전 발동 지연은 몇 초야?";

test("문서 안의 다른 숫자·단위·조건을 짧은 정답으로 채택하지 않는다", () => {
  assert.equal(verifiedNumeric("0.25초", question, document)?.value, "0.25초");
  for (const candidate of ["20초", "0.25분", "정답은 0.25초", "0.25초 또는 20초", "NOT_FOUND"]) {
    assert.equal(verifiedNumeric(candidate, question, document), undefined);
  }
  assert.equal(verifiedNumeric("0.25초", question, { ...document, text: `${document.text}\n특수 조건에서는 발동 지연이 0.5초입니다.` }), undefined);
  assert.equal(verifiedNumeric("0.25초", "감전 지속 시간은 몇 초야?", document), undefined);
  assert.equal(verifiedNumeric("0.25초", "감전은 몇 초야?", document), undefined);
  assert.equal(verifiedNumeric("0.25초", "감전 6레벨 발동 지연은 몇 초야?", { ...document, text: "3레벨 발동 지연은 0.25초입니다." }), undefined);
  assert.equal(verifiedNumeric("5%", "감전 기본 저항력 증가 비율은?", { ...document, text: "추가 저항력 증가 비율은 5%입니다." }), undefined);
});

test("문서 제한은 질문만 사용하고 제목과 선택한 줄의 순서를 보존한다", () => {
  const source = `감전\n${"관계없는 자료 ".repeat(90)}\n${document.text}`;
  const context = numericContext(source, question, 120);
  assert.ok(context.startsWith("감전\n"));
  assert.ok(context.includes("발동 지연은 0.25초입니다."));
  assert.ok(context.length <= 120);
});

const rule = { name: "감전", page: "test", subject: "rune" as const, notes: ["Delay: 0.25 seconds.", "Cooldown: 20 seconds."], notesKo: document.text.split("\n") };
const data = { patch: "test", stale: false, ruleIndex: new Map([[rule.name, rule]]), mechanics: [] } as unknown as AdvisorData;
const answer: AdvisorAnswer = { kind: "rule", rule, highlighted: [], rest: rule.notes };
const dialogue: DialoguePlan = { parts: [{ question, plan: { type: "card", answer } }], memory: { patch: "test", conditions: [] } };
const reply: DialogueReply = { answer, text: document.text,
  memory: { patch: "test", conditions: [], lastReply: { question, text: document.text } } };

test("검증된 QA 답을 원래 카드·근거·기억과 함께 전달한다", async () => {
  const result = await answerGroundedNumeric(dialogue, reply, data, async request => {
    assert.equal(request.purpose, "grounded-numeric");
    assert.equal(request.maxTokens, 24);
    return "0.25초";
  });
  assert.ok(result.numericAttempt.accepted);
  assert.ok(result.reply.text.startsWith("**0.25초**"));
  assert.equal(result.reply.answers?.[0], reply.answer);
  assert.ok(result.reply.text.includes(reply.text));
  assert.equal(result.reply.memory.lastReply?.text, result.reply.text);
});

test("QA 불일치·오류·오래된 자료는 원래 답변으로 돌아간다", async () => {
  for (const generate of [async () => "20초", async () => { throw new Error("interrupted"); }]) {
    const result = await answerGroundedNumeric(dialogue, reply, data, generate);
    assert.equal(result.reply, reply);
    assert.equal(result.numericAttempt.accepted, false);
  }
  const stale = await answerGroundedNumeric(dialogue, reply, { ...data, stale: true }, async () => assert.fail("stale generation"));
  assert.equal(stale.reply, reply);
});

test("새 QA 그래프는 보존된 판정 헤드만 재사용하고 다른 베이스·양자화·그래프를 거절한다", () => {
  const head = { id: ADVISOR_MODEL.id, dtype: "q4", graph: "models/kev/b3e/model_q4.onnx" };
  assert.ok(isJudgeCompatible(head, ADVISOR_MODEL));
  for (const incompatible of [{ ...head, id: "other" }, { ...head, dtype: "fp16" }, { ...head, graph: "other.onnx" }]) {
    assert.equal(isJudgeCompatible(incompatible, ADVISOR_MODEL), false);
  }
});
