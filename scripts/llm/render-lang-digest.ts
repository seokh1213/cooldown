/**
 * 영어·중국어 상성 답을 세 판으로 떠 둔다(맹검용).
 *
 *   current  노트 번역 없이(도출 문장만) — 번역을 들이기 전의 앱
 *   ours     노트 번역(note-translations-<lang>.json)을 싣고 앱 조립(digestSections) 그대로
 *   atoms    옆 작업의 번역 원자 조립(첫 칸만 노트 단위로 이음, eval-atoms-lang 의 withNotes)
 *
 * 문항은 eval-connector 의 30개를 그 언어 질문으로 바꾼 것(eval-atoms-lang 과 같다).
 *
 *   npx tsx scripts/llm/render-lang-digest.ts --lang en_US --out <결과.json>
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { matchupNotes, type AdvisorData } from "../../src/lib/advisor/context";
import { buildCompareAnswer, type MatchupNotes } from "../../src/lib/advisor/answer";
import { matchupDigest } from "../../src/lib/advisor/prose";
import { atomSections, eligibleNotes, renderSections, type Candidate } from "./lib/atomAssembly";
import type { Compare } from "./build-connector-data";
import type { AtomFile } from "./build-note-atoms";
import { evalItems, focusOf } from "./eval-connector";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const LANG = (arg("lang") ?? "en_US") as "en_US" | "zh_CN";
const patch = resolvePatchVersion();
const read = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, file), "utf8")) as T;
const cards = read<{ cards: ChampionCard[] }>(`llm/champion-cards-${LANG}.json`).cards;
const playbooks = new Map(Object.entries(read<{ playbooks: Record<string, Playbook> }>("llm/advisor-knowledge.json").playbooks));
const base = {
  cards,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks,
  items: read<{ items: unknown[] }>(`items-normalized-${LANG}.json`).items,
};
const bare = base as unknown as AdvisorData;
const translated = { ...base, noteTranslations: read<{ notes: Record<string, string> }>(`llm/note-translations-${LANG}.json`).notes } as unknown as AdvisorData;

const QUESTIONS: Record<typeof LANG, Record<string, (a: string, b: string) => string>> = {
  en_US: {
    general: (a, b) => `How do I play ${a} against ${b}?`,
    laning: (a, b) => `How should I play the laning phase as ${a} vs ${b}?`,
    "situational-item": (a, b) => `What should I build as ${a} against ${b}?`,
    skill: (a, b) => `As ${a} vs ${b}, what should I watch out for the most?`,
    combo: (a, b) => `How do I trade as ${a} against ${b}?`,
  },
  zh_CN: {
    general: (a, b) => `用${a}打${b}怎么玩？`,
    laning: (a, b) => `${a}对线${b}怎么打？`,
    "situational-item": (a, b) => `${a}碰到${b}出什么装备？`,
    skill: (a, b) => `${a}打${b}最需要注意什么？`,
    combo: (a, b) => `${a}打${b}怎么换血？`,
  },
};
const atoms = (id: string): AtomFile | undefined =>
  fs.existsSync(`knowledge/atoms/${id}.json`) ? (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile) : undefined;

const rows = evalItems().map((item) => {
  const me = base.cardById.get(item.me)!;
  const enemy = base.cardById.get(item.enemy)!;
  const focus = focusOf(item.question);
  const question = QUESTIONS[LANG][focus](me.name, enemy.name);
  const answerWith = (data: AdvisorData) => {
    const answer = buildCompareAnswer([me, enemy], question, undefined, { matchup: true, notes: matchupNotes(data, me, enemy, LANG), lang: LANG }) as Compare;
    const plan = (answer.notes as MatchupNotes | undefined)?.plan;
    if (plan) {
      plan.focus = focus;
      plan.question = question;
    }
    return answer;
  };
  const current = matchupDigest(answerWith(bare), LANG);
  const oursAnswer = answerWith(translated);
  const ours = matchupDigest(oursAnswer, LANG);
  let first = true;
  const noteOf = (c: Candidate) => {
    const file = c.side === "enemy" ? atoms(item.enemy) : atoms(item.me);
    const parts = (file?.atoms ?? []).filter((a) => a.source === c.atom!.source).map((a) => a.text[LANG]).filter(Boolean);
    return parts.length ? parts.join(" ") : c.text;
  };
  const fullPick = (_key: string, candidates: Candidate[], size: number) => {
    const picked = candidates.slice(0, size);
    if (!first) return picked;
    first = false;
    return picked.map((c) => (c.atom ? { ...c, text: noteOf(c) } : c));
  };
  const answer = answerWith(bare);
  const eligible = eligibleNotes(playbooks, me, enemy);
  const atomsDigest = renderSections(atomSections(answer, atoms(item.me), atoms(item.enemy), fullPick, true, eligible, LANG), answer);
  return { id: item.id, focus, question, current, ours, atoms: atomsDigest };
});
fs.writeFileSync(arg("out") ?? `lang-digest-${LANG}.json`, JSON.stringify(rows, null, 2));
console.log(`${LANG} 문항 ${rows.length}`);
