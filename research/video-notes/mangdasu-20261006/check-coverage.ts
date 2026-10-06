import fs from 'node:fs';
import { loadData } from '../../../scripts/llm/kev-agent/lib';
import { answerDialogue } from '../../../src/lib/advisor/dialogueFlow';
import { dehydrateTurn, reviveTurn } from '../../../src/lib/advisor/history';
import { translations } from '../../../src/i18n/translations';
import type { PlanContext } from '../../../src/lib/advisor/planTypes';
import type { Lang } from '../../../scripts/llm/kev-agent/lib';

const directory = 'research/video-notes/mangdasu-20261006';
const previous = JSON.parse(fs.readFileSync(`${directory}/questions.json`, 'utf8'));
const added = JSON.parse(fs.readFileSync(`${directory}/coverage-questions.json`, 'utf8'));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => typeof input === 'string' && input.startsWith('/data/')
  ? new Response(fs.readFileSync(`public${input}`)) : originalFetch(input, init);
const deps = { judge: async () => { throw new Error('Unexpected model call'); }, search: async () => [] };
const contexts = new Map<Lang, PlanContext>();
function context(lang: Lang): PlanContext {
  if (!contexts.has(lang)) contexts.set(lang, { data: loadData(lang), lang,
    copy: translations[lang].advisor, turns: [], championIds: [], judge: 'none',
    consented: false, canUseModel: false, retrieval: false });
  return { ...contexts.get(lang)!, turns: [] };
}
const rows = [];
for (const fixture of [...previous.cases, ...added.cases]) {
  const result = await answerDialogue(fixture.question, context(fixture.lang), deps);
  const answer = result.reply.text;
  const missing = fixture.expected.filter((value: string) => !answer.includes(value));
  const forbidden = (fixture.forbidden ?? []).filter((value: string) => answer.includes(value));
  const pass = !missing.length && !forbidden.length && !/https?:|youtube|mangdasu|참고 자료|출처/.test(answer);
  rows.push({ ...fixture, answer, pass, missing, forbidden });
  if (!pass) console.log(JSON.stringify({ id: fixture.id, question: fixture.question, missing, forbidden, answer }));
}
const sessions = [];
for (const session of [...previous.sessions, ...added.sessions]) {
  const ctx = context(session.lang);
  const turns = [];
  for (const fixture of session.turns) {
    const { reply } = await answerDialogue(fixture.question, ctx, deps);
    const missing = fixture.expected.filter((value: string) => !reply.text.includes(value));
    const forbidden = (fixture.forbidden ?? []).filter((value: string) => reply.text.includes(value));
    const row = { ...fixture, answer: reply.text, pass: !missing.length && !forbidden.length, missing, forbidden };
    turns.push(row);
    if (!row.pass) console.log(JSON.stringify({ session: session.id, ...row }));
    const added = [{ id: ctx.turns.length, role: 'user' as const, content: fixture.question },
      { id: ctx.turns.length + 1, role: 'assistant' as const, content: reply.text, answer: reply.answer, memory: reply.memory }];
    ctx.turns = [...ctx.turns, ...added.flatMap(turn => {
      const revived = reviveTurn(JSON.parse(JSON.stringify(dehydrateTurn(turn))), ctx.data!);
      return revived ? [revived] : [];
    })];
  }
  sessions.push({ ...session, turns, pass: turns.every(row => row.pass) });
}
const report = { mode: 'Deployed source, local answerDialogue, model disabled, video evidence only',
  singleTurns: rows.length, singlePassed: rows.filter(row => row.pass).length,
  sessionTurns: sessions.flatMap(session => session.turns).length,
  sessionPassed: sessions.filter(session => session.pass).length, rows, sessions };
fs.writeFileSync(`${directory}/${process.env.COVERAGE_REPORT ?? 'coverage-evaluation.json'}`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ singleTurns: report.singleTurns, singlePassed: report.singlePassed,
  sessions: sessions.length, sessionPassed: report.sessionPassed, sessionTurns: report.sessionTurns }));
