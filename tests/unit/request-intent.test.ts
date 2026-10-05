import assert from "node:assert/strict";
import { test } from "node:test";
import { confidentChoice } from "../../src/lib/advisor/requestIntent";
import { rankedChampions, valueAtLevel, type RankingSelection } from "../../research/stat-ranking/ranking.js";
import { createHash } from "node:crypto";
import fs from "node:fs";

test("요청 학습 자료와 가중치가 배포 모델에 동기화되어 있다", () => {
  const meta = JSON.parse(fs.readFileSync("public/models/offline/request-v1.json", "utf8")) as {
    trainingSources: Record<string, string>; weightsSha256: string;
  };
  for (const [file, expected] of Object.entries(meta.trainingSources)) {
    assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"), expected,
      `${file} 변경 후 train-request.py로 요청 판정기를 다시 학습해야 합니다`);
  }
  assert.equal(createHash("sha256").update(fs.readFileSync("public/models/offline/request-v1.bin")).digest("hex"), meta.weightsSha256);
});

test("불확실하거나 잘못된 분류 확률은 요청을 바꾸지 않는다", () => {
  assert.equal(confidentChoice(["overview", "skills"], [0.5, 0.5]), undefined);
  assert.equal(confidentChoice(["overview", "skills"], [NaN, 1]), undefined);
  assert.equal(confidentChoice(["overview", "skills"], [0.9]), undefined);
  assert.deepEqual(confidentChoice(["overview", "skills"], [0.9, 0.1]), { label: "overview", confidence: 0.9 });
});

test("순위 시안은 게임 성장 곡선과 동률 순위를 사용하고 검색 후 전체 순위를 보존한다", () => {
  assert.equal(valueAtLevel({ base: 610, perLevel: 99 }, 18, "health"), 2293);
  assert.equal(valueAtLevel({ base: 0.69, perLevel: 3 }, 18, "attackSpeed"), 1.04);
  const champions = [
    { id: "A", name: "가", roles: ["Fighter"], stats: { health: { base: 640, perLevel: 100 } } },
    { id: "B", name: "나", roles: ["Tank"], stats: { health: { base: 640, perLevel: 100 } } },
    { id: "C", name: "다", roles: ["Fighter"], stats: { health: { base: 610, perLevel: 99 } } },
  ];
  const query: RankingSelection = { stat: "health", level: 1, role: "", search: "" };
  assert.deepEqual(rankedChampions(champions, query).map(champion => champion.rank), [1, 1, 3]);
  assert.equal(rankedChampions(champions, { ...query, search: "다" })[0].rank, 3);
});
