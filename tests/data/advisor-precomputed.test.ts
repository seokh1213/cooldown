/**
 * 미리 쓴 상성 답 시험 — 칸 순서와 되돌아가기
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import type { ChampionCard } from "../../src/lib/knowledge/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "../../scripts/llm/lib/data";
import { precomputedDigest, type PrecomputedFile } from "../../src/lib/advisor/precomputed";

const cards = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm", "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const pairCards = ["Jax", "Fiora"].map((id) => cards.find((c) => c.id === id)!);
const pair = { watch: "피오라 W 응수를 조심합니다.", build: "방어력을 먼저 올립니다.", fight: "짧게 딜 교환합니다.", laning: "라인전에서는 E 반격이 돌 때만 싸웁니다." };

test("일반 질문은 조심할 것·아이템·싸우는 법", () => {
  const general = precomputedDigest(pair, "general", pairCards)!;
  assert.ok(general.startsWith("**조심할 것**") && general.includes("**아이템**") && general.includes("**싸우는 법**"));
});

test("라인전을 물으면 라인전 칸이 맨 앞, 세 칸까지", () => {
  const laning = precomputedDigest(pair, "laning", pairCards)!;
  assert.ok(laning.startsWith("**라인전**"), "라인전을 물으면 라인전 칸이 맨 앞");
  assert.ok((laning.match(/\*\*/g) ?? []).length === 6, "세 칸까지");
});

test("아이템을 물으면 아이템 칸이 맨 앞", () => {
  assert.ok(precomputedDigest(pair, "situational-item", pairCards)!.startsWith("**아이템**"));
});

test("물은 칸이 없으면 노트 조립으로 되돌아간다", () => {
  assert.ok(precomputedDigest(pair, "teamfight", pairCards) === undefined);
});

test("칸이 하나뿐이면 쓰지 않는다", () => {
  assert.ok(precomputedDigest({ laning: "라인전." }, "laning", pairCards) === undefined);
});

test("스킬 질문은 조심할 것부터", () => {
  assert.ok(/W 응수/.test(precomputedDigest(pair, "skill", pairCards)!));
});

test("칸 첫머리의 이음말을 뗀다", () => {
  assert.ok(!/\*\*\n이후에는/.test(precomputedDigest({ ...pair, fight: "이후에는 짧게 딜 교환합니다." }, "general", pairCards)!));
});

test("말파이트 대 제이스의 실제 미리 쓴 답은 물리 견제에 방어력을 우선한다", () => {
  const file = JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm", "matchups", "Malphite.json"), "utf8")) as PrecomputedFile;
  const build = file.pairs.Jayce.build!;
  assert.match(build, /물리 피해.*방어력을 먼저/);
  assert.doesNotMatch(build, /마법 저항력을 먼저|마법무효화의 망토를 먼저/);
  assert.match(build, /마법 피해는 방어력으로 줄일 수 없/);
});
