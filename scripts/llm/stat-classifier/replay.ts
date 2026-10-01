/** 이전 턴의 실제 예측을 이어받는다. 정답을 기억에 다시 써 넣지 않는다. */
import fs from "node:fs";
import { modeNames, runQuestion, directory } from "./adapter";
import { data } from "./runtime";
import { conversations } from "./conversations";
import { emptyDialogue, rememberAnswer } from "../../../src/lib/advisor/dialogueState";
import { resolveQuestion } from "../../../src/lib/advisor/resolvedQuestion";
import { buildSpellAnswer } from "../../../src/lib/advisor/answer";

const summaries = modeNames.map(mode => {
  const rows = conversations.flatMap(conversation => {
    let memory = emptyDialogue(data.patch);
    return conversation.turns.map(turn => {
      const before = structuredClone(memory);
      const result = runQuestion({ question: turn.question, memory }, mode);
      if (result.query) {
        memory.active = "stat";
        memory.stat = result.query;
        memory.compared = result.query.champions.length > 1 ? [...result.query.champions] : undefined;
        memory.spell = undefined;
      } else {
        // 명시적으로 이름과 슬롯을 새로 말하면 앱의 스킬 기억 전환을 사용한다.
        const resolved = resolveQuestion(turn.question, data);
        const card = resolved.champions.length === 1 ? resolved.champions[0] : undefined;
        const spell = card?.spells.find(spell => spell.slot === resolved.slot);
        if (card && spell) memory = rememberAnswer(memory, buildSpellAnswer(card, spell, turn.question));
      }
      return { conversation: conversation.id, question: turn.question, expected: turn.expected, ...result, before, after: structuredClone(memory),
        exact: JSON.stringify(result.query) === JSON.stringify(turn.expected) };
    });
  });
  return { mode, correct: rows.filter(row => row.exact).length, total: rows.length,
    conversations: Object.fromEntries(conversations.map(c => [c.id, { correct: rows.filter(row => row.conversation === c.id && row.exact).length, total: c.turns.length }])), rows };
});
fs.writeFileSync(`${directory}/replay.json`, JSON.stringify(summaries, null, 2));
console.log(JSON.stringify(summaries.map(({ rows: _rows, ...summary }) => summary), null, 2));
