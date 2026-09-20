/**
 * 근거 검사 시험
 *
 * 모델이 쓴 해설에서 **틀렸다고 증명되는 문장만** 걷어내는지 본다. 멀쩡한 문장을
 * 지우면 해설이 토막 나므로, 지나치게 지우지 않는 것도 같은 무게로 확인한다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { groundCommentary } from "../src/lib/advisor/grounding";
import type { AdvisorAnswer } from "../src/lib/advisor/answer";
import { buildLitePrompt, tidyLite } from "../src/lib/advisor/litePrompt";
import {
  ADVISOR_MODEL,
  FALLBACK_MODEL,
  autoModel,
  canOfferModel,
  modelChoiceKey,
  type AdvisorModel,
} from "../src/lib/advisor/config";

const llmDir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;

const card = (id: string): ChampionCard => {
  const found = cards.find((c) => c.id === id);
  assert.ok(found, `${id} 카드`);
  return found;
};

const malphite = card("Malphite");
const answer: AdvisorAnswer = {
  kind: "champion",
  card: malphite,
  notes: {
    playing: ["화강암 방패가 살아 있을 때 딜 교환을 시작합니다."],
    against: [],
    perspective: "both",
  },
};

/** 카드가 실제로 가진 짝인지 먼저 확인한다. 시험이 자료를 앞질러 낡으면 안 된다. */
const ult = malphite.spells.find((s) => s.slot === "R");
assert.ok(ult, "말파이트 R");
assert.ok(ult.effects.includes("에어본"), "R 에 에어본이 있어야 이 시험이 성립한다");
const q = malphite.spells.find((s) => s.slot === "Q");
assert.ok(q && !q.effects.includes("에어본"), "Q 에는 에어본이 없어야 한다");

{
  // 짝이 틀린 문장은 걷어낸다. 에어본은 R 것이지 Q 것이 아니다.
  const text = `${q.name}으로 에어본을 겁니다. 한타에서는 진입 순서를 먼저 정합니다.`;
  const result = groundCommentary(text, answer);
  assert.equal(result.dropped.length, 1, "틀린 짝 한 문장");
  assert.equal(result.dropped[0].verdict, "card-wrong");
  assert.match(result.text, /진입 순서/, "멀쩡한 문장은 남는다");
  assert.doesNotMatch(result.text, /에어본/, "틀린 문장은 사라진다");
}

{
  // 맞는 짝은 남긴다.
  const text = `${ult.name}으로 에어본을 걸어 한타를 엽니다.`;
  const result = groundCommentary(text, answer);
  assert.equal(result.dropped.length, 0, "맞는 짝은 지우지 않는다");
}

{
  // 숫자는 해설에 쓰지 말라고 일러 두었다. 새어 나오면 대조할 방법이 없다.
  const result = groundCommentary("궁극기 쿨타임은 130초입니다.", answer);
  assert.equal(result.dropped[0]?.verdict, "number");
}

{
  // 근거 없는 이음말은 기본값에서 남긴다. 다 지우면 해설이 토막 난다.
  const text = "한타에서는 진입 타이밍이 가장 중요합니다.";
  assert.equal(groundCommentary(text, answer).dropped.length, 0, "기본값은 관대하다");
  assert.equal(groundCommentary(text, answer, { strict: true }).dropped.length, 1, "strict 는 지운다");
}

{
  // 노트에서 온 문장은 정의상 옳다. strict 에서도 남아야 한다.
  const text = "화강암 방패가 살아 있을 때 딜 교환을 시작합니다.";
  assert.equal(groundCommentary(text, answer, { strict: true }).dropped.length, 0, "노트 문장은 남는다");
}

{
  // 스트리밍 중이다. 끝나지 않은 꼬리는 아직 판단하지 않는다.
  const result = groundCommentary(`${q.name}으로 에어본을`, answer);
  assert.equal(result.dropped.length, 0, "덜 쓴 문장은 건드리지 않는다");
}

{
  // 대조할 자료가 없는 답(스킬 하나·아이템·규칙)은 손대지 않는다.
  const text = "아무 말이나 130 썼습니다.";
  assert.equal(groundCommentary(text, undefined).text, text, "카드가 없으면 그대로 둔다");
}

{
  // 굵은 소제목은 사실을 주장하지 않는다.
  const result = groundCommentary("**플레이할 때**", answer, { strict: true });
  assert.equal(result.dropped.length, 0, "소제목은 대조 대상이 아니다");
}

{
  // 소수점은 문장 끝이 아니다. 쿨타임 "8/7.5/7" 을 문장 경계로 읽어 토막 내던 버그다.
  const text = `${ult.name} 재사용 대기시간은 130/115/100초입니다. 뒤 문장입니다.`;
  const result = groundCommentary(text, answer);
  assert.equal(result.dropped.length, 1, "숫자 문장 하나만 걸린다");
  assert.equal(result.text, "뒤 문장입니다.", "나머지는 온전히 남는다");
}

{
  // 소수점이 든 문장이 남아야 할 때도 토막 나면 안 된다.
  const kept = groundCommentary("쿨은 8/7.5/7초입니다.", answer);
  assert.equal(kept.dropped.length, 1, "숫자 규칙에 걸린다");
  assert.equal(kept.text, "", "쪼개진 토막이 남지 않는다");
}

/**
 * 모델을 권할 기기인지 가리는 관문.
 *
 * f16 을 모델과 무관하게 따지면 Pascal 같은 카드가 16비트를 안 쓰는 판본까지 못 쓴다.
 * 반대로 아예 안 따지면 q4f16 을 못 도는 기기에 3GB 를 받게 한다.
 */
{
  const needs: AdvisorModel = { id: "a", dtype: "q4f16", downloadMb: 1, needsF16: true };
  const free: AdvisorModel = { id: "b", dtype: "q4", downloadMb: 1, needsF16: false };
  const withF16 = { supported: true, f16: true };
  const noF16 = { supported: true, f16: false };
  const noGpu = { supported: false, f16: false };

  assert.equal(canOfferModel(needs, withF16, "desktop"), true, "f16 있으면 q4f16 을 권한다");
  assert.equal(canOfferModel(needs, noF16, "desktop"), false, "f16 없으면 q4f16 을 권하지 않는다");
  assert.equal(canOfferModel(free, noF16, "desktop"), true, "16비트를 안 쓰면 f16 없이도 권한다");
  assert.equal(canOfferModel(free, noGpu, "desktop"), false, "WebGPU 자체가 없으면 권하지 않는다");
  assert.equal(canOfferModel(free, null, "desktop"), false, "어댑터를 확인하기 전에는 권하지 않는다");
  assert.equal(canOfferModel(free, withF16, "mobile"), false, "휴대폰에는 권하지 않는다");
}

/**
 * 고르지 않았을 때 무엇을 줄 것인가.
 *
 * 16비트 셰이더가 없는 기기에 기본 모델을 주면 내려받기부터 막힌다. GTX 10xx 에서
 * 후보를 전부 눌러 본 끝에 남은 것이 대체본이라, 그 기기에는 그것을 준다.
 */
{
  assert.equal(autoModel({ supported: true, f16: true }).id, ADVISOR_MODEL.id, "f16 이 있으면 기본 모델");
  assert.equal(autoModel({ supported: true, f16: false }).id, FALLBACK_MODEL.id, "f16 이 없으면 대체본");
  assert.equal(autoModel(null).id, ADVISOR_MODEL.id, "확인 전에는 기본 모델");
  assert.equal(autoModel({ supported: false, f16: false }).id, ADVISOR_MODEL.id, "WebGPU 가 없으면 어차피 안 권한다");

  assert.equal(FALLBACK_MODEL.needsF16, false, "대체본이 16비트를 요구하면 뜻이 없다");
  assert.equal(FALLBACK_MODEL.lite, true, "대체본은 간이로 표시해야 화면이 그렇게 알린다");
  assert.equal(ADVISOR_MODEL.lite, undefined, "기본 모델은 간이가 아니다");

  // 화면이 고른 줄을 표시하려면 목록에서 찾을 수 있어야 한다.
  assert.equal(modelChoiceKey(ADVISOR_MODEL), "default");
  assert.equal(modelChoiceKey(FALLBACK_MODEL), "lite");
}

/**
 * 간이 모델 경로.
 *
 * 1B 에게는 해설을 쓰게 하지 않고 검증된 노트를 줄이게 한다. Gemma 3 1B 로 재 보니
 * 현행 프롬프트는 쓴 글의 78% 가 근거 검사에 걸려 사라지고 12문항 중 4개가 한 줄도
 * 안 남았는데, 이 경로는 87% 가 남고 빈 답이 1개였다.
 */
{
  const prompt = buildLitePrompt(answer, "ko_KR");
  assert.ok(prompt, "노트가 있으면 시킬 일이 있다");
  assert.match(prompt, /화강암 방패가 살아 있을 때/, "노트가 재료로 들어간다");
  assert.doesNotMatch(prompt, /말파이트 상대법/, "질문은 사용자 발화로 따로 간다");

  // 줄일 노트가 없으면 아예 말을 시키지 않는다. 빈손으로 시키면 지어낸다.
  assert.equal(buildLitePrompt({ kind: "champion", card: malphite }, "ko_KR"), undefined, "노트가 없으면 시키지 않는다");
  assert.equal(buildLitePrompt({ kind: "text", text: "아무 말" }, "ko_KR"), undefined, "챔피언 답이 아니면 시키지 않는다");

  /*
    사실 하나를 묻는 답에는 붙이지 않는다. 실제로 "오공 스킬 쿨타임" 에
    "오공 스킬 쿨타임은 1.5초입니다" 라고 썼다. 카드와 대화 앞머리에 정확한 값이
    있는데 그 아래에서 딴소리를 한 셈이다.
  */
  assert.equal(
    buildLitePrompt({ ...answer, focus: "cooldown" } as AdvisorAnswer, "ko_KR"),
    undefined,
    "사실 조회에는 해설을 붙이지 않는다",
  );
}

{
  // 1B 는 "번호 없이" 를 안 지킨다. 코드로 지운다.
  assert.equal(
    tidyLite("1. R은 군중 제어로 끊을 수 없습니다. 2. 방패가 깨진 뒤에 붙습니다."),
    "R은 군중 제어로 끊을 수 없습니다. 방패가 깨진 뒤에 붙습니다.",
  );
  assert.equal(tidyLite("- 방패가 차 있을 때 시작합니다. - 깨지면 물러납니다."), "방패가 차 있을 때 시작합니다. 깨지면 물러납니다.");

  // 거의 같은 문장을 두 번 쓴다. 어절이 많이 겹치면 같은 말로 본다.
  const dup = tidyLite("야스오가 직선상에서 벗어나는 습관을 들입니다. 야스오가 다가올 때 직선상에서 벗어나는 습관을 들입니다.");
  assert.equal(dup, "야스오가 직선상에서 벗어나는 습관을 들입니다.", "거의 같은 말은 한 번만");

  // 서로 다른 문장은 남긴다. 너무 세게 지우면 답이 한 줄로 줄어든다.
  const two = tidyLite("R은 군중 제어로 끊을 수 없습니다. 평타 챔피언은 E 공격 속도 감소가 아픕니다.");
  assert.ok(two.includes("군중 제어") && two.includes("공격 속도"), "다른 말은 둘 다 남는다");

  // 두 문장까지다. 카드에 노트 전문이 이미 있다.
  const three = tidyLite("R은 끊을 수 없습니다. 방패가 깨진 뒤에 붙습니다. 라인은 밀어 두고 움직입니다.");
  assert.equal(three.split(". ").length, 2, "두 문장 상한");

  // 작은 모델이 조사를 따로 띄운다. "R 은 저지 불가" 가 실제로 나왔다.
  assert.equal(tidyLite("R 은 저지 불가 돌진이라 끊을 수 없습니다."), "R은 저지 불가 돌진이라 끊을 수 없습니다.");
  assert.equal(tidyLite("상대가 겹치면 E 로 붙어 오공 이 들어갑니다."), "상대가 겹치면 E로 붙어 오공이 들어갑니다.");
  // 관형사로 쓰인 "이" 는 건드리지 않는다. 앞이 낱말이 아니다.
  assert.equal(tidyLite("이 스킬은 저지 불가라 끊을 수 없습니다."), "이 스킬은 저지 불가라 끊을 수 없습니다.");
}

console.log("✅ 근거 검사 통과 (39건)");
