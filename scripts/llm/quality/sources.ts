export const dialogueSources = [
  "dialogue-coverage/questions.json", "dialogue-coverage/edge-questions.json", "request-contract/questions.json",
  "conversational-advisor/questions.json", "crowd-control/questions.json", "control-audit/questions.json",
  "champion-mechanics-v2/questions.json", "champion-mechanics-v2/full-approval-questions.json",
  "champion-mechanics-v2/integrated-fresh-questions.json", "champion-mechanics-v2/pyke-akshan-questions.json",
  "champion-mechanics-v2/variations-v1-questions.json", "atoms/action-conditions/questions.json",
  "atoms/action-conditions/holdout.json", "atoms/answer-quality/questions.json", "atoms/broad-replay/questions.json",
  "atoms/conditional-fiora/questions.json", "atoms/conditional-fiora/holdout.json", "atoms/context-replay/questions.json",
];

export const requestSources = ["request-test.json", "request-holdout.json", "request-challenge.json", "request-negation.json", "request-scope-holdout.json"];

// Historical outputs stay readable; only registered expectations become automatic assertions.
export const families: Record<string, string> = {
  workflow: "canonical fixtures, inventory, regression/quality runner",
  atoms: "dialogue, node tests, manual review", "champion-mechanics-v2": "dialogue, node tests, manual review",
  "conversational-advisor": "dialogue, memory assertions, manual review", "dialogue-coverage": "dialogue",
  "request-contract": "dialogue", "crowd-control": "dialogue, node tests", "control-audit": "dialogue, node tests",
  "request-classifier": "request classification, recovered flow contracts", "offline-classifier": "legacy plans, node tests",
  "kev-agent": "legacy plans, judge labels, manual review", "vector-search": "retrieval",
  "item-aliases": "item lookup", "stat-query": "stat query, dialogue, node tests",
  "mechanic-schema": "dialogue, manual review", "passive-rag": "dialogue, manual review",
  "passive-mechanics": "node tests, manual review", "chat-quality-2026-10-05": "legacy dialogue",
  "small-bases-2026-10-06": "numeric QA, manual review", "master-recheck-2026-10-06": "numeric QA, legacy dialogue",
  "combined-qa-2026-10-06": "numeric QA, worker proof", "tuning-2026-10-05": "retrieval, numeric QA, infrastructure tests",
  "tuning-2026-10-06": "numeric QA, infrastructure tests", systemone: "legacy plans; obsolete backend results archived",
  jeff: "judge labels; obsolete backend results archived", "codex-models": "manual review; paid generators archived",
  precompute: "manual review", "precompute-v2": "manual review", "precompute-patch": "manual review",
  "precompute-engine": "manual review", "cross-role": "manual review", "ontology-graph": "manual review",
  "fact-audit": "knowledge validation, node tests; old audit results archived",
  "matchup-translation": "translation node tests, manual review",
};
