/** train/dev/test를 먼저 고정하고 정답을 코드의 예측과 독립적으로 붙인다. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import { emptyDialogue, type DialogueMemory } from "../../../../src/features/advisor/conversation/dialogueState";
import type { ChampionStatQuery, StatLevel } from "../../../../src/features/advisor/understanding/statQuery";
import { fields, families, contextual, type Label } from "./seeds";
import { data, inputFeatures } from "./runtime";
import type { Example } from "./contracts";
import { auditSplits } from "./splitAudit";
import { keyboardNoise } from "./noise";

const directory = "dev/research/llm-evals/stat-query/ml";
fs.mkdirSync(directory, { recursive: true });
const splits = ["train", "dev", "test"] as const;
const rows: Example[] = [];
const levels: StatLevel[] = [1, 6, 11, 18];
const pair = ["MonkeyKing", "DrMundo"];
const heldoutIds: Record<string, string> = JSON.parse(fs.readFileSync("dev/scripts/advisor/stat-classifier/example-ids.json", "utf8"));
function previous(active: "stat" | "spell" | "champion" | undefined, level: StatLevel = 6): DialogueMemory {
  const memory = emptyDialogue(data.patch);
  memory.active = active;
  if (active === "stat") memory.stat = { kind: "championStat", champions: pair, field: "health", level };
  if (active === "spell") memory.spell = { champion: "DrMundo", slot: "R", focus: "effect" };
  if (active === "champion") memory.champion = "Lux";
  return memory;
}
function add(input: Omit<Example, "id" | "text" | "features">) {
  const key = createHash("sha256").update(`${input.question}|${input.memory.active ?? "none"}`).digest("hex").slice(0, 16);
  const id = input.split === "train" ? `train-${rows.length}` : heldoutIds[key] ?? `${input.split}-${key}`;
  rows.push({ ...input, id, ...inputFeatures(input.question, input.memory) });
}

for (const family of families) for (const split of splits) {
  family[split].forEach((phrase, index) => {
    const level = levels[index % levels.length];
    const scopes = [
      { prefix: `오공 문도 박사 ${level}레벨`, memory: previous(undefined), champions: pair, level },
      { prefix: "그럼", memory: previous("stat", level), champions: pair, level },
      { prefix: `럭스 ${level}레벨 기본 스탯`, memory: previous("champion"), champions: ["Lux"], level },
    ];
    for (const scope of scopes) {
      const expected: ChampionStatQuery | null = family.label === "other" ? null
        : { kind: "championStat", champions: scope.champions, field: family.label as typeof fields[number], level: scope.level };
      const question = `${scope.prefix} ${phrase}`;
      const base = { family: `${family.label}:${phrase.toLowerCase().replace(/\s/g, "")}`, split, category: family.label === "other" ? "negative" : split === "test" && index < 2 ? "typo" : "field",
        question, memory: scope.memory, label: family.label, expected };
      add(base);
      if (split === "train") {
        // 같은 계열 안에서 띄어쓰기·한 글자 삭제·자모 오타를 증강한다. test 계열을 읽지 않는다.
        add({ ...base, question: question.replace(/ /g, "") });
        for (const typo of keyboardNoise(phrase)) add({ ...base, question: `${scope.prefix} ${typo}` });
        add({ ...base, question: phrase });
        for (let at = 0; at < phrase.length; at++) {
          if (/\s/.test(phrase[at])) continue;
          add({ ...base, question: `${scope.prefix} ${phrase.slice(0, at)}${phrase.slice(at + 1)}` });
          if (at + 1 < phrase.length && !/\s/.test(phrase[at + 1])) {
            add({ ...base, question: `${scope.prefix} ${phrase.slice(0, at)}${phrase[at + 1]}${phrase[at]}${phrase.slice(at + 2)}` });
          }
        }
        const jamoTypo = phrase.replace(/[가-힣]/, ch => String.fromCodePoint(ch.codePointAt(0)! + 28));
        add({ ...base, question: `${scope.prefix} ${jamoTypo}` });
      }
    }
  });
}
for (const split of splits) contextual[split].forEach(question => {
  for (const active of ["stat", "spell", undefined] as const) {
    const memory = previous(active, 11);
    const healing = /회복|재생/.test(question);
    const label: Label = active === "stat" ? healing ? "healthRegen" : "inherit" : "other";
    const champions = /문도/.test(question) ? ["DrMundo"] : /오공/.test(question) ? ["MonkeyKing"] : pair;
    const requestedLevel = /18/.test(question) ? 18 : /6/.test(question) ? 6 : 11;
    const expected: ChampionStatQuery | null = active === "stat" ? { kind: "championStat", champions, field: healing ? "healthRegen" : "health", level: requestedLevel } : null;
    add({ family: `context:${question.toLowerCase().replace(/\s/g, "")}`, split, category: "context", question, memory, label, expected });
  }
});

// 별도 요청 분류기의 train 문장으로 소개·스킬·상성·일반 질문을 조회 기각 예시로 보강한다.
const requestTraining: Record<string, string[]> = JSON.parse(fs.readFileSync("dev/scripts/advisor/offline-classifier/request-training.json", "utf8"));
const inputKey = (question: string, active: DialogueMemory["active"]) => `${question.toLowerCase().replace(/\s/g, "")}|${active ?? "none"}`;
const existingInputs = new Set(rows.map(row => inputKey(row.question, row.memory.active)));
for (const [scope, questions] of Object.entries(requestTraining)) {
  if (["stats", "statsAll"].includes(scope)) continue;
  for (const text of questions) for (const active of [undefined, "stat", "spell", "champion"] as const) {
    const question = text.replaceAll("◇", "애쉬");
    const key = inputKey(question, active);
    if (existingInputs.has(key)) continue;
    existingInputs.add(key);
    add({ family: `request-negative:${text}`, split: "train", category: "negative", question,
      memory: previous(active), label: "other", expected: null });
  }
}

const counts = Object.fromEntries(splits.map(split => [split, rows.filter(row => row.split === split).length]));
const audit = auditSplits(rows);
fs.writeFileSync(`${directory}/questions.jsonl`, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
fs.writeFileSync(`${directory}/dataset.json`, JSON.stringify({ patch: data.patch, counts, ...audit, seed: "authored-v1",
  augmentation: "train 계열만 띄어쓰기·삭제·자모 치환 및 request-training.json의 비조회 문장", negativeSource: "dev/scripts/advisor/offline-classifier/request-training.json" }, null, 2));
console.log(JSON.stringify({ counts, ...audit }));
