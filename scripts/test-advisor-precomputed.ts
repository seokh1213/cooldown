/**
 * 미리 쓴 상성 답 시험 — 칸 순서와 되돌아가기
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { precomputedDigest } from "../src/lib/advisor/precomputed";

const cards = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm", "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const pairCards = ["Jax", "Fiora"].map((id) => cards.find((c) => c.id === id)!);
const pair = { watch: "피오라 W 응수를 조심합니다.", build: "방어력을 먼저 올립니다.", fight: "짧게 딜 교환합니다.", laning: "라인전에서는 E 반격이 돌 때만 싸웁니다." };
let checks = 0;
const ok = (value: boolean, message: string) => {
  assert.ok(value, message);
  checks += 1;
};

const general = precomputedDigest(pair, "general", pairCards)!;
ok(general.startsWith("**조심할 것**") && general.includes("**아이템**") && general.includes("**싸우는 법**"), "일반 질문은 조심할 것·아이템·싸우는 법");
const laning = precomputedDigest(pair, "laning", pairCards)!;
ok(laning.startsWith("**라인전**"), "라인전을 물으면 라인전 칸이 맨 앞");
ok((laning.match(/\*\*/g) ?? []).length === 6, "세 칸까지");
ok(precomputedDigest(pair, "situational-item", pairCards)!.startsWith("**아이템**"), "아이템을 물으면 아이템 칸이 맨 앞");
ok(precomputedDigest(pair, "teamfight", pairCards) === undefined, "물은 칸이 없으면 노트 조립으로 되돌아간다");
ok(precomputedDigest({ laning: "라인전." }, "laning", pairCards) === undefined, "칸이 하나뿐이면 쓰지 않는다");
ok(/W 응수/.test(precomputedDigest(pair, "skill", pairCards)!), "스킬 질문은 조심할 것부터");

console.log(`✅ 미리 쓴 상성 답 통과 (${checks}건)`);
