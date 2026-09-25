/**
 * 게임 규칙·메타 답 시험 — 세 언어 낱말로 사실을 찾고, 챔피언 가격을 답한다(`gameMeta.ts`)
 */
import assert from "node:assert/strict";
import { asksPrice, championPriceAnswer, findGameMeta, gameMetaAnswer } from "../src/lib/advisor/gameMeta";

let checks = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assert.deepEqual(actual, expected, message);
  checks += 1;
};

for (const [q, id] of [
  ["항복 몇 분부터 돼?", "surrender"], ["what minute can we ff?", "surrender"], ["几分钟能投降啊", "surrender"],
  ["팀원 한 명 안 들어옴 다시하기 투표 어떻게 해", "remake"], ["can we remake if someone never connected", "remake"], ["队友开局一直没连进来，重开的条件是什么？", "remake"],
  ["첫 드래곤 언제 나와", "dragon"], ["when does the first dragon spawn", "dragon"], ["第一条龙几分钟刷", "dragon"],
  ["장로 드래곤 언제 나와?", "elder"], ["바론 몇 분에 나와", "baron"], ["大龙buff人死了就没了吗", "baron"],
  ["공허 유충 몇 분에 나와?", "voidgrubs"], ["협곡의 전령 몇 분에 나와?", "herald"], ["아타칸 언제 나와?", "atakhan"],
  ["포탑 방패 몇 분에 없어져?", "plating"], ["When does turret plating fall off?", "plating"],
  ["억제기 몇 분에 다시 살아나?", "inhibitor"], ["미니언 웨이브 몇 초마다 와?", "minion-waves"],
  ["킬 골드 얼마야?", "kill-gold"], ["How much gold is a kill?", "kill-gold"],
  ["랭겜 닷지하면 LP 얼마나 까여?", "dodge"], ["is there a penalty for dodging ranked?", "dodge"],
  ["듀오 티어 제한이 어떻게 되나요?", "duo"],
  ["cs가 뭐야?", "cs"], ["바위게 몇 분에 나와?", "scuttle"], ["When does scuttle spawn?", "scuttle"], ["블루 버프 리젠 몇 분이야?", "buffs"],
  ["lethality vs armor pen whats the difference", "lethality"], ["팀원 채팅 음소거 어떻게 해?", "mute"], ["how do i mute one teammate's pings", "mute"],
  ["죽으면 몇 초 뒤에 부활해?", "death-timer"], ["Do jungle monsters count toward the CS number?", "cs"],
] as const) eq(findGameMeta(q)?.id, id, `사실: ${q}`);

// 게임 규칙이 아닌 말에는 걸리지 않는다("ff" 가 "effect" 에, "dc" 가 낱말 속에 걸리지 않게)
for (const q of ["What does Conqueror's effect do?", "점멸 쿨 몇 초야", "정복자에 점화 들어가?", "가렌으로 다리우스 라인전 어떻게 해?", "how do I play Draven"]) {
  eq(findGameMeta(q), undefined, `사실 없음: ${q}`);
}

eq(asksPrice("아리 가격 얼마야?"), true, "가격 낱말");
eq(asksPrice("아리 콤보 알려줘"), false, "가격 낱말 없음");
const ahri = championPriceAnswer("아리 가격 얼마야?", { id: "Ahri", name: "아리" }, "ko_KR") ?? "";
assert.match(ahri, /^아리의 상점 가격은 블루 정수 [\d,]+ 또는 [\d,]+ RP입니다\./);
checks += 1;
assert.match(championPriceAnswer("how much is Mel?", { id: "Mel", name: "Mel" }, "en_US") ?? "", /Mel costs 3,150 Blue Essence or 975 RP/);
checks += 1;
eq(championPriceAnswer("아리 콤보 알려줘", { id: "Ahri", name: "아리" }, "ko_KR"), undefined, "가격을 묻지 않으면 답하지 않는다");
assert.match(gameMetaAnswer("챔피언 가격 얼마야?", "ko_KR") ?? "", /225 · 675 · 1,575 · 2,400 · 3,150/);
checks += 1;
assert.match(gameMetaAnswer("几分钟能投降啊", "zh_CN") ?? "", /15 分钟起可以发起投降/);
checks += 1;

console.log(`✅ 게임 규칙·메타 통과 (${checks}건)`);
