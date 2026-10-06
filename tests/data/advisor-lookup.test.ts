/**
 * 이름 찾기 회귀 — 챔피언 별명(중국어·한국어)·붙여 쓴 영어·아이템 줄임말·오타 교정의 헛잡음.
 * 브라우저 점검(2026-09-27)에서 드러난 것들. 실제 앱 자료(public/data)로 잰다.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectChampions, nicknames } from "../../src/lib/advisor/intent";
import { buildItemCard } from "../../src/lib/advisor/context";
import { suggestChampions } from "../../src/lib/advisor/championTypo";
import { findGameMeta } from "../../src/lib/advisor/gameMeta";
import { findMentionedRules } from "../../src/lib/knowledge/rules";
import { loadData, type Lang } from "../../scripts/llm/kev-agent/lib";

const champs = (lang: Lang, q: string) => detectChampions(loadData(lang), q).map((c) => c.id);
const eq = (actual: () => unknown, expected: unknown, message: string) => {
  test(message, () => {
    assert.deepEqual(actual(), expected, message);
  });
};

// 챔피언 별명·붙여 쓴 영어
eq(() => champs("zh_CN", "船长q射程多少码？？"), ["Gangplank"], "船长 = 갱플랭크");
eq(() => champs("zh_CN", "破败王者之刃多少钱"), [], "아이템 이름 속 破败王 은 비에고가 아니다");
eq(() => champs("en_US", "imtristanahowdoibeatzed"), ["Tristana", "Zed"], "붙여 쓴 영어, 끝의 세 글자 이름");
eq(() => champs("en_US", "Does Revitalize's tracker count fountain regen?"), [], "긴 낱말 속 짧은 별명(tali)은 이름이 아니다");

// 아이템 줄임말
const itemOf = (lang: Lang, q: string) => (buildItemCard(loadData(lang), q) as { itemId?: string } | undefined)?.itemId;
eq(() => itemOf("en_US", "botrk passive?"), "3153", "botrk = 몰락한 왕의 검");
eq(() => itemOf("ko_KR", "내셔 남작 몇 분에 나와?"), undefined, "내셔 남작(바론)은 내셔의 이빨이 아니다");
eq(() => itemOf("zh_CN", "破败王来反野，我操控的是蝎子"), undefined, "챔피언 별명 속 破败 는 아이템이 아니다");

// 오타 교정의 헛잡음
const suggest = (lang: Lang, q: string) => {
  const d = loadData(lang);
  const gameWord = (t: string) =>
    Boolean(findGameMeta(t) || findMentionedRules(d.ruleIndex, t).length || (t.length >= 3 && d.items.some((i) => i.name?.includes(t))) || buildItemCard(d, t));
  return suggestChampions(q, d.cards, nicknames(d.cards), new Set(), 1, gameWord)?.candidates[0]?.id;
};
for (const q of ["마저템 두 개 사면 마법 저항력이 그냥 합산되는 건가요?", "바위게 언제 나와?"]) {
  eq(() => suggest("ko_KR", q), undefined, `오타가 아니다: ${q}`);
}
eq(() => suggest("en_US", "when should I build Berserker's Greaves?"), undefined, "Greaves 는 Graves 오타가 아니다");
eq(() => suggest("ko_KR", "재이스 Q"), "Jayce", "진짜 오타(세 글자 + 스킬 키)");
eq(() => suggest("en_US", "aatrx keeps landing the whole combo on me"), "Aatrox", "영어 오타(여섯 글자 이상 이름)");

// 한 글자 중국어 이름 — 흔한 합성어 안에서는 이름이 아니다
eq(() => champs("zh_CN", "烬捏着第四枪往前走的时候"), ["Jhin"], "烬 = 진");
eq(() => champs("zh_CN", "彗星天赋怎么点"), [], "彗星(혜성) 안의 彗 는 이름이 아니다");

// 영어 오타 — 넷·다섯 글자 이름은 챔피언 문맥이 있을 때만, 이웃 두 글자 자리 바꿈도 한 글자 차이
eq(() => suggest("en_US", "yasou mid"), "Yasuo", "yasou mid");
eq(() => suggest("en_US", "i set up a trap"), undefined, "set 은 Sett 가 아니다");

// 다른 언어로 쓴 아이템 공식 이름
eq(() => itemOf("zh_CN", "몰락한 왕의 검 被动"), "3153", "중국어 화면의 한국어 아이템 이름");
