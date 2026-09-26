/**
 * 상성 답을 큰 모델로 미리 써 둔다 — 앱은 조회만 한다
 *
 * 앱(0.8B·모델 없음)의 상성 답은 검증된 노트를 코드가 이어 붙인 것이다. 사실은 맞지만 노트 문장을
 * 옮긴 글이라 이 상대에 맞춘 말이 적고 흐름이 끊긴다. 큰 모델은 그 재료로 이 상대에 맞춘 글을 쓸 수
 * 있지만 브라우저에서 못 돈다. 그래서 빌드할 때 미리 쓴다.
 *
 *   재료   도출 문장 + 두 챔피언의 노트(조건·고리 적용된 것) + 두 챔피언 스킬(슬롯·이름·효과)
 *   생성   Claude 헤드리스(기본 Opus, 사고 켬, --batch 로 여러 쌍을 한 번에)가 주제별로 2~4문장(JSON).
 *          재료에 없는 사실은 쓰지 말라고 한다. Codex 는 --engine codex 로 남겨 둔다.
 *          Sonnet·Haiku 는 자료를 거꾸로 옮겨 은행보다 낮았다(research/llm-evals/precompute-v2 §6·§7).
 *   검증   문장마다 재료에 맞대(Bespoke-MiniCheck, 로컬) 근거 없는 문장은 버린다.
 *   출력   public/data/<patch>/llm/matchups/<내 챔피언>.json  { patch, pairs: { 상대 id: 칸들 } }
 *
 * 같은 포지션끼리만 쓴다(7,416쌍). 없는 쌍은 앱이 지금처럼 조립한다.
 *
 *   npx tsx scripts/llm/precompute-matchups.ts --pairs Jax:Fiora,MonkeyKing:Rumble --out <dir>
 *   npx tsx scripts/llm/precompute-matchups.ts --all --batch 8 --concurrency 2
 */
import { spawn } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { ChampionCard } from "./lib/facts";
import { matchupNotes, type AdvisorData } from "../../src/lib/advisor/context";
import { josa } from "./lib/text";
import { translateTag } from "../../src/lib/advisor/promptLocale";
import { buildCompareAnswer } from "../../src/lib/advisor/answer";
import { groundCommentary } from "../../src/lib/advisor/grounding";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
/**
 * 생성기. Codex 결제가 끝나(2026-09-26) 기본은 Claude 헤드리스(`claude -p`)다.
 * 헤드리스는 설정·메모리 주입과 도구를 끄고 부른다 — 그대로 부르면 입력의 대부분이 주입이었다(research/llm-evals/precompute-v2 §6).
 * 사고는 끄지 않는다(`--effort`). 사고를 끈 Haiku·Sonnet 은 자료를 거꾸로 옮겨 정확이 0.7 대였다.
 */
const ENGINE = (arg("engine") ?? "claude") as "claude" | "codex";
const CODEX_MODEL = ENGINE === "codex" ? (arg("model") ?? "gpt-6-sol") : "gpt-6-sol";
const CLAUDE_MODEL = arg("model") ?? "opus";
const EFFORT = arg("effort") ?? "medium";
/** 한 번에 부를 쌍 수. 지시문을 한 번만 실어 칸당 약 20% 아낀다(묶음 측정, research/llm-evals/precompute-patch). */
const BATCH = Number(arg("batch") ?? 1);
const PROMPT_VERSION = (arg("prompt") ?? "v2") as "v1" | "v2";
const CONCURRENCY = Number(arg("concurrency") ?? 4);
const CHECK_MODEL = "bespoke-minicheck:7b-q5_1";
const OLLAMA = process.env.OLLAMA_HOST?.startsWith("http") ? process.env.OLLAMA_HOST : "http://127.0.0.1:11434";

export const SECTION_KEYS = ["watch", "build", "fight", "laning", "combo", "escape", "phase", "teamfight"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];
export type PrecomputedPair = Partial<Record<SectionKey, string>>;

const patch = resolvePatchVersion();
const read = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, file), "utf8")) as T;
const cards = read<{ cards: ChampionCard[] }>("llm/champion-cards-ko_KR.json").cards;
const data = {
  cards,
  items: read<{ items: unknown[] }>("items-normalized-ko_KR.json").items,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks: new Map(Object.entries(read<{ playbooks: Record<string, unknown> }>("llm/advisor-knowledge.json").playbooks)),
} as unknown as AdvisorData;

const CATEGORY: Record<string, string> = {
  combo: "콤보", laning: "라인전", teamfight: "한타", phase: "운영", "situational-item": "아이템", "escape-window": "진입 타이밍", skill: "스킬",
};

/** 재료. 모델이 쓸 수 있는 사실은 이것뿐이고, 검증도 이것에 맞댄다. */
export function material(me: ChampionCard, enemy: ChampionCard): string {
  const notes = matchupNotes(data, me, enemy, "ko_KR");
  const plan = notes.plan!;
  const spells = (card: ChampionCard) =>
    card.spells.map((spell) => `- ${card.name} ${spell.slot} ${spell.name}${spell.effects.length ? `: ${spell.effects.map((t) => translateTag(t, "ko_KR")).join(", ")}` : ""}`);
  return [
    "[스킬]",
    ...spells(me),
    ...spells(enemy),
    "[두 챔피언을 견준 사실]",
    ...plan.claims.map((claim) => `- ${claim.text}`),
    `[${me.name} 노트 — ${me.name}을(를) 할 때]`,
    ...plan.mine.map((entry) => `- (${CATEGORY[entry.category] ?? entry.category}) ${entry.text}`),
    `[${enemy.name} 노트 — ${enemy.name}을(를) 상대할 때]`,
    ...plan.enemy.map((entry) => `- (${CATEGORY[entry.category] ?? entry.category}) ${entry.text}`),
  ].join("\n");
}

/**
 * 프롬프트 판. v2 는 채점·은행 전수 조사에서 깎인 자리(방법 −0.34~0.43, 타이밍 −0.36~0.40 / 11점)를 규칙으로 막는다:
 * 은행 7,416쌍에서 build 29% 아이템 이름 없음, combo 22% 순서 표시 없음, fight 22% 시점 낱말 없음, phase 42% 한 문장.
 */
export type PromptVersion = "v1" | "v2";
const V2_RULES = (me: ChampionCard, enemy: ChampionCard) => [
  "- 각 값의 첫 문장은 그 키의 물음에 대한 결론이고, 앞 문장 없이도 뜻이 서야 한다('그때', '이후', '이 틈에' 로 시작하지 않는다).",
  "- build: 자료에 아이템 이름이 있으면 적어도 하나를 이름 그대로 쓰고 왜 사는지 붙인다. 자료에 이름이 없으면 올릴 저항 종류만 말한다.",
  `- combo: 스킬 순서를 '→' 로 잇는다(예: Q → 평타 → E). ${enemy.name}의 어느 스킬이 빠졌을 때 시작하는지 자료에 있으면 붙인다.`,
  `- fight·escape: '언제' 를 한 번은 분명히 쓴다 — ${enemy.name}의 어느 스킬이 빠진 직후, 쿨타임, 레벨, 중첩 등 자료에 있는 시점.`,
  "- laning·phase: 2문장 이상. 누가 언제 강한지와 그때 할 일을 함께 쓴다.",
  `- 자료의 ${me.name} 노트와 ${enemy.name} 노트에 같은 내용이 여러 번 나오면 한 번만 쓴다.`,
];

export function prompt(me: ChampionCard, enemy: ChampionCard, version: PromptVersion = "v1", mat = material(me, enemy)): string {
  return [
    `리그 오브 레전드 상성 코치다. 사용자는 ${josa(me.name, "로/으로")} ${josa(enemy.name, "을/를")} 상대한다. 아래 자료만으로 답을 쓴다.`,
    "",
    mat,
    "",
    "[할 일] JSON 객체 하나만 출력한다. 키와 뜻:",
    `- watch: ${enemy.name}에게서 조심할 것 — 어느 스킬이 왜 위험하고 언제 피하는지`,
    `- build: ${josa(me.name, "이/가")} 무엇을 먼저 사고 어떤 저항을 올릴지`,
    `- fight: ${josa(me.name, "이/가")} 언제 어떻게 싸울지(딜 교환·진입)`,
    "- laning: 라인전 운영",
    "- combo: 이 상대에게 넣는 콤보와 순서",
    "- escape: 언제 들어가는지(상대 이동기·군중 제어가 빠진 창)",
    "- phase: 초반·중반·후반 누가 강한지와 운영",
    "- teamfight: 한타에서 할 일",
    "규칙:",
    "- 값마다 2~4문장, 한국어 합니다체. 목록·제목·인사말 없이 문장만.",
    "- 자료에 있는 사실만 쓴다. 자료에 없는 스킬 효과·아이템·수치·쿨타임을 만들지 않는다. 모르면 그 키를 빈 문자열로 둔다.",
    "- 스킬은 '챔피언 슬롯 이름' 꼴로 부른다(예: 럼블 E 전기 작살). 슬롯을 틀리지 않는다.",
    `- 두 노트를 이어서 이 상대에 맞춘 말로 쓴다: ${enemy.name}의 스킬을 ${me.name}의 어느 스킬로 어떻게 받는지, 언제가 기회인지.`,
    `- 누가 누구 스킬인지 헷갈리지 않는다. ${me.name}이 사용자다.`,
    ...(version === "v2" ? V2_RULES(me, enemy) : []),
  ].join("\n");
}

/** Codex 가 사용량 한도를 알렸는가. 알리면 더 부르지 않고 멈춘다(다시 돌리면 이어 쓴다). */
let limitHit = false;

function codex(text: string): Promise<string> {
  return new Promise((resolve) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-mu-"));
    const out = path.join(dir, "out.txt");
    const child = spawn("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-m", CODEX_MODEL, "-C", dir, "-o", out, "-"], { cwd: dir });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
    // 사용량 한도에 걸리면 Codex 가 끝나지 않고 매달려 있었다. 5분이면 끊는다.
    const timer = setTimeout(() => child.kill("SIGKILL"), 5 * 60 * 1000);
    child.stdin.end(text);
    child.on("close", () => {
      clearTimeout(timer);
      if (/usage limit/i.test(stderr)) limitHit = true;
      const result = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
      fs.rmSync(dir, { recursive: true, force: true });
      resolve(result);
    });
  });
}

/** 헤드리스 호출이 쓴 토큰·비용 합계. 끝에 보인다. */
export const usage = { calls: 0, input: 0, output: 0, thinking: 0, usd: 0 };

function claude(text: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      ["-p", "--model", CLAUDE_MODEL, "--effort", EFFORT, "--setting-sources", "", "--strict-mcp-config", "--no-session-persistence",
        "--disable-slash-commands", "--tools", "", "--output-format", "json", "--system-prompt", "너는 지시를 그대로 따르는 생성기다. 요청한 JSON 객체 하나만 출력한다."],
      { cwd: os.tmpdir() },
    );
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    const timer = setTimeout(() => child.kill("SIGKILL"), 10 * 60 * 1000);
    child.stdin.end(text);
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const body = JSON.parse(stdout) as { result?: string; total_cost_usd?: number; usage?: Record<string, number> & { output_tokens_details?: { thinking_tokens?: number } } };
        const u = body.usage ?? {};
        usage.calls += 1;
        usage.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        usage.output += u.output_tokens ?? 0;
        usage.thinking += u.output_tokens_details?.thinking_tokens ?? 0;
        usage.usd += body.total_cost_usd ?? 0;
        if (/usage limit|rate limit/i.test(body.result ?? "")) limitHit = true;
        resolve(body.result ?? "");
      } catch {
        resolve("");
      }
    });
  });
}

const generate = (text: string) => (ENGINE === "claude" ? claude(text) : codex(text));

/** 여러 쌍을 한 번에. 지시문은 한 번, 쌍마다 <pair> 에 재료만. 출력은 {"<나>:<상대>": {watch, …}} 하나. */
export function batchPrompt(list: Array<[ChampionCard, ChampionCard]>): string {
  return [
    "리그 오브 레전드 상성 코치다. 아래 <pair> 마다 사용자는 me 챔피언으로 enemy 챔피언을 상대한다. 쌍마다 그 쌍의 자료만으로 답을 쓴다. 쌍끼리 자료를 섞지 않는다.",
    "",
    "[할 일] 쌍마다 아래 키를 가진 객체를 쓴다:",
    "- watch: enemy 에게서 조심할 것 — 어느 스킬이 왜 위험하고 언제 피하는지",
    "- build: me 가 무엇을 먼저 사고 어떤 저항을 올릴지",
    "- fight: me 가 언제 어떻게 싸울지(딜 교환·진입)",
    "- laning: 라인전 운영",
    "- combo: 이 상대에게 넣는 콤보와 순서",
    "- escape: 언제 들어가는지(상대 이동기·군중 제어가 빠진 창)",
    "- phase: 초반·중반·후반 누가 강한지와 운영",
    "- teamfight: 한타에서 할 일",
    "규칙(모든 쌍에 공통):",
    "- 값마다 2~4문장, 한국어 합니다체. 목록·제목·인사말 없이 문장만.",
    "- 자료에 있는 사실만 쓴다. 자료에 없는 스킬 효과·아이템·수치·쿨타임을 만들지 않는다. 모르면 그 키를 빈 문자열로 둔다.",
    "- 스킬은 '챔피언 슬롯 이름' 꼴로 부른다(예: 럼블 E 전기 작살). 슬롯을 틀리지 않는다.",
    "- 두 노트를 이어서 이 상대에 맞춘 말로 쓴다: enemy 의 스킬을 me 의 어느 스킬로 어떻게 받는지, 언제가 기회인지.",
    "- 누가 누구 스킬인지 헷갈리지 않는다. me 가 사용자다.",
    ...(PROMPT_VERSION === "v2"
      ? [
          "- 각 값의 첫 문장은 그 키의 물음에 대한 결론이고, 앞 문장 없이도 뜻이 서야 한다('그때', '이후', '이 틈에' 로 시작하지 않는다).",
          "- build: 자료에 아이템 이름이 있으면 적어도 하나를 이름 그대로 쓰고 왜 사는지 붙인다. 자료에 이름이 없으면 올릴 저항 종류만 말한다.",
          "- combo: 스킬 순서를 '→' 로 잇는다(예: Q → 평타 → E). enemy 의 어느 스킬이 빠졌을 때 시작하는지 자료에 있으면 붙인다.",
          "- fight·escape: '언제' 를 한 번은 분명히 쓴다 — enemy 의 어느 스킬이 빠진 직후, 쿨타임, 레벨, 중첩 등 자료에 있는 시점. 숫자는 쓰지 않는다.",
          "- laning·phase: 2문장 이상. 누가 언제 강한지와 그때 할 일을 함께 쓴다.",
          "- 자료의 me 노트와 enemy 노트에 같은 내용이 여러 번 나오면 한 번만 쓴다.",
        ]
      : []),
    "",
    ...list.map(([me, enemy]) => `<pair id="${me.id}:${enemy.id}" me="${me.name}" enemy="${enemy.name}">\n${material(me, enemy)}\n</pair>`),
    "",
    '출력: JSON 객체 하나. 키는 pair id, 값은 위 8개 키를 가진 객체. 예: {"Aatrox:Fiora": {"watch": "…", …}}',
  ].join("\n");
}

export async function supported(document: string, claim: string): Promise<boolean> {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: CHECK_MODEL, messages: [{ role: "user", content: `Document: ${document}\nClaim: ${claim}` }], stream: false, options: { temperature: 0 } }),
  });
  return /^yes/i.test(((await res.json()) as { message: { content: string } }).message.content.trim());
}

/**
 * 괄호 속 수치("E 회전 베기(1레벨 12초)")를 뗀다. 코드 규칙은 숫자가 든 문장을 통째로 버리는데(재료에 없는 수치를
 * 막으려고), 괄호 속 쿨타임 하나 때문에 그 칸의 결론 문장이 사라지고 "이것 하나뿐이므로 …" 같은 조각이 남았다
 * (v2 측정, research/llm-evals/precompute-v2). 괄호 밖 수치는 그대로 두어 규칙이 가린다.
 */
export const stripNumericAsides = (text: string) => text.replace(/\s*\([^()]*\d[^()]*\)/g, "");

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

/**
 * 문장과 겹치는 재료 줄만 골라 근거 문서로 쓴다.
 *
 * 재료 전체(노트 수십 줄)를 문서로 주면 검증 모델이 한국어 긴 글에서 근거를 못 찾아 맞는 문장까지
 * 버렸다(잭스·피오라 18문장 중 7개, 그중 "피오라 W 응수는 잭스 E 반격의 기절을 막고 …" 처럼 두 노트를
 * 이은 것). 두 글자 조각이 가장 많이 겹치는 줄 몇 개와 스킬 줄만 준다.
 */
export function relevantLines(doc: string, sentence: string, k = 6): string {
  const grams = (text: string) => {
    const t = text.replace(/\s+/g, "");
    return new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
  };
  const want = grams(sentence);
  const lines = doc.split("\n").filter((line) => line.startsWith("- "));
  const scored = lines.map((line) => {
    const g = grams(line);
    let hit = 0;
    for (const x of want) if (g.has(x)) hit += 1;
    return { line, score: hit / Math.sqrt(g.size + 1) };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.line).join("\n");
}

export interface PairResult {
  pair: PrecomputedPair;
  kept: number;
  dropped: string[];
  seconds: number;
}

function parseObject(raw: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export async function precomputePair(me: ChampionCard, enemy: ChampionCard): Promise<PairResult | undefined> {
  const started = Date.now();
  // JSON 이 깨지면(따옴표를 풀지 않은 문장 등, Sonnet 3/40) 한 번 더 부른다.
  let parsed = parseObject(await generate(prompt(me, enemy, PROMPT_VERSION)));
  if (!parsed && !limitHit) parsed = parseObject(await generate(prompt(me, enemy, PROMPT_VERSION)));
  if (!parsed) return undefined;
  return groundPair(me, enemy, parsed, started);
}

/** 여러 쌍을 한 번에 쓴다. 묶음에서 빠지거나 깨진 쌍은 하나씩 다시 쓴다. */
export async function precomputeBatch(list: Array<[ChampionCard, ChampionCard]>): Promise<Array<PairResult | undefined>> {
  if (list.length === 1) return [await precomputePair(list[0][0], list[0][1])];
  const started = Date.now();
  const parsed = parseObject(await generate(batchPrompt(list))) ?? {};
  return Promise.all(
    list.map(async ([me, enemy]) => {
      const one = parsed[`${me.id}:${enemy.id}`];
      if (one && typeof one === "object") return groundPair(me, enemy, one as Record<string, unknown>, started);
      return limitHit ? undefined : precomputePair(me, enemy);
    }),
  );
}

function groundPair(me: ChampionCard, enemy: ChampionCard, parsed: Record<string, unknown>, started: number): PairResult {
  /*
   * 검증은 코드 규칙으로 한다(groundCommentary: 스킬 이름과 슬롯이 그 챔피언 것인지, 두 챔피언을
   * 뒤바꿔 부르지 않았는지). 로컬 검증 모델(MiniCheck)로 문장마다 재료에 맞대 봤더니 한국어에서 두
   * 노트를 이은 문장을 거의 다 버렸다 — 잭스·피오라·오공·럼블 45문장 중 21개, 대부분 맞는 문장
   * (잭스 진입 콤보 순서 같은 노트 그대로의 문장까지). `supported` 는 남겨 두되 쓰지 않는다.
   */
  const answer = buildCompareAnswer([me, enemy], "상성", undefined, { matchup: true, notes: matchupNotes(data, me, enemy, "ko_KR"), lang: "ko_KR" });
  const pair: PrecomputedPair = {};
  const dropped: string[] = [];
  let kept = 0;
  for (const key of SECTION_KEYS) {
    const value = typeof parsed[key] === "string" ? stripNumericAsides((parsed[key] as string).trim()) : "";
    if (!value) continue;
    const grounded = groundCommentary(value, answer, "ko_KR");
    for (const d of grounded.dropped) dropped.push(`${key}: ${typeof d === "string" ? d : JSON.stringify(d)}`);
    const n = sentences(grounded.text).length;
    kept += n;
    if (n) pair[key] = grounded.text;
  }
  return { pair, kept, dropped, seconds: (Date.now() - started) / 1000 };
}

/** 재료 지문. 생성 때 파일에 적어 두고, 패치를 넘길 때 재료가 그대로인 쌍만 남기는 데 쓴다. */
export function materialFingerprint(a: string, b: string): string {
  return crypto.createHash("sha1").update(material(data.cardById.get(a)!, data.cardById.get(b)!)).digest("hex").slice(0, 12);
}

async function main() {
  const outDir = arg("out") ?? path.join(PUBLIC_DATA_ROOT, patch, "llm", "matchups");
  const positions = new Map(cards.map((card) => [card.id, new Set(card.wiki?.positions ?? [])]));
  const list: Array<[string, string]> = process.argv.includes("--all")
    ? cards.flatMap((a) => cards.filter((b) => b.id !== a.id && [...positions.get(a.id)!].some((p) => positions.get(b.id)!.has(p))).map((b) => [a.id, b.id] as [string, string]))
    : (arg("pairs") ?? "").split(",").filter(Boolean).map((p) => p.split(":") as [string, string]);
  fs.mkdirSync(outDir, { recursive: true });
  const byMe = new Map<string, { patch: string; pairs: Record<string, PrecomputedPair>; materials?: Record<string, string> }>();
  // 재료 지문. 노트·카드를 고치면 재료가 바뀐 쌍만 다시 쓴다(전부 다시 쓰면 Codex 한도를 몇 번 채운다).
  const fingerprint = materialFingerprint;
  const fileOf = (me: string) => path.join(outDir, `${me}.json`);
  const load = (me: string) => {
    if (!byMe.has(me)) byMe.set(me, fs.existsSync(fileOf(me)) ? JSON.parse(fs.readFileSync(fileOf(me), "utf8")) : { patch, pairs: {} });
    return byMe.get(me)!;
  };
  // 지문이 없는 옛 쌍은 지금 재료로 썼다고 보고 지문만 채운다(--adopt). 토큰을 쓰지 않는다.
  if (process.argv.includes("--adopt")) {
    for (const [a, b] of list) {
      const file = load(a);
      if (file.pairs[b] && !file.materials?.[b]) (file.materials ??= {})[b] = fingerprint(a, b);
    }
    for (const [me, file] of byMe) fs.writeFileSync(fileOf(me), JSON.stringify(file));
    console.log("지문을 채웠다");
    return;
  }
  // 이미 쓴 쌍은 건너뛴다(다시 돌려도 이어 쓴다). 재료가 바뀐 쌍은 다시 쓴다.
  const todo = list.filter(([a, b]) => {
    const file = load(a);
    return !file.pairs[b] || (file.materials?.[b] !== undefined && file.materials[b] !== fingerprint(a, b));
  });
  console.log(`쓸 쌍 ${todo.length}(새 쌍 ${todo.filter(([a, b]) => !load(a).pairs[b]).length})`);
  const log: Array<{ me: string; enemy: string; kept: number; dropped: string[]; seconds: number }> = [];
  let next = 0;
  let done = 0;
  let failures = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < todo.length && !limitHit && failures < 10) {
        const chunk = todo.slice(next, next + BATCH);
        next += chunk.length;
        const results = await precomputeBatch(chunk.map(([a, b]) => [data.cardById.get(a)!, data.cardById.get(b)!] as [ChampionCard, ChampionCard])).catch(
          () => chunk.map(() => undefined),
        );
        chunk.forEach(([a, b], i) => {
          const result = results[i];
          done += 1;
          // 연속으로 실패하면 멈춘다. 한도에 걸린 채 수천 쌍을 헛돌지 않게.
          failures = result ? 0 : failures + 1;
          if (!result) return;
          const file = load(a);
          file.pairs[b] = result.pair;
          (file.materials ??= {})[b] = fingerprint(a, b);
          fs.writeFileSync(fileOf(a), JSON.stringify(file));
          log.push({ me: a, enemy: b, kept: result.kept, dropped: result.dropped, seconds: result.seconds });
          if (done % 10 === 0) console.log(`${done}/${todo.length}`);
        });
      }
    }),
  );
  if (limitHit || failures >= 10) console.log(limitHit ? "사용량 한도 — 멈춤. 한도가 풀리면 다시 돌리면 이어 씁니다." : "연속 10쌍 실패 — 멈춤.");
  if (ENGINE === "claude")
    console.log(`claude ${CLAUDE_MODEL}(effort ${EFFORT}, 묶음 ${BATCH}) 호출 ${usage.calls} · 입력 ${usage.input} · 출력 ${usage.output}(사고 ${usage.thinking}) · $${usage.usd.toFixed(3)}`);
  const logFile = arg("log");
  if (logFile) fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
  const drops = log.reduce((n, r) => n + r.dropped.length, 0);
  const keeps = log.reduce((n, r) => n + r.kept, 0);
  console.log(`쌍 ${log.length}/${todo.length} · 문장 ${keeps} 남김 · ${drops} 버림 · 평균 ${Math.round(log.reduce((n, r) => n + r.seconds, 0) / Math.max(1, log.length))}초`);
}

if (process.argv[1]?.endsWith("precompute-matchups.ts")) void main();
