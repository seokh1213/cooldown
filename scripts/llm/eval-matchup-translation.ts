/**
 * 영어·중국어: 지금 답(노트 번역 조립) 대 미리 쓴 상성 답을 옮긴 판 — 맹검, 번역을 더 돌릴지 정하려고
 *
 * 노트 번역이 들어간 뒤 영어·중국어 답은 이미 노트 조립(matchupDigest + noteTranslations)으로 나온다.
 * 미리 쓴 한국어 답(matchups/<id>.json)을 옮기는 데는 Codex 호출이 언어마다 1,700번 넘게 든다.
 * 이미 옮긴 쌍(knowledge/matchup-translations)으로 먼저 견줘, 값이 있을 때만 나머지를 옮긴다.
 *
 * 두 판 모두 앱과 같은 함수로 짓는다: 지금 답 = matchupDigest, 옮긴 판 = precomputedDigest.
 * 채점 자료에는 두 판이 근거로 쓴 것(도출 문장, 두 챔피언의 한국어 노트 전문, 옮긴 노트)을 모두 준다.
 * 채점은 Claude 만 — Codex 한도를 쓰지 않는다.
 *
 *   npx tsx scripts/llm/eval-matchup-translation.ts --lang en_US [--n 30] [--out <결과.json>]
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { matchupNotes, type AdvisorData } from "../../src/lib/advisor/context";
import { buildCompareAnswer, type MatchupNotes } from "../../src/lib/advisor/answer";
import { matchupDigest } from "../../src/lib/advisor/prose";
import { precomputedDigest, type PrecomputedPair } from "../../src/lib/advisor/precomputed";
import type { Compare } from "./build-connector-data";
import { translateTag } from "../../src/lib/advisor/promptLocale";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const LANG = (arg("lang") ?? "en_US") as "en_US" | "zh_CN";
const N = Number(arg("n") ?? 30);
const OUT = arg("out") ?? `research/llm-evals/matchup-translation/${LANG}.json`;

const patch = resolvePatchVersion();
const read = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, file), "utf8")) as T;
const cards = read<{ cards: ChampionCard[] }>(`llm/champion-cards-${LANG}.json`).cards;
const playbooks = new Map(Object.entries(read<{ playbooks: Record<string, Playbook> }>("llm/advisor-knowledge.json").playbooks));
const koCards = new Map(read<{ cards: ChampionCard[] }>("llm/champion-cards-ko_KR.json").cards.map((c) => [c.id, c]));
/**
 * 두 챔피언의 스킬과 효과 태그 — 미리 쓴 답의 재료(precompute-matchups material 의 [스킬])와 같다.
 * 처음엔 이것을 빼서, 옮긴 판의 "아리 P 회복", "블리츠크랭크 E 에어본" 을 채점자가 지어낸 말로 깎았다.
 */
const spellLines = (id: string) => {
  const card = koCards.get(id)!;
  return card.spells.map((sp) => `- ${card.name} ${sp.slot} ${sp.name}${sp.effects.length ? `: ${sp.effects.map((t) => translateTag(t, "ko_KR")).join(", ")}` : ""}`);
};
const data = {
  cards,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks,
  noteTranslations: read<{ notes: Record<string, string> }>(`llm/note-translations-${LANG}.json`).notes,
  items: read<{ items: unknown[] }>(`items-normalized-${LANG}.json`).items,
} as unknown as AdvisorData;

/** 주제마다 질문과 그 주제의 맨 앞 칸(precomputed.ts LEAD 와 같다) */
const TOPICS: Array<{ focus: string; lead: string; q: Record<typeof LANG, (a: string, b: string) => string> }> = [
  { focus: "general", lead: "watch", q: { en_US: (a, b) => `How do I play ${a} into ${b}?`, zh_CN: (a, b) => `用${a}打${b}怎么玩？` } },
  { focus: "laning", lead: "laning", q: { en_US: (a, b) => `How should I lane as ${a} vs ${b}?`, zh_CN: (a, b) => `${a}对线${b}怎么打？` } },
  { focus: "situational-item", lead: "build", q: { en_US: (a, b) => `What should I build as ${a} against ${b}?`, zh_CN: (a, b) => `${a}碰到${b}出什么装备？` } },
  { focus: "skill", lead: "watch", q: { en_US: (a, b) => `As ${a} vs ${b}, what should I watch out for?`, zh_CN: (a, b) => `${a}打${b}最需要注意什么？` } },
  { focus: "combo", lead: "combo", q: { en_US: (a, b) => `What combo should ${a} use on ${b}?`, zh_CN: (a, b) => `${a}打${b}用什么连招？` } },
];

/** 옮긴 쌍: 저장소의 번역 가운데 원문이 지금 matchups 와 같은 칸만 */
function translatedPairs(): Array<{ me: string; enemy: string; pair: PrecomputedPair }> {
  const dir = path.join("knowledge", "matchup-translations", LANG);
  const src = arg("src") ?? path.join(PUBLIC_DATA_ROOT, patch, "llm", "matchups");
  const out: Array<{ me: string; enemy: string; pair: PrecomputedPair }> = [];
  for (const f of fs.readdirSync(dir).sort()) {
    const me = f.replace(/\.json$/, "");
    const srcFile = path.join(src, `${me}.json`);
    if (!fs.existsSync(srcFile)) continue;
    const ko = JSON.parse(fs.readFileSync(srcFile, "utf8")) as { pairs: Record<string, Record<string, string>> };
    const store = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { pairs: Record<string, Record<string, { basis: string; text: string }>> };
    for (const [enemy, secs] of Object.entries(store.pairs)) {
      const pair: PrecomputedPair = {};
      for (const [slot, v] of Object.entries(secs)) if (ko.pairs[enemy]?.[slot] === v.basis) (pair as Record<string, string>)[slot] = v.text;
      if (Object.keys(pair).length) out.push({ me, enemy, pair });
    }
  }
  return out;
}

function claude(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], { cwd: os.tmpdir() });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stdin.end(prompt);
    child.on("close", () => resolve(out));
  });
}

async function main(): Promise<void> {
  // 한 챔피언에 몰리지 않게 챔피언을 돌아가며 뽑고, 주제도 돌린다
  const pool = translatedPairs();
  const byMe = new Map<string, typeof pool>();
  for (const p of pool) byMe.set(p.me, [...(byMe.get(p.me) ?? []), p]);
  const items: Array<{ me: ChampionCard; enemy: ChampionCard; topic: (typeof TOPICS)[number]; current: string; translated: string; material: string }> = [];
  let round = 0;
  while (items.length < N && round < 50) {
    for (const list of byMe.values()) {
      if (items.length >= N) break;
      const cand = list[round];
      if (!cand) continue;
      const me = data.cardById.get(cand.me)!;
      const enemy = data.cardById.get(cand.enemy)!;
      // 이 쌍에 맨 앞 칸이 있는 주제를 돌아가며 고른다
      const topic = [...TOPICS.slice(items.length % TOPICS.length), ...TOPICS].find((t) => (cand.pair as Record<string, string>)[t.lead]);
      if (!topic) continue;
      const answer = buildCompareAnswer([me, enemy], topic.q[LANG](me.name, enemy.name), undefined, {
        matchup: true,
        notes: matchupNotes(data, me, enemy, LANG),
        lang: LANG,
      }) as Compare;
      const plan = (answer.notes as MatchupNotes | undefined)?.plan;
      if (plan) plan.focus = topic.focus;
      const translated = precomputedDigest(cand.pair, topic.focus, [me, enemy], LANG);
      if (!translated) continue;
      const current = matchupDigest(answer, LANG);
      const ko = [...(playbooks.get(me.id)?.playing ?? []), ...(playbooks.get(enemy.id)?.against ?? [])].map((n) => `- ${n.text}`);
      const material = [
        "[스킬(카드의 효과 태그)]",
        ...spellLines(me.id),
        ...spellLines(enemy.id),
        "",
        "[카드에서 도출한 사실]",
        ...(plan?.claims ?? []).map((c) => `- ${c.text}`),
        "",
        "[옮긴 노트(도우미가 화면 언어로 가진 것)]",
        ...[...(plan?.mine ?? []), ...(plan?.enemy ?? [])].map((e) => `- ${e.text}`),
        "",
        "[두 챔피언의 검증된 운용 노트 전문(한국어 원문 — 판이 이것을 옮겨 썼을 수 있다)]",
        ...ko,
      ].join("\n");
      items.push({ me, enemy, topic, current, translated, material });
    }
    round += 1;
  }

  let seed = 1213;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const results: Array<{ me: string; enemy: string; focus: string; scores: Record<string, number>; note: string; current: string; translated: string }> = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < items.length) {
        const it = items[next++];
        const versions = [
          { name: "current", text: it.current },
          { name: "translated", text: it.translated },
        ].sort(() => rand() - 0.5);
        const prompt = [
          "리그 오브 레전드 도우미의 상성 답 두 판을 채점하라. 판마다 1~10점. 답은 질문의 언어로 쓰였다.",
          "기준(중요한 순): 1) 정확성 — [자료]와 모순되거나 자료에 없는 사실(아이템·스킬·효과·시점)을 지어내면 크게 깎는다.",
          "2) 질문에 답했나 — 물은 것을 먼저, 분명하게, 이 상대에 맞게. 3) 쓸모 — 무엇을 언제 하라는지 구체적인가.",
          "4) 읽기 좋은가 — 그 언어로 자연스럽고 되풀이가 없다. 틀린 말이 하나라도 있으면 6점을 넘지 않는다. 출처는 가려져 있다.",
          "",
          `[질문] ${it.topic.q[LANG](it.me.name, it.enemy.name)}`,
          "",
          "[자료]",
          it.material,
          "",
          "[판 A]",
          versions[0].text || "(없음)",
          "",
          "[판 B]",
          versions[1].text || "(없음)",
          "",
          'JSON 한 줄로만 답한다: {"A": 점수, "B": 점수, "note": "가장 큰 차이 한 줄"}',
        ].join("\n");
        const text = await claude(prompt);
        let scores: Record<string, number> = {};
        let note = "";
        try {
          const parsed = JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? "{}") as Record<string, number | string>;
          scores = { [versions[0].name]: Number(parsed.A), [versions[1].name]: Number(parsed.B) };
          note = String(parsed.note ?? "");
        } catch {
          // 못 읽은 답은 점수 없이 남긴다
        }
        results.push({ me: it.me.id, enemy: it.enemy.id, focus: it.topic.focus, scores, note, current: it.current, translated: it.translated });
      }
    }),
  );
  for (const name of ["current", "translated"]) {
    const s = results.map((r) => r.scores[name]).filter((x) => Number.isFinite(x));
    console.log(`${LANG} ${name.padEnd(10)} 평균 ${(s.reduce((t, x) => t + x, 0) / (s.length || 1)).toFixed(2)} (${s.length}문항)`);
  }
  const w = results.filter((r) => r.scores.translated > r.scores.current).length;
  const l = results.filter((r) => r.scores.translated < r.scores.current).length;
  console.log(`옮긴 판 승 ${w} · 패 ${l} · 무 ${results.length - w - l}`);
  const len = (k: "current" | "translated") => Math.round(results.reduce((t, r) => t + r[k].length, 0) / (results.length || 1));
  console.log(`평균 길이: 지금 ${len("current")}자 · 옮긴 판 ${len("translated")}자`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ lang: LANG, results }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
