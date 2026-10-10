/** 0.8B가 원문 단위를 고르는 데 도움이 되는지 로컬에서 잰다. 앱 판정 가중치와 같은 모델은 아니다. */
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { loadData } from "../kev-agent/lib";
import { selectPlaybook } from "../../../../src/domain/knowledge/notes/playbookCore";
import { adviceUnit, actionEligible } from "../../../../src/features/advisor/application/adviceActions";
import { adviceQuestion, relevantAdvice } from "../../../../src/features/advisor/application/adviceRelevance";
import { checkedMatchupText } from "../../../../src/features/advisor/answers/evidence/matchupFactCheck";
import { scenarioConditions } from "../../../../src/features/advisor/understanding/requests/scenarioConditions";

const cases = [
  { id: "m01", mine: "Thresh", enemy: "Morgana", q: "내 Q 없이 어떻게 들어가?", state: "내 Q가 없어", ids: ["thresh-skill-w", "thresh-skill-e", "vs-morgana-q"], expected: ["thresh-skill-e"] },
  { id: "m02", mine: "Jax", enemy: "Fiora", q: "내 Q와 E가 없는데 딜 교환은?", state: "내 Q와 E가 없어", ids: ["jax-skill-r", "jax-combo-trade", "vs-fiora-vital"], expected: ["jax-combo-trade", "vs-fiora-vital"] },
  { id: "m03", mine: "Ahri", enemy: "Zed", q: "내 E가 없는데 상대 궁에 어떻게 대응해?", state: "내 E가 없어", ids: ["ahri-laning", "ahri-skill-w", "vs-zed-e", "vs-zed-r-track"], expected: [] },
  { id: "m04", mine: "Leona", enemy: "Morgana", q: "내 Q E R이 없는데 어떻게 진입해?", state: "내 Q와 E와 R이 없어", ids: ["leona-skill-w", "leona-skill-passive", "vs-morgana-q"], expected: [] },
  { id: "m05", mine: "Ahri", enemy: "Zed", q: "내 R이 없어. 기본 콤보는?", state: "내 R이 없어", ids: ["ahri-combo-basic", "ahri-combo-q", "ahri-laning"], expected: ["ahri-combo-basic"] },
  { id: "m06", mine: "Vayne", enemy: "Darius", q: "내 Q와 E 없이 어떻게 버텨?", state: "내 Q와 E가 없어", ids: ["vs-darius-q", "vs-darius-passive", "vs-darius-r"], expected: ["vs-darius-q", "vs-darius-passive", "vs-darius-r"] },
];
const data = loadData("ko_KR");
const model = "qwen3.5:0.8b";
const rows = [];
for (const item of cases) {
  const subjects = { mine: data.cardById.get(item.mine)!, enemy: data.cardById.get(item.enemy)! };
  const conditions = scenarioConditions(item.state, [], 1);
  const selected = selectPlaybook(data.playbooks, subjects.mine, subjects.enemy);
  const candidates = (["mine", "enemy"] as const).flatMap(side => (side === "mine" ? selected.mine : selected.vsEnemy).flatMap(entry => {
    if (!item.ids.includes(entry.id ?? "")) return [];
    const text = checkedMatchupText(entry.text, Object.values(subjects));
    const unit = adviceUnit(text, { ...subjects, defaultOwner: side });
    return text && actionEligible(unit, conditions) ? [{ id: entry.id!, text, category: entry.category, side }] : [];
  }));
  const started = performance.now();
  try {
    const response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model, stream: false, think: false, keep_alive: "5m", options: { temperature: 0, num_ctx: 2048, num_predict: 64 },
        format: { type: "object", properties: { ids: { type: "array", items: { type: "string" }, maxItems: 2 } }, required: ["ids"], additionalProperties: false },
        messages: [{ role: "system", content: "질문에 직접 답하는 노트 ID를 최대 2개 선택하세요. 원문의 선행 조건을 지켜야 합니다. 단순 스킬 설명을 진입이나 교환 대안으로 바꾸지 마세요. 직접 답할 노트가 없으면 ids는 빈 배열입니다. JSON만 답하세요." },
          { role: "user", content: JSON.stringify({ question: item.q, mine: subjects.mine.name, enemy: subjects.enemy.name, conditions, notes: candidates }) }] }),
    });
    if (!response.ok) throw new Error(`Ollama ${response.status}`);
    const body = await response.json() as { message: { content: string }; load_duration: number; prompt_eval_count: number; eval_count: number };
    const answer = JSON.parse(body.message.content) as { ids?: unknown };
    const ids = Array.isArray(answer.ids) && answer.ids.every(id => typeof id === "string") ? answer.ids as string[] : [];
    const valid = ids.length <= 2 && new Set(ids).size === ids.length && ids.every(id => candidates.some(c => c.id === id));
    const relevant = valid && ids.every(id => { const c = candidates.find(c => c.id === id)!; return relevantAdvice(c.text, c.category, c.side, adviceQuestion(item.q, subjects)); });
    const pass = valid && (item.expected.length ? ids.length > 0 && ids.every(id => item.expected.includes(id)) : ids.length === 0);
    rows.push({ ...item, candidates, ids, valid, relevant, pass, seconds: (performance.now() - started) / 1000, loadSeconds: body.load_duration / 1e9, promptTokens: body.prompt_eval_count, outputTokens: body.eval_count });
  } catch (error) {
    rows.push({ ...item, candidates, error: error instanceof Error ? error.message : "unknown", pass: false, seconds: (performance.now() - started) / 1000 });
  }
}
const summary = { model, cases: rows.length, passed: rows.filter(r => r.pass).length, totalSeconds: rows.reduce((n, r) => n + r.seconds, 0),
  acceptedAfterRelevance: rows.filter(r => "relevant" in r && r.relevant && r.pass).length };
writeFileSync("dev/research/llm-evals/atoms/answer-quality/ollama.json", JSON.stringify({ scope: "same 0.8B base family; Q8 Ollama, not browser q4+LoRA; author-selected six cases", summary, rows }, null, 2) + "\n");
console.log(JSON.stringify(summary));
