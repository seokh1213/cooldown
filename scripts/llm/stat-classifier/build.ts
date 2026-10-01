/** train/dev/test를 먼저 고정하고 정답을 코드의 예측과 독립적으로 붙인다. */
import fs from "node:fs";
import { emptyDialogue, type DialogueMemory } from "../../../src/lib/advisor/dialogueState";
import type { ChampionStatQuery, StatLevel } from "../../../src/lib/advisor/statQuery";
import { fields, families, contextual, type Label } from "./seeds";
import { data, inputFeatures } from "./runtime";
import type { Example } from "./contracts";
import { auditSplits } from "./splitAudit";

const directory = "research/llm-evals/stat-query/ml";
fs.mkdirSync(directory, { recursive: true });
const splits = ["train", "dev", "test"] as const;
const rows: Example[] = [];
const levels: StatLevel[] = [1, 6, 11, 18];
const pair = ["MonkeyKing", "DrMundo"];
function previous(active: "stat" | "spell" | "champion" | undefined, level: StatLevel = 6): DialogueMemory {
  const memory = emptyDialogue(data.patch);
  memory.active = active;
  if (active === "stat") memory.stat = { kind: "championStat", champions: pair, field: "health", level };
  if (active === "spell") memory.spell = { champion: "DrMundo", slot: "R", focus: "effect" };
  if (active === "champion") memory.champion = "Lux";
  return memory;
}
function add(input: Omit<Example, "id" | "text" | "features">) {
  rows.push({ ...input, id: `q${String(rows.length).padStart(4, "0")}`, ...inputFeatures(input.question, input.memory) });
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
        const at = Math.floor(phrase.length / 2);
        add({ ...base, question: `${scope.prefix} ${phrase.slice(0, at)}${phrase.slice(at + 1)}` });
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

const counts = Object.fromEntries(splits.map(split => [split, rows.filter(row => row.split === split).length]));
const audit = auditSplits(rows);
fs.writeFileSync(`${directory}/questions.jsonl`, rows.map(row => JSON.stringify(row)).join("\n") + "\n");
fs.writeFileSync(`${directory}/dataset.json`, JSON.stringify({ patch: data.patch, counts, ...audit, seed: "authored-v1", augmentation: "train 계열만 띄어쓰기·삭제·자모 치환" }, null, 2));
console.log(JSON.stringify({ counts, ...audit }));
