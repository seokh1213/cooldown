/**
 * 노트 고리 시험 — 상대편 카드로 "내 어느 스킬" 을 채우는가
 *
 * 노트는 한 챔피언만 보고 쓴다. 고리(`hooks`)는 고를 때 상대편 카드에서 해당 효과를 가진
 * 스킬을 찾아 문장을 붙인다. 없으면 붙이지 않는다.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import type { Playbook } from "./llm/lib/playbookCore";
import { selectPlaybook, withHooks } from "./llm/lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";

const dir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (JSON.parse(fs.readFileSync(path.join(dir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const books = new Map(
  Object.entries((JSON.parse(fs.readFileSync(path.join(dir, "advisor-knowledge.json"), "utf8")) as { playbooks: Record<string, Playbook> }).playbooks),
);
const card = (id: string) => cards.find((c) => c.id === id)!;
const note = (me: string, enemy: string, id: string) => selectPlaybook(books, card(me), card(enemy)).vsEnemy.find((e) => e.id === id)?.text ?? "";

let checks = 0;
const ok = (value: boolean, message: string) => {
  assert.ok(value, message);
  checks += 1;
};

// 피오라 W 는 이동 불가를 막는다. 잭스의 이동 불가는 E 반격(기절)이다.
ok(note("Jax", "Fiora", "vs-fiora-riposte").endsWith("잭스라면 E 반격이 여기에 해당합니다."), "잭스 E 기절이 응수 노트에 붙는다");
// 이즈리얼에게는 묶는 스킬이 없다 → 문장을 붙이지 않는다
ok(!note("Ezreal", "Fiora", "vs-fiora-riposte").includes("이즈리얼"), "해당 스킬이 없으면 붙이지 않는다");
// 이동 수단 노트는 데이터에 고리가 없어도 173명 모두 붙는다
const zedLux = note("Zed", "Lux", "vs-lux-escape");
ok(zedLux.includes("제드라면 W 살아있는 그림자·R 죽음의 표식으로 이 틈에 거리를 좁힙니다."), "제드의 돌진 스킬이 이동 수단 노트에 붙는다");
// 받침: 럼블 → 럼블이라면, 레오나 → 레오나라면
ok(/럼블이라면/.test(note("Rumble", "Lux", "vs-lux-escape")) || !/럼블/.test(note("Rumble", "Lux", "vs-lux-escape")), "받침 있는 이름은 이라면");
ok(note("Leona", "Lux", "vs-lux-escape").includes("레오나라면"), "받침 없는 이름은 라면");
// 앞 고리가 부른 스킬은 뒤 고리가 다시 부르지 않는다(레오나 E 는 돌진이자 속박)
const leona = note("Leona", "Lux", "vs-lux-escape");
ok((leona.match(/E 천공의 검/g) ?? []).length <= 1, "한 스킬을 두 고리가 겹쳐 부르지 않는다");
// 패시브는 부르지 않는다
ok(!/ P /.test(withHooks({ category: "escape-window", text: "x." }, card("Yasuo")).text), "패시브는 부르지 않는다");

console.log(`✅ 노트 고리 통과 (${checks}건)`);
