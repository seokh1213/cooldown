/**
 * 원자로 상성 답을 조립한다 — digestSections 와 같은 칸, 같은 렌더링, 고르는 재료만 원자
 *
 * 지금 조립판(prose.ts digestSections)은 노트의 첫 문장을 잘라 쓴다. 노트 한 개에 사실·시점·
 * 행동이 섞여 있어, 첫 문장이 "W 응수를 빼내는 것이 첫 과제입니다" 처럼 방법 없이 끝나거나
 * 질문과 상관없는 사실이 나왔다. 원자(knowledge/atoms)는 종류·주제·스킬·효과가 붙어 있으니
 * 칸마다 알맞은 종류를 고를 수 있고, 위협도 정규식 대신 효과 태그로 센다.
 *
 * 칸 규칙은 digestSections 와 같다(물은 주제의 칸이 맨 앞). 다른 것은 재료뿐이다.
 *   조심할 것  상대 원자(against) 중 fact·timing, 위협 효과가 많은 것부터 + 도출 pinned
 *   아이템     도출 defense·offense + item 원자(내 playing, 상대 against)
 *   싸우는 법  물은 주제의 내 action·sequence·timing → 상대 against 의 action·timing
 *              → 특징(trait: 강한 시기·의존·약점) 한 줄
 * 특정 상대에게만 맞는 원자(when.enemyIds)는 그 상대일 때만 싣는다.
 *
 * `pick` 을 바꿔 끼우면 같은 칸 규칙으로 고르는 방법만 견줄 수 있다(규칙 / kev 판정기).
 */
import type { AdvisorAnswer, MatchupNotes } from "../../../src/lib/advisor/answer";
import type { DigestSection } from "../../../src/lib/advisor/prose";
import { labelSlots } from "../../../src/lib/advisor/grounding";
import type { Atom, AtomFile } from "../build-note-atoms";
import type { ChampionCard } from "./facts";
import { selectPlaybook, type Playbook } from "./playbookCore";

/**
 * 조건이 맞는 노트의 id. 원자는 노트의 적용 조건(when: 상대가 회복형이면 …)을 물려받지 않았다.
 * 그래서 회복이 없는 그레이브즈 상대에게도 처형인의 대검 원자가 나왔다(맹검 메모). 노트를
 * 고르는 앱의 판정(selectPlaybook)을 그대로 쓰고, 그 노트에서 나온 원자만 후보로 삼는다.
 */
export interface Eligible {
  mine: Set<string>;
  enemy: Set<string>;
}
export function eligibleNotes(playbooks: Map<string, Playbook>, me: ChampionCard, enemy: ChampionCard): Eligible {
  const picked = selectPlaybook(playbooks, me, enemy);
  const ids = (list: Array<{ id?: string }>) => new Set(list.map((e) => e.id).filter((id): id is string => Boolean(id)));
  return { mine: ids(picked.mine), enemy: ids(picked.vsEnemy) };
}

type Compare = Extract<AdvisorAnswer, { kind: "compare" }>;

const THREAT = new Set([
  "둔화", "기절", "속박", "에어본", "강제 이동(넉백/끌기)", "침묵", "공포", "매혹", "도발", "억제",
  "적 마법 저항력 감소", "적 방어력 감소", "처형", "치유 감소",
]);
const HEADINGS = { watch: "조심할 것", build: "아이템", fight: "싸우는 법" };
const FIGHT_TITLES: Partial<Record<string, string>> = {
  combo: "콤보", laning: "라인전", teamfight: "한타", phase: "운영", "escape-window": "진입 타이밍",
};

export interface Candidate {
  text: string;
  atom?: Atom;
  /** mine = 내 챔피언 원자, enemy = 상대 원자, claim = 코드 도출 문장 */
  side: "mine" | "enemy" | "claim";
}

/** 칸 하나를 채울 후보 가운데 size 개를 고른다. 기본은 들어온 순서(규칙이 이미 줄 세웠다). */
export type Pick = (section: DigestSection["key"], candidates: Candidate[], size: number) => Candidate[];
export const pickInOrder: Pick = (_, candidates, size) => candidates.slice(0, size);

const conditional = (atom: Atom, opponentId: string) => !atom.when?.enemyIds?.length || atom.when.enemyIds.includes(opponentId);

/**
 * 상대 원자는 누구의 스킬인지 흐려지지 않게 이름을 붙인다. 문장이 스킬(슬롯 문자)로 시작할
 * 때만 붙인다 — 아무 문장에나 붙였더니 "모데카이저 좁은 통로나 …" 처럼 문장이 깨졌다.
 */
function owned(text: string, name: string): string {
  if (text.startsWith(name)) return text;
  return /^[PQWER](?=\s|[은는이가을를로의와과에]|$)/.test(text) ? `${name} ${text}` : text;
}

export interface SectionCandidates {
  key: DigestSection["key"];
  title: string;
  candidates: Candidate[];
  size: number;
}

/** 칸마다 후보를 규칙 순서로 줄 세운다. 칸 순서는 물은 주제를 따른다. */
/**
 * 행동 원자에 그 까닭을 붙인다. 원자로 쪼개자 "R 을 돌린 직후 W 를 사용합니다" 만 남고
 * "남은 분신이 궁을 흉내 낸다" 가 떨어져 나갔다(맹검 3.30 → 3.07). 같은 노트에서 바로 뒤에
 * 나온 fact 원자가 그 까닭이다.
 */
function withReason(atom: Atom, file: AtomFile | undefined): string {
  if (!file || !["action", "sequence", "timing"].includes(atom.kind)) return atom.text.ko;
  const list = file.atoms;
  const at = list.findIndex((a) => a.id === atom.id);
  const next = list[at + 1];
  if (next && next.source === atom.source && next.kind === "fact") return `${atom.text.ko} ${next.text.ko}`;
  return atom.text.ko;
}

export function atomCandidates(
  answer: Compare,
  mineFile: AtomFile | undefined,
  enemyFile: AtomFile | undefined,
  reasons = true,
  eligible?: Eligible,
): SectionCandidates[] {
  const [me, enemy] = answer.cards;
  const plan = (answer.notes as MatchupNotes | undefined)?.plan;
  const focus = plan?.focus ?? "general";
  const claims = (kind: string): Candidate[] =>
    (plan?.claims ?? []).filter((c) => c.kind === kind).map((c) => ({ text: c.text, side: "claim" as const }));

  // 플레이북 출처만 쓴다. 위키 팁(영문)을 옮긴 원자는 원문을 넘어 넓혀 쓴 것이 섞였다
  // ("블리츠크랭크는 2~3레벨부터 그랩 압박"). 노트는 조건이 맞는 것만(eligible).
  const fromNote = (a: Atom, allowed: Set<string> | undefined) =>
    a.source.startsWith("playbook:") && (!allowed || allowed.has(a.source.slice("playbook:".length)));
  const mine = (mineFile?.atoms ?? []).filter((a) => a.perspective !== "against" && conditional(a, enemy.id) && fromNote(a, eligible?.mine));
  const theirs = (enemyFile?.atoms ?? []).filter((a) => a.perspective !== "playing" && conditional(a, me.id) && fromNote(a, eligible?.enemy));
  // 위협은 원자에 붙은 태그와, 원자가 부르는 **상대 스킬의 카드 태그**를 함께 센다.
  // 원자 태그만 보면 Codex 가 태그를 안 붙인 원자(리 신 R 넉백)가 칸에서 빠졌다.
  const cardTags = (a: Atom) => enemy.spells.filter((sp) => a.skills.includes(sp.slot)).flatMap((sp) => sp.effects);
  const threat = (a: Atom) => new Set([...a.effects, ...cardTags(a)].filter((e) => THREAT.has(e))).size;
  const asMine = (a: Atom): Candidate => ({ text: reasons ? withReason(a, mineFile) : a.text.ko, atom: a, side: "mine" });
  const asEnemy = (a: Atom): Candidate => ({ text: owned(reasons ? withReason(a, enemyFile) : a.text.ko, enemy.name), atom: a, side: "enemy" });
  const byFocus = (a: Atom, b: Atom) => Number(b.topic === focus) - Number(a.topic === focus);
  // 아이템 칸은 종류(item)만이 아니라 주제(situational-item)로도 받는다. 리 신의 상황별 아이템
  // 노트("주력 피해가 물리라 방어력이 먼저")가 fact 로 쪼개져 칸에서 빠졌다.
  const isItem = (a: Atom) => a.kind === "item" || a.topic === "situational-item";

  const watch: Candidate[] = [
    ...theirs
      .filter((a) => (a.kind === "fact" || a.kind === "timing") && !isItem(a))
      .sort((a, b) => threat(b) - threat(a) || byFocus(a, b))
      .filter((a) => threat(a) > 0)
      .map(asEnemy),
    ...claims("pinned"),
  ];
  // 상황별 아이템 노트 가운데 본문을 실행 중에 카드로 짓는 것(generated)은 원자 파일에 본문이
  // 없다. 앱이 렌더한 문장(plan)을 그대로 받는다 — 카드에서 도출한, 검증된 문장이다.
  const firstSentence = (text: string) => text.split(/(?<=[.!?。])\s+/)[0]?.trim() ?? text;
  const renderedItems = (list: Array<{ category: string; text: string }> | undefined, side: "mine" | "enemy"): Candidate[] =>
    (list ?? [])
      .filter((e) => e.category === "situational-item")
      .map((e) => ({ text: side === "enemy" ? owned(firstSentence(e.text), enemy.name) : firstSentence(e.text), side }));
  const build: Candidate[] = [
    ...claims("defense"),
    ...renderedItems(plan?.enemy, "enemy"),
    ...theirs.filter(isItem).map(asEnemy),
    ...mine.filter(isItem).map(asMine),
    ...renderedItems(plan?.mine, "mine"),
    ...claims("offense"),
  ];
  const actionKinds = new Set(["action", "sequence", "timing"]);
  const fightTopic = FIGHT_TITLES[focus] ? focus : undefined;
  const fight: Candidate[] = [
    ...(focus === "phase" ? [...claims("scaling"), ...theirs.filter((a) => a.kind === "trait" && a.topic === "phase").map(asEnemy)] : []),
    ...(fightTopic ? mine.filter((a) => actionKinds.has(a.kind) && a.topic === fightTopic).map(asMine) : []),
    ...(fightTopic ? theirs.filter((a) => (a.kind === "action" || a.kind === "timing") && a.topic === fightTopic).map(asEnemy) : []),
    ...mine.filter((a) => a.kind === "sequence").slice(0, 1).map(asMine),
    // 챔피언 특징(강한 시기·의존·약점) 한 줄은 늘 싣는다 — 사용자가 짚은 "사일러스에게 궁을
    // 뺏기면 위험", "공속이 중요" 같은 말이 여기서 나온다. 상대의 약점부터.
    ...theirs.filter((a) => a.kind === "trait").slice(0, 1).map(asEnemy),
    ...theirs.filter((a) => a.kind === "action" && ["escape-window", "laning", "skill"].includes(a.topic)).map(asEnemy),
    ...mine.filter((a) => a.kind === "trait").slice(0, 1).map(asMine),
    ...claims("scaling"),
  ];

  const sections: Array<[DigestSection["key"], string, Candidate[], number]> = [
    ["watch", HEADINGS.watch, watch, focus === "skill" ? 3 : 2],
    ["build", HEADINGS.build, build, focus === "situational-item" ? 3 : 2],
    ["fight", FIGHT_TITLES[focus] ?? HEADINGS.fight, fight, 3],
  ];
  const ordered =
    focus === "situational-item"
      ? [sections[1], sections[0], sections[2]]
      : fightTopic
        ? [sections[2], sections[0], sections[1]]
        : sections;
  return ordered.map(([key, title, candidates, size]) => ({ key, title, candidates, size }));
}

export function atomSections(
  answer: Compare,
  mineFile: AtomFile | undefined,
  enemyFile: AtomFile | undefined,
  pick: Pick = pickInOrder,
  reasons = true,
  eligible?: Eligible,
): DigestSection[] {
  const used = new Set<string>();
  const usedNotes = new Set<string>();
  return atomCandidates(answer, mineFile, enemyFile, reasons, eligible).map(({ key, title, candidates, size }) => {
    // 앞 칸에 실린 문장은 다시 싣지 않는다. 한 노트에서 나온 원자는 한 번만 싣는다 —
    // 같은 노트의 비슷한 원자("E 회피", "오공 R 은 …")가 되풀이됐다.
    const note = (c: Candidate) => (c.atom ? `${c.side}:${c.atom.source}` : undefined);
    const fresh = candidates.filter((c) => c.text && !used.has(c.text) && !(note(c) && usedNotes.has(note(c)!)));
    const seen = new Set<string>();
    const distinct = fresh.filter((c) => {
      const n = note(c);
      if (!n) return true;
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    const picked = pick(key, distinct, size);
    for (const c of picked) {
      used.add(c.text);
      if (note(c)) usedNotes.add(note(c)!);
    }
    return { key, title, lines: picked.map((c) => c.text) };
  });
}

export function renderSections(sections: DigestSection[], answer: Compare): string {
  return sections
    .filter((s) => s.lines.length)
    .map((s) => `**${s.title}**\n${labelSlots(s.lines.join(" "), answer.cards)}`)
    .join("\n\n");
}
