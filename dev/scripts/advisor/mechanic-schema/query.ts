/** 챔피언별 정답 분기 없이, 공통 질문 단서에서 v1 요청을 만든다. 실험용이며 전체 자연어 해석기는 아니다. */
import { emptyScenario, type Memory, type Query } from "./types";
import { QUERY_SCHEMA } from "./schema";

export function cueQuery(question: string, previous?: Memory): Query {
  const q = question.replace(/\s/g, "").toLowerCase();
  const scenario = emptyScenario();
  let topic: Query["topic"] = "inherit";
  let asked: Query["asked"] = "inherit";
  const shield = /보호막|쉴드|실드|shield/.test(q);
  const speed = /이속|이동속도|빨라|movespeed/.test(q);
  const health = /체력|health|hp/.test(q);
  const attack = /평타|공격|두번째|두발|둘다|attack|shot/.test(q);
  if (/회복|숨으면|안보이면|보이는데|보이는동안|heal/.test(q)) topic = "recovery";
  else if (health && /템|아이템|추가체력|전환|바뀌|치환|공격력|800|healthitem/.test(q)) topic = "conversion";
  else if (shield || /세대|세번|3대|3번|세번째/.test(q)) topic = "stack_proc";
  else if (attack || speed) topic = "basic_attack";
  else if (health && previous?.topic === "conversion") topic = "conversion";
  if (/기절|stun/.test(q)) asked = "stun";
  else if (shield) asked = "shield";
  else if (speed) asked = "movement_speed";
  else if (/800|계수|비율|ratio/.test(q)) asked = "coefficient";
  else if (/둘다|둘다늘|both/.test(q) && health) asked = "both_stats";
  else if (health) asked = "converted_attack_damage";
  else if (/피해|대미지|데미지|damage/.test(q)) asked = "damage";
  else if (topic !== "inherit") asked = "overview";
  if (/기본체력|basehealth/.test(q)) scenario.healthKind = "base";
  else if (/성장체력|레벨.*체력/.test(q)) scenario.healthKind = "growth";
  else if (health && topic === "conversion") scenario.healthKind = "bonus";
  const amount = /(?:체력|health|hp)([0-9]+(?:\.[0-9]+)?)|([0-9]+(?:\.[0-9]+)?)(?:짜리)?(?:체력|health|hp)/.exec(q);
  if (amount) scenario.healthAmount = Number(amount[1] ?? amount[2]);
  else if (previous?.topic === "conversion") {
    const correction = /(?:아니|그럼|그러면)?([0-9]+(?:\.[0-9]+)?)(?:짜리|이면)/.exec(q);
    if (correction) scenario.healthAmount = Number(correction[1]);
  }
  if (/두번째.*(?:다치|까지|치면|쏘|발사)|두대다|두발다|둘다(?:치|쏘)|취소(?:안|하지않)|안취소/.test(q)) scenario.followup = "fired";
  else if (/취소|한대만.*(?:걸|이동)|한대.*걸/.test(q)) scenario.followup = "cancelled";
  if (/미니언|minion/.test(q)) scenario.target = "minion";
  else if (/챔피언|champion/.test(q)) scenario.target = "champion";
  const hits = /(?:평타)?([0-9]+)(?:대|번)|(?:(한|두|세|네)(?:대|번))/.exec(q);
  if (hits) scenario.hits = hits[1] ? Number(hits[1]) : ({ 한: 1, 두: 2, 세: 3, 네: 4 } as Record<string, number>)[hits[2]];
  if (/보호막.*(?:쿨|재사용).*(?:남|아직|안돌)|쉴드쿨남/.test(q)) scenario.shieldReady = false;
  else if (/보호막.*(?:쿨|재사용).*(?:돌아|끝)|쉴드쿨돌/.test(q)) scenario.shieldReady = true;
  if (/안보|숨으면|안보이면/.test(q)) scenario.visibleToEnemies = false;
  else if (/보이는데|보이는동안/.test(q)) scenario.visibleToEnemies = true;
  if (topic === "inherit" && !/그럼|아니|그러면|짜리|챔피언|미니언|한대|두번째/.test(q)) topic = "unsupported";
  return { topic, asked, scenario };
}

export const QUERY_SYSTEM = `질문을 고정 JSON 필드로 추출한다. 답변이나 게임 규칙을 생성하지 않는다.
topic: conversion=체력의 능력치 전환, basic_attack=평타/후속 공격/취소/이속, stack_proc=중첩 적중/보호막, recovery=피해 회복, unsupported=관련 없음, inherit=직전 주제 유지.
asked는 이번 질문의 관심 효과. 생략되면 inherit. scenario는 이번 질문에 명시된 값만 쓰고 나머지는 null.
healthAmount는 체력 양. 800% 같은 계수는 체력 양이 아니다. healthKind는 bonus=추가/아이템 체력, base=기본 체력, growth=레벨 성장 체력.
followup은 cancelled=두 번째 공격 취소, fired=두 번째 공격까지 발사. 첫 평타만 언급되면 null이며 취소했다고 추측하지 않는다.
hits는 같은 대상에게 적중한 횟수. target은 champion 또는 minion. shieldReady는 보호막 쿨이 준비되었는지. visibleToEnemies는 적에게 보이는지.
이전 상태는 문맥 파악용. 그 값들을 scenario에 복사하지 않는다. 현재 질문에 없는 값은 null.
JSON Schema: ${JSON.stringify(QUERY_SCHEMA)}`;

export function queryPrompt(question: string, previous?: Memory): string {
  return `Previous state: ${JSON.stringify(previous ?? null)}\nCurrent question: ${question}`;
}
