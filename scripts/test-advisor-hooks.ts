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
import { matchupNotes, type AdvisorData } from "../src/lib/advisor/context";

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

// 영어·중국어는 옮긴 노트만 싣는다. 고리 문장(한국어 문형)은 붙지 않는다.
for (const lang of ["en_US", "zh_CN"] as const) {
  const langCards = (JSON.parse(fs.readFileSync(path.join(dir, `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards;
  const notes = (JSON.parse(fs.readFileSync(path.join(dir, `note-translations-${lang}.json`), "utf8")) as { notes: Record<string, string> }).notes;
  const byId = new Map(langCards.map((c) => [c.id, c]));
  const data = { cards: langCards, cardById: byId, playbooks: books, items: [], noteTranslations: notes } as unknown as AdvisorData;
  const plan = matchupNotes(data, byId.get("Jax")!, byId.get("Fiora")!, lang).plan!;
  ok(plan.enemy.length > 0, `${lang}: 옮긴 상대 노트가 실린다`);
  ok([...plan.mine, ...plan.enemy].every((entry) => !/[가-힣]/.test(entry.text)), `${lang}: 한국어가 섞이지 않는다(고리 문장 포함)`);
  ok(plan.enemy.some((entry) => entry.text === notes["vs-fiora-riposte"]), `${lang}: 피오라 W 노트가 번역으로 실린다`);
  const bare = { ...data, noteTranslations: undefined } as unknown as AdvisorData;
  ok(matchupNotes(bare, byId.get("Jax")!, byId.get("Fiora")!, lang).plan!.enemy.length === 0, `${lang}: 번역이 없으면 노트를 싣지 않는다`);
}

// 내 노트가 상대 이동기를 가리키면 상대 카드로 채워 그 문장 바로 뒤에 붙인다
{
  const text = selectPlaybook(books, card("Kindred"), card("Caitlyn")).mine.map((e) => e.text).find((t) => t.includes("케이틀린이라면"));
  ok(!!text && /이동기로 빠질[^.]*\. 케이틀린이라면 E 90구경 투망이 그 이동기입니다\./.test(text), "킨드레드 노트: 이동기 문장 바로 뒤에 케이틀린 E");
  // 상대 팀을 말하는 문장(지원가·아군)에는 붙이지 않는다
  const fizz = selectPlaybook(books, card("Nocturne"), card("Swain")).mine.map((e) => e.text).join(" ");
  ok(!/상대 지원가의 군중 제어를 먼저 소모시키고[^.]*\. 스웨인이라면/.test(fizz), "지원가를 말하는 문장에는 라인 상대 스킬을 붙이지 않는다");
}

console.log(`✅ 노트 고리 통과 (${checks}건)`);
