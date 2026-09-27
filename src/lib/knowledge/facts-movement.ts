import { splitSentences } from "./tooltip-sentences";

/**
 * 이 스킬로 움직이는 것이 챔피언 자신인가.
 *
 * **낱말만 보면 안 된다.** "적에게 날아가는 여우불"(아리 W), "매를 날려 보내"(애쉬 E),
 * "아군이 쓰레쉬에게 돌진합니다"(쓰레쉬 W) 가 전부 이동기로 잡혀 있었다. 그 탓에
 * "상대는 이동기가 없어 접근하면 이탈이 어렵다" 라는 근거가 반대로 나갔다.
 *
 * 그래서 **주어를 본다.** 챔피언 이름이 주격으로 나오는 문장에서 자기 이동 동사가 나와야 한다.
 * 앞에 다른 주어가 있으면 그쪽이 움직이는 것이다.
 */
// 어간 뒤 활용형을 요구한다. 관형형(-는)은 남의 동작을 꾸미는 말이라 뺀다.
// "돌진 도중"(야스오 Q)은 명사, "돌진하는 적을 막습니다"(뽀삐 W)는 남의 돌진이다.
const SELF_MOVE_VERBS =
  /돌진[하해합했한](?!는)|돌격[하해합했한](?!는)|도약[하해합했한](?!는)|도약\s?후|비행하(?!는)|활공하(?!는)|하늘을 날|미끄러지|몸을 날[려립]|순간이동|순간적으로 이동|뒤로 밀려|쪽으로 끌려|향해 끌려/;
// 주격(이/가)뿐 아니라 주제(은/는)도 주어 자리다.
const OTHER_SUBJECT = /(아군|적|대상|미니언|몬스터|소환수|랜턴|이 스킬|챔피언)[이가은는]\s/g;

/**
 * 이 스킬로 **누군가가** 돌진하는가.
 *
 * `이동기` 와 묻는 것이 다르다. 쓰레쉬 W 어둠의 통로는 쓰레쉬가 아니라 아군이 돌진하지만,
 * 그 돌진은 뽀삐 W 굳건한 태세로 막힌다. 시전자가 움직이느냐(이탈·진입 판단)와
 * 돌진 판정이 생기느냐(차단 가능 여부)는 별개 질문이라 태그를 나눈다.
 *
 * 한계: 리엇 내부의 대시 판정이 아니라 한국어 툴팁 서술을 본다. 툴팁이 "돌진" 이라
 * 쓰지 않는 이동기(아크샨 E 갈고리)는 잡지 못한다.
 */
const DASH_VERBS = /돌진[하해합했한]|돌격[하해합했한]|도약[하해합했한]|도약\s?후|뛰어[오올]|몸을 날[려립]/;
// "돌진하는 적을 막습니다"(뽀삐 W) 는 남의 돌진을 막는 쪽이라 제 스킬의 돌진이 아니다.
const DASH_REACTION = /돌진하는[^.]{0,20}(막|차단|저지|멈추)/;

export function abilityCausesDash(text: string): boolean {
  return splitSentences(text).some(
    (sentence) => DASH_VERBS.test(sentence) && !DASH_REACTION.test(sentence),
  );
}

/** 당하는 쪽이 반드시 적히는 피동 이동. 주어 생략 추정을 적용하지 않는다. */
const PASSIVE_MOVE = /밀려|끌려/;

export function championMovesItself(text: string, championName: string): boolean {
  const escaped = championName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const subject = new RegExp(`${escaped}(?:이|가|은|는)`, "g");
  const verbs = new RegExp(SELF_MOVE_VERBS.source, "g");
  for (const sentence of splitSentences(text)) {
    for (const verb of sentence.matchAll(verbs)) {
      const at = verb.index ?? 0;
      // **동사에 가장 가까운 주어가 그 동작의 주체다.**
      // 쓰레쉬 W 는 "쓰레쉬가 ... 아군이 ... 돌진합니다" 라 등장 순서만 봐서는 틀린다.
      const lastBefore = (re: RegExp): number => {
        let best = -1;
        for (const m of sentence.matchAll(re)) {
          const i = m.index ?? 0;
          if (i < at && i > best) best = i;
        }
        return best;
      };
      const mine = lastBefore(subject);
      const other = lastBefore(OTHER_SUBJECT);
      // 한국어 툴팁은 시전자가 주어면 생략한다("대상을 뚫고 돌진하여" — 야스오 E).
      // 단, 피동으로 밀리거나 끌려가는 서술은 당하는 쪽이 반드시 적혀 있으므로
      // 주어가 없다고 시전자로 보면 안 된다. 능동 이동 동사에만 생략을 인정한다.
      if (mine < 0 && other < 0) {
        if (PASSIVE_MOVE.test(verb[0])) continue;
        return true;
      }
      if (mine < 0) continue;
      if (other > mine) continue;
      return true;
    }
  }
  return false;
}
