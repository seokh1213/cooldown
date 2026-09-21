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
import {
  ADVISOR_MODEL,
  FALLBACK_MODEL,
  autoModel,
  canOfferModel,
  MODEL_CHOICES,
  modelBlocked,
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
  // 근거 없는 이음말은 남긴다. 다 지우면 해설이 토막 난다.
  const text = "한타에서는 진입 타이밍이 가장 중요합니다.";
  assert.equal(groundCommentary(text, answer).dropped.length, 0, "근거가 없다고 지우지는 않는다");
}

{
  // 노트에서 온 문장은 정의상 옳다.
  const text = "화강암 방패가 살아 있을 때 딜 교환을 시작합니다.";
  assert.equal(groundCommentary(text, answer).dropped.length, 0, "노트 문장은 남는다");
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
  const result = groundCommentary("**플레이할 때**", answer);
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
  assert.equal(modelChoiceKey(FALLBACK_MODEL), "qwen35");

  /*
    고를 것은 둘이다. 후보를 늘어놓으면 무엇이 다른지 읽는 사람이 판단해야 한다.
    실제로 돌려 보고 남은 둘만 둔다 — 깊은 해설과 가벼운 해설.
  */
  assert.equal(MODEL_CHOICES.length, 2, "고를 것은 둘");
  // 하나는 어디서나 돌아야 한다. 그러지 않으면 f16 없는 기기가 다시 빈손이 된다.
  assert.ok(MODEL_CHOICES.some((c) => !c.model.needsF16), "f16 없이 도는 줄이 있어야 한다");
  // 설명은 `lite` 로 갈라 보인다. 둘이 같은 쪽이면 한쪽 설명이 영영 안 나온다.
  assert.equal(MODEL_CHOICES.filter((c) => c.model.lite).length, 1, "가벼운 줄은 하나");

  /*
    그래픽카드가 못 돌리는 줄은 잠근다. 받고 나서 적재에서 죽는 것보다 낫다.
    확인하는 중에는 잠그지 않는다 — 잠갔다 푸는 편이 더 헷갈린다.
  */
  const heavy: AdvisorModel = { id: "a", dtype: "q4f16", downloadMb: 1, needsF16: true };
  const light: AdvisorModel = { id: "b", dtype: "q4", downloadMb: 1, needsF16: false };
  assert.equal(modelBlocked(heavy, { supported: true, f16: false }), true, "f16 없으면 q4f16 은 잠근다");
  assert.equal(modelBlocked(light, { supported: true, f16: false }), false, "16비트를 안 쓰면 잠그지 않는다");
  assert.equal(modelBlocked(light, { supported: false, f16: false }), true, "WebGPU 가 없으면 둘 다 잠근다");
  assert.equal(modelBlocked(heavy, { supported: true, f16: true }), false, "f16 이 있으면 잠그지 않는다");
  assert.equal(modelBlocked(heavy, null), false, "확인 전에는 잠그지 않는다");
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
  assert.equal(modelChoiceKey(FALLBACK_MODEL), "qwen35");

  /*
    고를 것은 둘이다. 후보를 늘어놓으면 무엇이 다른지 읽는 사람이 판단해야 한다.
    실제로 돌려 보고 남은 둘만 둔다 — 깊은 해설과 가벼운 해설.
  */
  assert.equal(MODEL_CHOICES.length, 2, "고를 것은 둘");
  // 하나는 어디서나 돌아야 한다. 그러지 않으면 f16 없는 기기가 다시 빈손이 된다.
  assert.ok(MODEL_CHOICES.some((c) => !c.model.needsF16), "f16 없이 도는 줄이 있어야 한다");
  // 설명은 `lite` 로 갈라 보인다. 둘이 같은 쪽이면 한쪽 설명이 영영 안 나온다.
  assert.equal(MODEL_CHOICES.filter((c) => c.model.lite).length, 1, "가벼운 줄은 하나");

  /*
    그래픽카드가 못 돌리는 줄은 잠근다. 받고 나서 적재에서 죽는 것보다 낫다.
    확인하는 중에는 잠그지 않는다 — 잠갔다 푸는 편이 더 헷갈린다.
  */
  const heavy: AdvisorModel = { id: "a", dtype: "q4f16", downloadMb: 1, needsF16: true };
  const light: AdvisorModel = { id: "b", dtype: "q4", downloadMb: 1, needsF16: false };
  assert.equal(modelBlocked(heavy, { supported: true, f16: false }), true, "f16 없으면 q4f16 은 잠근다");
  assert.equal(modelBlocked(light, { supported: true, f16: false }), false, "16비트를 안 쓰면 잠그지 않는다");
  assert.equal(modelBlocked(light, { supported: false, f16: false }), true, "WebGPU 가 없으면 둘 다 잠근다");
  assert.equal(modelBlocked(heavy, { supported: true, f16: true }), false, "f16 이 있으면 잠그지 않는다");
  assert.equal(modelBlocked(heavy, null), false, "확인 전에는 잠그지 않는다");
}

{
  /*
    앞에서 한 말을 다시 하면 버린다. "오공 상대법" 에 같은 문단이 머리말만 바꿔
    두 번 나왔다. 틀린 말은 아니지만 읽는 사람의 시간을 버린다.
  */
  const twice = "오래 붙어 싸울수록 오공이 유리해지므로 짧은 딜 교환을 반복합니다. 오래 붙어 싸울수록 오공이 유리해지므로 짧은 딜 교환을 반복합니다.";
  const once = groundCommentary(twice, answer);
  assert.equal(once.dropped.filter((d) => d.verdict === "duplicate").length, 1, "되풀이는 한 번만");
  assert.equal(once.text.split("오래 붙어").length - 1, 1, "남는 것은 하나");

  // 다른 말은 둘 다 남는다. 너무 세게 지우면 해설이 토막 난다.
  const two = groundCommentary("R은 저지 불가라 끊을 수 없습니다. 방패가 깨진 뒤에 붙어 싸웁니다.", answer);
  assert.equal(two.dropped.length, 0, "다른 말은 남는다");
}

console.log("✅ 근거 검사 통과 (33건)");
