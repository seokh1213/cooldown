/**
 * 노트를 원자 주장으로 나눈다 — 재조립·검증·번역·판정기 선별의 단위
 *
 * 플레이북 노트는 JSON 이지만 text 한 칸에 사실·결과·판단 시점·행동이 한 문단으로 섞여 있다.
 * 조립판은 그 첫 문장만 잘라 써서, 문장이 끊기거나 질문과 어긋났다. 노트를 원자로 나누면
 * 질문 주제에 맞는 종류만 골라 칸을 짜고, 스킬·효과를 카드와 코드로 대조할 수 있다.
 *
 * 원자의 종류
 *   fact      스킬·상호작용에 관한 사실      "전기 작살을 두 발 맞으면 둔화가 크게 증폭된다"
 *   timing    판단 시점·창                   "첫 발을 맞은 순간이 판단 시점이다"
 *   action    할 일                          "그 자리에서 버티지 말고 거리를 벌린다"
 *   sequence  콤보 순서(steps 에 슬롯)       E → E → Q
 *   item      아이템·룬 선택과 그 까닭
 *   trait     챔피언 자체의 특징             "공격 속도가 오를수록 강해진다", "후반에 강하다",
 *             (조건이 붙으면 when)           "사일러스에게 궁을 뺏기면 위험하다"(when.enemyIds)
 *
 * 능력치에서 바로 나오는 특징(방어력 상위 5% 등)은 여기서 만들지 않는다. 카드에서 코드가 짓는다.
 *
 *   1. Codex 가 챔피언마다 플레이북 노트·위키 팁·카드 요약을 받아 원자 JSON 을 짓는다.
 *   2. Claude 가 원자마다 "출처 글이 이것을 말하나(새 사실을 더하지 않았나)" 를 가린다.
 *   3. 코드가 스킬 슬롯·효과 태그를 카드와 대조한다.
 * 출력: knowledge/atoms/<id>.json (사람이 검토하는 원본)
 *
 * 사용: npx tsx scripts/llm/build-note-atoms.ts --champions bench | Aatrox,Fiora,…   (bench = 평가 챔피언 22명)
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import type { Playbook } from "./lib/playbookCore";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const OUT_DIR = arg("out") ?? "knowledge/atoms";
const CONCURRENCY = Number(arg("concurrency") ?? 3);

/** 평가 30문항(eval-connector)에 나오는 챔피언. */
export const EVAL_CHAMPIONS = [
  "MonkeyKing", "Rumble", "Yasuo", "Malphite", "Garen", "Darius", "Zed", "Lux", "Ahri", "Fiora", "Aatrox",
  "Teemo", "Nasus", "Jax", "Vayne", "Caitlyn", "Thresh", "Blitzcrank", "LeeSin", "Graves", "Sett", "Mordekaiser",
];

export type AtomKind = "fact" | "timing" | "action" | "sequence" | "item" | "trait";
export type Topic = "combo" | "laning" | "teamfight" | "phase" | "situational-item" | "escape-window" | "skill" | "general";

export interface Atom {
  id: string;
  /** playbook:<노트 id> | wiki | card */
  source: string;
  /** 이 챔피언을 잡을 때(playing) / 이 챔피언을 상대할 때(against) / 둘 다(trait) */
  perspective: "playing" | "against" | "both";
  kind: AtomKind;
  topic: Topic;
  /** 이 챔피언의 스킬 슬롯. 원자가 부르는 스킬만. */
  skills: string[];
  /** 그 스킬의 효과 태그(카드의 effects 어휘) */
  effects: string[];
  steps?: string[];
  when?: { enemyIds?: string[] };
  text: { ko: string };
}

export interface AtomFile {
  champion: string;
  patch: string;
  atoms: Atom[];
}

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const cards = (JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const cardById = new Map(cards.map((c) => [c.id, c]));
const tips = new Map(
  (JSON.parse(fs.readFileSync(path.join(llmDir, "champion-wiki-tips.json"), "utf8")) as {
    champions: Array<{ id: string; playingAs?: string[]; playingAgainst?: string[] }>;
  }).champions.map((t) => [t.id, t]),
);
const EFFECTS = new Set(cards.flatMap((c) => c.spells.flatMap((s) => s.effects)));

function cardSummary(card: ChampionCard): string {
  const stats = Object.entries(card.stats)
    .map(([k, v]) => `${k} ${(v as { gradeLv1: string }).gradeLv1}`)
    .join(", ");
  const spells = card.spells.map((s) => `${s.slot} ${s.name}(${s.effects.join(", ")})`).join(" · ");
  return `${card.name} · 역할 ${card.roleTags.join("/")} · 주 피해 ${card.damageProfile.primary} · 능력치(1레벨) ${stats}\n스킬: ${spells}`;
}

function run(cmd: string, args: string[], input: string, cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stdin.end(input);
    child.on("close", () => resolve(out));
  });
}

async function codex(prompt: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-atoms-"));
  const out = path.join(dir, "out.txt");
  await run("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-C", dir, "-o", out, "-"], prompt, dir);
  const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return text;
}

const claude = (prompt: string) => run("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], prompt, os.tmpdir());

function jsonValue<T>(text: string, open: "{" | "["): T | undefined {
  const close = open === "{" ? "}" : "]";
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  if (start < 0 || end < start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return undefined;
  }
}

/** 코드 대조: 슬롯은 이 챔피언 것이어야 하고, 효과 태그는 카드 어휘여야 하며, 부른 스킬에 실제로 붙어 있어야 한다. */
function validate(card: ChampionCard, atom: Atom): string | undefined {
  const slots = new Set<string>(card.spells.map((s) => s.slot));
  if (atom.skills.some((slot) => !slots.has(slot))) return `없는 슬롯 ${atom.skills.join(",")}`;
  if (atom.effects.some((e) => !EFFECTS.has(e))) return `모르는 효과 ${atom.effects.join(",")}`;
  if (atom.skills.length && atom.effects.length) {
    const owned = new Set(card.spells.filter((s) => atom.skills.includes(s.slot as string)).flatMap((s) => s.effects));
    const stray = atom.effects.filter((e) => !owned.has(e));
    if (stray.length) return `${atom.skills.join(",")} 에 없는 효과 ${stray.join(",")}`;
  }
  if (atom.kind === "sequence" && !(atom.steps?.length)) return "순서가 비었다";
  if (atom.when?.enemyIds?.some((id) => !cardById.has(id))) return `없는 챔피언 ${atom.when.enemyIds.join(",")}`;
  return undefined;
}

async function atomize(id: string): Promise<{ file: AtomFile; dropped: Record<string, number> }> {
  const card = cardById.get(id)!;
  const book = JSON.parse(fs.readFileSync(`knowledge/playbooks/${id}.json`, "utf8")) as Playbook;
  const tip = tips.get(id);
  const notes = [
    ...book.playing.map((n) => `[playbook:${n.id}] (playing, ${n.category}) ${n.text}`),
    ...book.against.map((n) => `[playbook:${n.id}] (against, ${n.category}) ${n.text}`),
  ];
  const wiki = [...(tip?.playingAs ?? []).map((t) => `(playing) ${t}`), ...(tip?.playingAgainst ?? []).map((t) => `(against) ${t}`)];
  const prompt = [
    `리그 오브 레전드 챔피언 ${card.name}(${id}) 의 운용 노트를 **원자 주장**으로 나눠라. 파일을 읽거나 명령을 실행하지 말 것.`,
    "",
    "원자 하나는 주장 하나다. 노트 하나가 보통 2~5개 원자가 된다. 각 원자는 짧은 한국어 합니다체 한 문장.",
    "kind: fact(스킬·상호작용 사실) | timing(판단 시점·창) | action(할 일) | sequence(콤보 순서, steps 에 슬롯 배열) | item(아이템·룬 선택과 까닭) | trait(챔피언 자체 특징)",
    "topic: combo | laning | teamfight | phase | situational-item | escape-window | skill | general",
    "perspective: playing(이 챔피언을 잡을 때) | against(이 챔피언을 상대할 때) | both(trait 처럼 양쪽에 쓰이는 것)",
    "skills: 원자가 부르는 **이 챔피언의** 스킬 슬롯(P/Q/W/E/R). effects: 그 스킬의 효과 태그 중 원자가 말하는 것(아래 카드의 괄호 안 어휘만).",
    "when: 특정 상대에게만 해당하면 {\"enemyIds\": [\"Sylas\"]} (챔피언 id).",
    "",
    "trait 은 챔피언 자체의 특징이다: 강한 시기(초반/후반), 무엇에 의존하나(공격 속도, 중첩, 자원), 무엇에 약하나(치유 감소, 특정 CC, 사일러스가 궁을 뺏으면 위험 같은 상대 조건).",
    "능력치 등급(방어력 높음 등)은 코드가 따로 만드니 trait 으로 적지 말 것. 노트·위키 팁에 근거가 있는 것만.",
    "",
    "**출처에 없는 사실을 더하지 말 것.** 각 원자에 출처 태그(source)를 붙인다: 노트면 \"playbook:<id>\", 위키 팁이면 \"wiki\".",
    "",
    "[카드 요약]",
    cardSummary(card),
    "",
    "[플레이북 노트]",
    ...notes,
    "",
    "[위키 팁(영문, 참고)]",
    ...wiki,
    "",
    '출력: JSON 배열 하나만. [{"source": "...", "perspective": "...", "kind": "...", "topic": "...", "skills": [], "effects": [], "steps": [], "when": {}, "text": "..."}, ...]',
  ].join("\n");

  const drafted = jsonValue<Array<Omit<Atom, "id" | "text"> & { text: string }>>(await codex(prompt), "[") ?? [];
  const dropped: Record<string, number> = {};
  const drop = (why: string) => (dropped[why] = (dropped[why] ?? 0) + 1);
  const shaped: Atom[] = [];
  drafted.forEach((d, i) => {
    if (!d || typeof d.text !== "string" || !d.text.trim()) return drop("빈 원자");
    const atom: Atom = {
      id: `${id}-a${i}`,
      source: String(d.source ?? ""),
      perspective: (["playing", "against", "both"].includes(d.perspective) ? d.perspective : "playing") as Atom["perspective"],
      kind: d.kind,
      topic: d.topic,
      skills: Array.isArray(d.skills) ? d.skills.map(String) : [],
      effects: Array.isArray(d.effects) ? d.effects.map(String) : [],
      ...(Array.isArray(d.steps) && d.steps.length ? { steps: d.steps.map(String) } : {}),
      ...(d.when?.enemyIds?.length ? { when: { enemyIds: d.when.enemyIds.map(String) } } : {}),
      text: { ko: d.text.trim() },
    };
    const problem = validate(card, atom);
    if (problem) return drop(`코드 대조: ${problem.split(" ")[0]}`);
    shaped.push(atom);
  });

  // Claude: 출처 글이 이 원자를 말하나. 출처 원문을 나란히 준다.
  const sourceText = (source: string) => {
    if (source === "wiki") return wiki.join(" / ");
    const noteId = source.replace(/^playbook:/, "");
    const note = [...book.playing, ...book.against].find((n) => n.id === noteId);
    return note ? note.text : "";
  };
  const verdicts =
    jsonValue<Record<string, boolean>>(
      await claude(
        [
          `리그 오브 레전드 ${card.name} 운용 노트에서 뽑은 원자 주장을 검토하라. 번호마다 true/false.`,
          "true: 원자의 내용이 [출처]에 적혀 있거나 거기서 바로 따라 나온다(표현 바꾸기·줄이기는 괜찮다). 새 사실·수치·스킬·아이템을 더했거나 뜻을 바꿨으면 false.",
          "",
          ...shaped.map((a, i) => `${i}. 원자: ${a.text.ko}\n   출처(${a.source}): ${sourceText(a.source) || "(없음)"}`),
          "",
          'JSON 하나로만 답한다: {"0": true, "1": false, …}',
        ].join("\n"),
      ),
      "{",
    ) ?? {};
  const kept = shaped.filter((_, i) => {
    if (verdicts[String(i)] === true) return true;
    drop("Claude: 출처에 없음");
    return false;
  });
  return { file: { champion: id, patch, atoms: kept }, dropped };
}

async function main(): Promise<void> {
  const list = arg("champions") === "bench" ? EVAL_CHAMPIONS : (arg("champions") ?? "").split(",").filter(Boolean);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let next = 0;
  const totals = { atoms: 0 };
  const droppedAll: Record<string, number> = {};
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < list.length) {
        const id = list[next++];
        const { file, dropped } = await atomize(id);
        fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), `${JSON.stringify(file, null, 2)}\n`);
        totals.atoms += file.atoms.length;
        for (const [k, v] of Object.entries(dropped)) droppedAll[k] = (droppedAll[k] ?? 0) + v;
        const kinds = file.atoms.reduce<Record<string, number>>((m, a) => ((m[a.kind] = (m[a.kind] ?? 0) + 1), m), {});
        console.log(`${id}: 원자 ${file.atoms.length} ${JSON.stringify(kinds)} · 뺀 것 ${JSON.stringify(dropped)}`);
      }
    }),
  );
  console.log(`\n원자 ${totals.atoms} · 뺀 까닭 ${JSON.stringify(droppedAll)}`);
}

if (process.argv[1]?.endsWith("build-note-atoms.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
