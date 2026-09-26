/**
 * 앱에서 내보낸 평가 기록(cooldown-advisor-feedback-*.json)을 대화 흐름 시험 세트 초안으로 옮긴다.
 *
 * 앞 상성이 있던 턴만 쓴다(이어 묻기인지 새 질문인지가 문제인 곳). 정답(act)은 비워 두고 사람이 채운다 —
 * 판정기가 고른 것을 정답으로 두면 틀린 것을 맞다고 배운다. 참고로 그때 앱이 무엇으로 답했는지(answerKind·champions)와
 * 평가(up/down)를 곁들인다. 채운 뒤 `act-test.jsonl` 과 같은 꼴이라 eval-b3.ts 로 바로 잰다.
 *
 *   npx tsx scripts/llm/kev-agent/feedback-to-tests.ts <내보낸 파일.json...> > research/llm-evals/kev-agent/act-real-draft.jsonl
 */
import * as fs from "node:fs";

interface Feedback {
  at: string;
  question: string;
  rating: "up" | "down";
  lang?: string;
  previousQuestion?: string;
  previousMatchup?: { mine: string; enemy: string };
  answerKind?: string;
  champions?: string[];
}

const seen = new Set<string>();
for (const file of process.argv.slice(2)) {
  const { feedback } = JSON.parse(fs.readFileSync(file, "utf8")) as { feedback: Feedback[] };
  for (const f of feedback) {
    if (!f.previousMatchup || !f.question) continue;
    const key = `${f.previousMatchup.mine}|${f.previousMatchup.enemy}|${f.question}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(
      JSON.stringify({
        lang: f.lang ?? "ko_KR",
        mine: f.previousMatchup.mine,
        enemy: f.previousMatchup.enemy,
        text: f.question,
        act: "",
        named: null,
        // 참고(채점에 쓰지 않음)
        rating: f.rating,
        previousQuestion: f.previousQuestion,
        answeredAs: { kind: f.answerKind, champions: f.champions },
      }),
    );
  }
}
