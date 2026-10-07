import fs from "node:fs";
import path from "node:path";
import { buildBank, digest, readRows, ROOT } from "../quality/bank";
import { contextFeatures } from "../../../src/lib/advisor/contextRanker";
import { CONTEXT_LIMITS, type ContextFrame } from "../../../src/lib/advisor/contextFrameTypes";
import type { ResolvedQuestion } from "../../../src/lib/advisor/resolvedQuestion";

const directory = "research/llm-evals/workflow/datasets/context-frames";
const cache = path.join(ROOT, "research/.cache/context-frames/20261007/training");
fs.mkdirSync(cache, { recursive: true });
const definitions: Array<[ContextFrame["kind"] | "none", string[], string[]]> = [
  ["spell", ["궁 쿨 다시 볼래", "방금 물었던 기술의 재사용 대기시간", "이 능력은 마나를 얼마나 써", "기술 설명으로 돌아가자", "평타 추가타를 안 쏜다면", "스킬을 취소할 때 결과", "show the ability timer again", "how much mana for that spell", "重新看技能的冷却", "普攻后续攻击取消会怎样"], ["아까 기술의 쿨을 확인하고 싶어", "return to the spell timing", "再说一下技能耗蓝"]],
  ["stat", ["기본 체력 수치 다시 보여", "방어력 표로 돌아갈래", "마법 저항 수치는 어때", "이동 속도 능력치를 봐줘", "11렙 기준으로 다시 볼래", "공격 속도 스탯도 궁금해", "return to the base armor values", "show the champion health stats", "重新查看基础魔抗", "十八级基础生命值呢"], ["기본 방어력을 다시 확인할래", "back to the movement speed stat", "基础属性表再看一次"]],
  ["item", ["그 장비에 붙은 효과 보여", "방금 본 템의 구매 비용", "이 장비는 얼마에 팔아", "아까 아이템의 효과 설명", "그 물건의 능력치를 알려", "what does that item do", "return to the item cost", "再说装备的效果", "刚才装备的金币价格"], ["직전 장비의 설명으로 돌아가자", "back to the equipment effects", "这件装备售价呢"]],
  ["matchup", ["그 상성의 라인전 운영으로 돌아가자", "아까 상대가 진입하면 어떻게 받아쳐", "우리 챔피언으로 교환은 언제 해", "그 상대랑 한타는 어떻게 풀어", "resume the matchup trading plan", "against that opponent in lane", "重新讨论对线怎么打", "这个对局的团战怎么处理"], ["전에 보던 상대법 이어서 설명", "back to our lane matchup", "继续说对局的换血"]],
  ["champion", ["그 챔피언 소개를 다시 보여", "아까 챔피언 전체 스킬을 볼래", "기본 프로필 설명을 이어줘", "다시 챔피언 개요", "return to that champion overview", "show the complete champion kit", "回到英雄介绍", "英雄的全部技能再展示"], ["챔피언 프로필로 돌아갈래", "back to the champion profile", "再展示英雄概况"]],
  ["rule", ["그 게임 규칙의 뜻을 다시 설명", "아까 본 규칙 원리로 돌아가자", "규칙 문서를 이어서 볼래", "이 규칙은 무슨 뜻이야", "return to the gameplay rule", "explain that game rule again", "重新解释游戏规则", "回到那个规则的含义"], ["규칙 설명을 계속 읽고 싶어", "back to the rule definition", "继续解释规则文档"]],
  ["none", ["고마워 도움이 됐어", "오늘은 여기까지 볼게", "내일 또 물어볼게", "좋네 이제 끝내자", "thanks that was helpful", "goodbye for now", "谢谢今天到这里", "我先走了"], ["알겠어 고맙다", "thank you goodbye", "谢谢再见"]],
];
const additions: Partial<Record<ContextFrame["kind"] | "none", string[]>> = {
  spell: ["스킬 쿨타임이 궁금한데", "이 스킬의 쿨타임 수치는", "아까 본 스킬 쿨을 다시 보여", "궁극기 재사용 대기는 얼마", "스킬 마나 소모값은 어때", "스킬 사거리를 다시 확인해줘", "수치를 250으로 바꾸면", "그 값 대신 90을 넣으면?", "이번엔 350짜리로 바꿔볼게", "그럼 42로 다시 계산하면", "that skill cooldown again please", "how long before the ability returns", "那个技能多久能再用", "技能冷却还有几秒"],
  stat: ["6레벨 기준 체력을 보자", "11레벨의 기본 능력치", "레벨 18의 수치로 바꿔줘", "레벨을 6으로 바꾸고 체력을 볼래", "기본 스탯 표를 다시 볼래", "18레벨 기준이면 어때", "체력 스탯은 얼마나 되지", "방어력 수치를 다시 확인", "魔抗属性再查一下", "base stats at level six"],
  item: ["그 아이템의 효과를 자세하게 보여", "이 아이템 가격을 다시 볼래", "아이템의 구매 가격 확인", "장비 효과는 뭐였지", "그 템의 효과를 설명", "equipment price once more", "那个装备多少钱"],
  matchup: ["아까 그 상성 다시 보자", "상대 스킬이 없을 때 교환은", "그 상성에서 상대가 진입하면", "라인전 상대법을 이어서", "다시 상대 W가 없을 때라면", "return to that matchup", "回到之前的对线"],
  champion: ["아까 챔프 소개를 이어서", "챔피언의 프로필이 궁금해", "전체 스킬 구성을 다시 설명", "show that champion profile again"],
  rule: ["아까 규칙 문서로 돌아가서", "이 게임 규칙의 의미는", "그 규칙 적용 원리를 설명", "what does the rule mean"],
};
for (const [kind, train] of definitions) train.push(...additions[kind] ?? []);
const normalize = (text: string) => text.toLowerCase().replace(/\d+(?:\.\d+)?/g, "#").replace(/[^\p{L}#]/gu, "");
const reserved = new Set([...buildBank().flatMap(story => story.turns.map(turn => normalize(turn.q))),
  ...["development", "validation"].flatMap(split => readRows(`${directory}/${split}.jsonl`)
    .flatMap(story => (story.turns as Array<{ q: string }>).map(turn => normalize(turn.q))))]);
const kinds: ContextFrame["kind"][] = ["spell", "stat", "item", "matchup", "champion", "rule"];
function frame(kind: ContextFrame["kind"], index: number): ContextFrame {
  const champion = index % 2 ? "Lux" : "Garen";
  const state: ContextFrame["state"] = { active: kind, conditions: [] };
  if (kind === "spell") state.spell = { champion, slot: "Q", focus: "cooldown" };
  if (kind === "stat") state.stat = { kind: "championStat", champions: [champion], field: "health", level: 11 };
  if (kind === "item") state.item = index % 2 ? "1001" : "1055";
  if (kind === "matchup") state.matchup = { mine: champion, enemy: "Fiora" };
  if (kind === "champion") state.champion = champion;
  if (kind === "rule") state.rule = { id: `rule-${index}`, title: "game rule" };
  return { key: `${kind}:${index}`, patch: "26.19", kind, state, turn: index * 2 + 1 };
}
for (const split of ["train", "dev"] as const) {
  const sessions: unknown[] = [], encoded: unknown[] = [];
  for (const [kind, train, dev] of definitions) for (const [template, question] of (split === "train" ? train : dev).entries()) {
    if (reserved.has(normalize(question))) continue;
    for (let config = 0; config < 36; config++) {
      const count = CONTEXT_LIMITS[config % CONTEXT_LIMITS.length];
      const frames = Array.from({ length: count }, (_, index) => frame(kinds[(config + index) % kinds.length], index));
      if (config % 3 === 0 && kind !== "none") frames[0] = frame(kind, 0);
      if (config % 4 === 0 && kind !== "none") frames[1] = frame(kind, 1);
      const latest = frames[frames.length - 1];
      const matches = frames.filter(entry => entry.kind === kind);
      const expected = latest.kind === kind ? [latest.key] : matches.map(entry => entry.key);
      const id = `${split}:${kind}:${template}:${config}`;
      sessions.push({ id, split, kind, question, template: `${split}:${kind}:${template}`, frames, expected });
      const input: ResolvedQuestion = { text: question, champions: [], mentions: [], spellFocus: undefined };
      frames.forEach((entry, index) => encoded.push({ id, key: entry.key, latest: latest.key, expected,
        features: contextFeatures(input, entry, index, frames), y: Number(expected.includes(entry.key)) }));
    }
  }
  fs.writeFileSync(path.join(ROOT, directory, `selector-${split}.jsonl`), sessions.map(row => JSON.stringify(row)).join("\n") + "\n");
  fs.writeFileSync(path.join(cache, `${split}.jsonl`), encoded.map(row => JSON.stringify(row)).join("\n") + "\n");
  console.log(JSON.stringify({ split, sessions: sessions.length, pairs: encoded.length, hash: digest(sessions) }));
}
