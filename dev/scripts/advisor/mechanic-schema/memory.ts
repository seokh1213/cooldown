import { emptyScenario, type Memory, type Query, type Scenario } from "./types";

const fields: Record<Exclude<Query["topic"], "inherit">, Array<keyof Scenario>> = {
  conversion: ["healthAmount", "healthKind"], basic_attack: ["followup"],
  stack_proc: ["hits", "target", "shieldReady"], recovery: ["visibleToEnemies"], unsupported: [],
};
/** 사용자가 질문한 가정만 보관한다. 챔피언·주제·버전이 바뀌면 조건을 지운다. */
export function updateMemory(previous: Memory | undefined, query: Query, owner: { champion: string; patch: string }): Memory {
  const retain = previous?.champion === owner.champion && previous.patch === owner.patch && previous.schemaVersion === 1;
  const topic = query.topic === "inherit" ? retain ? previous.topic : "unsupported" : query.topic;
  const sameTopic = retain && previous.topic === topic;
  const scenario = sameTopic ? { ...previous.scenario } : emptyScenario();
  const applicable = topic === "inherit" ? [] : fields[topic];
  for (const field of applicable) {
    const value = query.scenario[field];
    if (value !== null) Object.assign(scenario, { [field]: value });
  }
  const asked = query.asked === "inherit" ? sameTopic ? previous.asked : "overview" : query.asked;
  return { schemaVersion: 1, ...owner, topic, asked, scenario };
}
