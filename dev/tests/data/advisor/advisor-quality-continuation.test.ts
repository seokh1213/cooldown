import assert from "node:assert/strict";
import { after, test } from "node:test";
import { qualityContext, evaluationDeps, localFetch, restoreReply } from "../../../scripts/advisor/quality/dialogue";
import { answerDialogue } from "../../../../src/features/advisor/conversation/dialogueFlow";
import { current } from "../../../scripts/advisor/vector-search/corpus";

after(localFetch());

test("패시브·스킬 이름의 정령과 단검을 아이템 이름으로 바꾸지 않는다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps(undefined, "ko_KR");
  const aurora = await answerDialogue("오로라 패시브 정령은 미니언 때려도 나오나?", ctx, deps);
  assert.match(aurora.reply.text, /미니언.*챔피언.*조건에 해당하지 않습니다/);
  assert.notEqual(aurora.reply.answer?.kind, "item");
  const katarina = await answerDialogue("카타 단검 떨어진 자리 피해도 계속 죽네 상대할 때 내가 놓치는 게 뭘까?", ctx, deps);
  assert.equal(katarina.reply.answer?.kind, "champion");
  assert.match(katarina.reply.text, /단검/);
});

test("강인함 수치 아이템 조회 뒤에도 특정 스킬에 대한 수은 후속 질문을 보존한다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps(undefined, "ko_KR");
  const item = await answerDialogue("헤신 강인함 얼마 줘?", ctx, deps);
  assert.equal(item.reply.answer?.kind, "item");
  if (item.reply.answer?.kind === "item") assert.equal(item.reply.answer.itemId, "3111");
  const first = "말자하 R 정화로 풀려?";
  const suppression = await answerDialogue(first, ctx, deps);
  restoreReply(ctx, first, suppression.reply);
  const qss = await answerDialogue("그럼 수은은?", ctx, deps);
  assert.match(qss.reply.text, /제압.*수은|수은.*제압/s);
  assert.notEqual(qss.reply.answer?.kind, "item");
});

test("능력치 전환의 금액 정정과 재사용 대기 중인 보호막의 별도 피해 발동을 구분한다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps(undefined, "ko_KR");
  const question = "파이크는 추가체력 140 받으면?";
  const pyke = await answerDialogue(question, ctx, deps);
  assert.match(pyke.reply.text, /추가 공격력 10/);
  restoreReply(ctx, question, pyke.reply);
  const corrected = await answerDialogue("아니 280짜리면?", ctx, deps);
  assert.match(corrected.reply.text, /추가 공격력 20/);
  const akshan = await answerDialogue("아크샨 쉴드 쿨 남아 있는데 챔피언 세대 때리면?", ctx, deps);
  assert.match(akshan.reply.text, /추가 마법 피해/);
  assert.match(akshan.reply.text, /보호막.*사용 가능 조건에 해당하지 않습니다/);
});

test("이름 없는 룬 효과에는 기본 툴팁을 쓰고 상점 판매 질문은 룬으로 답하지 않는다", () => {
  assert.equal(current("ko_KR", "첫 평 세 대 공속 확 올려주는 룬").id, "rule:칼날비");
  assert.equal(current("en_US", "the rune that mails you cookies").id, "rule:비스킷 배달");
  assert.equal(current("zh_CN", "拿到护盾后下一下普攻有额外伤害的那个符文，有好几个盾的时候按哪个算？").id, "rule:보호막 강타");
  assert.equal(current("en_US", "How much gold do you get back when you sell an item?").id, null);
  assert.equal(current("ko_KR", "체력 물약 한 개 몇 골드야?").id, null);
});

test("아이템을 잠깐 조회한 뒤 패시브로 돌아오면 원천·대상 조건을 복원한다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps(undefined, "ko_KR");
  for (const question of ["아크샨 평타 한대 치면?", "도란의 검 가격은?"]) {
    const { reply } = await answerDialogue(question, ctx, deps);
    restoreReply(ctx, question, reply);
  }
  const returned = await answerDialogue("평타 한대 치면 어떻게 돼?", ctx, deps);
  assert.match(returned.reply.text, /추가 공격.*취소[\s\S]*이동 속도/);
  assert.equal(returned.reply.memory.mechanic?.abilityId, "Akshan.P");
  const converted = await answerDialogue("파이크 체력템 살 때 800%로 공격력 전환되는 거야?", ctx, deps);
  assert.match(converted.reply.text, /비축 상한.*800%/);
  assert.match(converted.reply.text, /추가 체력 14당 추가 공격력 1/);
});

test("챔피언 별명의 룬 어휘와 아이템의 패시브를 구분한다", async () => {
  const zh = qualityContext("zh_CN", "none"), en = qualityContext("en_US", "none");
  const teemo = await answerDialogue("迅捷斥候R的法强加成是多少?", zh, evaluationDeps(undefined, "zh_CN"));
  assert.equal(teemo.reply.answer?.kind, "spell");
  assert.doesNotMatch(teemo.reply.text, /迅捷自身/);
  const item = await answerDialogue("I'm on Jinx and have enough gold for Infinity Edge, what does its passive actually do?", en, evaluationDeps(undefined, "en_US"));
  assert.equal(item.reply.answer?.kind, "item");
  if (item.reply.answer?.kind === "item") assert.equal(item.reply.answer.itemId, "3031");
});

test("아이템 별칭의 글자가 챔피언 별명과 겹쳐도 실제 아이템을 조회한다", async () => {
  for (const [lang, question, id] of [["en_US", "tf spellblade", "3078"], ["zh_CN", "卢登回声触发条件", "6655"]] as const) {
    const { reply } = await answerDialogue(question, qualityContext(lang, "none"), evaluationDeps(undefined, lang));
    assert.equal(reply.answer?.kind, "item");
    if (reply.answer?.kind === "item") assert.equal(reply.answer.itemId, id);
  }
});

test("중국어의 붙여 쓴 아이템 능력치도 이름과 수치가 있는 카드로 제공한다", async () => {
  const { reply } = await answerDialogue("无尽之刃属性", qualityContext("zh_CN", "none"), evaluationDeps(undefined, "zh_CN"));
  assert.equal(reply.answer?.kind, "item");
  if (reply.answer?.kind === "item") assert.ok(reply.answer.stats.some(stat => stat.label.includes("攻击力") && /\d/.test(stat.value)));
  assert.match(reply.text, /攻击力/);
});

test("진입·거리 조언은 CC 유무와 단일 스킬 툴팁으로 축소하지 않는다", async () => {
  for (const question of ["아리 매혹 피하고 나면 바로 들어가도 돼?", "쓰레쉬 그랩 안 맞으려고 미니언 뒤에 있는데 거리 어떻게 잡아야 해?"]) {
    const { reply } = await answerDialogue(question, qualityContext("ko_KR", "none"), evaluationDeps(undefined, "ko_KR"));
    assert.equal(reply.answer?.kind, "champion");
    if (reply.answer?.kind === "champion") assert.ok(reply.answer.notes);
    assert.doesNotMatch(reply.text, /\[미니언 행동\]|P .*CC 없음/);
  }
});

test("표식 발동의 쿨타임 조건과 일반 쿨타임 수치를 구분한다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps(undefined, "ko_KR");
  const question = "블리츠크랭크 R은 언제 평타에 표식이 붙어?";
  const first = await answerDialogue(question, ctx, deps);
  restoreReply(ctx, question, first.reply);
  const during = await answerDialogue("그럼 R 쿨타임 중에는?", ctx, deps);
  assert.match(during.reply.text, /재사용 대기시간 중.*사용 가능 조건에 해당하지 않습니다/);
  restoreReply(ctx, "그럼 R 쿨타임 중에는?", during.reply);
  const ready = await answerDialogue("그럼 쿨 다 돌았으면?", ctx, deps);
  assert.match(ready.reply.text, /표식을 남깁니다/);
  assert.doesNotMatch(ready.reply.text, /조건에 해당하지 않습니다/);
});

test("다중 패시브 비교는 검수된 전환 범위와 추가 공격 조건을 함께 제공한다", async () => {
  const { reply } = await answerDialogue("파이크랑 아크샨 패시브 각각 설명해줘", qualityContext("ko_KR", "none"), evaluationDeps(undefined, "ko_KR"));
  assert.equal(reply.answer?.kind, "compare");
  assert.match(reply.text, /추가 체력 14당 추가 공격력 1/);
  assert.match(reply.text, /추가 공격.*취소|두 번째/);
  assert.doesNotMatch(reply.text, /최대 체력을 모두 공격력으로 전환/);
});

test("삭제된 소환사 주문은 과거 효과와 제거 버전을 함께 보여준다", async () => {
  const { reply } = await answerDialogue("진급 스펠은 어떤 효과였어?", qualityContext("ko_KR", "none"), evaluationDeps(undefined, "ko_KR"));
  assert.match(reply.text, /제거|삭제/);
  assert.match(reply.text, /1\.0\.0\.152/);
  assert.match(reply.text, /미니언/);
  assert.equal(current("en_US", "How are items sorted into shop role tabs?").id, "mech:item-shop-classification");
});

test("피하는 질문은 스킬 설명보다 실제 회피 원문을 우선한다", async () => {
  for (const [question, pattern] of [
    ["럭스로 블리츠크랭크 Q 어떻게 피해?", /미니언.*뒤/],
    ["아리로 럭스 Q 어떻게 피해?", /일직선.*옆으로/],
    ["다리우스로 럼블 E 전기 작살 어떻게 피해?", /첫 발.*두 번째/],
  ] as const) {
    const { reply } = await answerDialogue(question, qualityContext("ko_KR", "none"), evaluationDeps());
    assert.match(reply.text, pattern);
  }
});

test("상대 Q가 돌아오거나 내 챔피언이 바뀌면 그랩을 피하는 근거를 다시 선택한다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps();
  for (const q of ["케이틀린으로 블리츠크랭크 Q 어떻게 피해?", "상대 Q가 빠졌으면 어떻게 교환해?"]) {
    restoreReply(ctx, q, (await answerDialogue(q, ctx, deps)).reply);
  }
  const { reply } = await answerDialogue("내 챔피언은 럭스로 바꿨어. 상대 Q는 있고 내 E는 없어. 어떻게 피해?", ctx, deps);
  assert.match(reply.text, /미니언.*뒤/);
  assert.equal(reply.memory.matchup?.mine, "Lux");
  assert.equal(reply.memory.matchup?.enemy, "Blitzcrank");
  assert.ok(reply.memory.conditions.some(c => c.owner === "mine" && c.slot === "E" && c.status === "down"));
});

test("인섹 별칭으로 주제를 바꾼 뒤 일반 팁도 리 신 운용을 이어간다", async () => {
  const ctx = qualityContext("zh_CN", "none"), deps = evaluationDeps(undefined, "zh_CN");
  for (const q of ["我韦鲁斯打薇恩怎么拉扯", "回旋踢怎么操作"]) {
    const { reply } = await answerDialogue(q, ctx, deps);
    if (q.includes("回旋踢")) {
      assert.equal(reply.answer?.kind, "champion");
      if (reply.answer?.kind === "champion") assert.equal(reply.answer.card.id, "LeeSin");
      assert.match(reply.text, /队友/);
    }
    restoreReply(ctx, q, reply);
  }
  const { reply } = await answerDialogue("有什么技巧", ctx, deps);
  assert.equal(reply.answer?.kind, "champion");
  if (reply.answer?.kind === "champion") assert.equal(reply.answer.card.id, "LeeSin");
  assert.doesNotMatch(reply.text, /薇恩|账号和支付/);
});

test("未指定具体装备时不会捏造光环叠加规则或队伍重伤购买者", async () => {
  for (const [q, pattern] of [
    ["装备光环能叠加吗", /具体装备名称/],
    ["布隆和木木都在我们队，对面回血多，重伤装备应该谁出？", /还不能确认.*重伤装备.*触发条件/],
  ] as const) {
    const { reply } = await answerDialogue(q, qualityContext("zh_CN", "none"), evaluationDeps(undefined, "zh_CN"));
    assert.match(reply.text, pattern);
  }
});

test("콤보의 점멸 부재를 저장한 뒤 궁 복귀와 궁 쿨타임 조회를 구분한다", async () => {
  const ctx = qualityContext("ko_KR", "none"), deps = evaluationDeps();
  for (const q of ["오공 콤보 알려줘", "궁 없는데 콤보 있어?", "점멸도 없는데?", "궁 돌아왔어"]) {
    const { reply } = await answerDialogue(q, ctx, deps);
    assert.equal(reply.answer?.kind, "champion");
    assert.match(reply.text, /오공 콤보는 상황별로/);
    if (q === "궁 돌아왔어") {
      assert.match(reply.text, /한타 진입/);
      assert.deepEqual(reply.memory.combo?.unavailable, ["점멸"]);
    }
    restoreReply(ctx, q, reply);
  }
  const { reply } = await answerDialogue("궁 쿨타임 몇 초야?", ctx, deps);
  assert.match(reply.text, /130\/110\/90/);
  assert.equal(reply.answer?.kind, "spell");
});
