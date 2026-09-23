/**
 * ⑤ 연결문 전후 평가 — 코드 조립 · 원본 0.8B · LoRA 0.8B 를 같은 문항에서 견준다
 *
 * 생성은 브라우저와 같은 q4 ONNX 를 onnxruntime 으로 돌린다(train/ort_generate.py 일괄 모드).
 * 여기서는 문항을 짓고, 생성 결과를 칸으로 읽어 화면에 나갈 글을 만들고, 맹검 채점을 맡긴다.
 *
 * 화면과 같은 안전장치: 칸이 빠졌거나 정규식 근거 검사에 걸린 칸은 코드 조립 문장으로 되돌린다.
 * 그래서 "나간 글" 은 언제나 조립판 이상이어야 하고, 되돌린 칸 수가 모델의 실패율이다.
 *
 *   npx tsx scripts/llm/eval-connector.ts prompts <out.jsonl>
 *   npx tsx scripts/llm/eval-connector.ts score <gen.jsonl> <out.json>
 *   npx tsx scripts/llm/eval-connector.ts judge <out.json> A.json B.json ...   # A 는 조립판 이름 "assembly" 가능
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import type { ChampionCard } from "./lib/facts";
import { groundCommentary } from "../../src/lib/advisor/grounding";
import { matchupDigest } from "../../src/lib/advisor/prose";
import { PAIRS, repeatedSpan } from "./lib/matchupEval";
import { connectorAnswer, connectorData, connectorPrompt, parseConnector, sectionsOf } from "./build-connector-data";
import { buildCommentaryPrompt, type MatchupNotes } from "../../src/lib/advisor/answer";
import { atomSections, eligibleNotes, renderSections, type Candidate } from "./lib/atomAssembly";
import type { Playbook } from "./lib/playbookCore";
import type { AtomFile } from "./build-note-atoms";
import { resolvePatchVersion } from "./lib/data";

/**
 * 채점자에게 줄 자료. 판들이 근거로 삼은 것을 **빠짐없이** 준다.
 *
 * 처음에는 아이템 자료 없이 지은 재료를 줬다. 그러자 코드가 아이템 자료로 도출한 문장
 * ("초반에는 마법무효화의 망토, 신발은 헤르메스의 발걸음")이 재료에 없어, 채점자가 세 판
 * 모두를 "없는 아이템을 지어냈다" 며 깎았다. 앱과 같은 자료(connectorData)로 짓고,
 * 코드가 조립한 칸 사실도 함께 싣는다.
 */
function judgeMaterial(answer: Parameters<typeof buildCommentaryPrompt>[0], digest: string, meId?: string, enemyId?: string): string {
  const prompt = buildCommentaryPrompt(answer, resolvePatchVersion(), "ko_KR") ?? "";
  const end = prompt.indexOf("[요청]");
  // 원자는 노트 **전체**와 위키 팁에서 나온다. 재료에는 노트가 앞쪽 몇 개만 실리므로 전문을 더한다.
  // 안 더하면 원자 판이 "자료에 없는 말" 로 부당하게 깎인다.
  const notes = (id: string | undefined, side: "playing" | "against") => {
    if (!id || !fs.existsSync(`knowledge/playbooks/${id}.json`)) return [];
    const book = JSON.parse(fs.readFileSync(`knowledge/playbooks/${id}.json`, "utf8")) as Record<string, Array<{ text: string }>>;
    return (book[side] ?? []).map((n) => `- ${n.text}`);
  };
  const full = [...notes(meId, "playing"), ...notes(enemyId, "against")];
  // 코드가 카드에서 도출한 문장 전체. 조립판이 안 실은 도출 문장을 원자 판이 실으면, 채점자가
  // 근거를 못 찾아 "케이틀린 주력 피해가 P·Q·W 물리" 를 지어낸 말로 깎았다.
  const claims = ((answer as { notes?: MatchupNotes }).notes?.plan?.claims ?? []).map((c) => `- ${c.text}`);
  return [
    (end >= 0 ? prompt.slice(0, end) : prompt).trim(),
    "",
    "[코드가 검증해 조립한 칸 사실]",
    digest,
    ...(claims.length ? ["", "[카드에서 도출한 사실]", ...claims] : []),
    ...(full.length ? ["", "[두 챔피언의 검증된 운용 노트 전문]", ...full] : []),
  ].join("\n");
}

const [cmd, ...rest] = process.argv.slice(2);

interface Item {
  id: string;
  me: string;
  enemy: string;
  question: string;
}

/** 평가 문항. PAIRS 14개에 같은 챔피언들로 짠 16개를 더한다(모두 연결문 학습에서 뺀 챔피언). */
export function evalItems(): Item[] {
  const list: Item[] = PAIRS.map(([me, enemy, question], i) => ({ id: `p${i}`, me, enemy, question }));
  const ids = [...new Set(PAIRS.flatMap(([a, b]) => [a, b]))];
  const byPos = new Map<string, string[]>();
  for (const id of ids) {
    const pos = (connectorData.cardById.get(id) as ChampionCard).wiki?.positions?.[0] ?? "?";
    byPos.set(pos, [...(byPos.get(pos) ?? []), id]);
  }
  const templates = [
    (a: string, b: string) => `${a}로 ${b} 라인전 어떻게 풀어?`,
    (a: string, b: string) => `${a}로 ${b} 만나면 템 뭐 가?`,
    (a: string, b: string) => `${a}로 ${b} 상대할 때 뭘 제일 조심해야 돼?`,
    (a: string, b: string) => `${a}로 ${b} 딜교 어떻게 해?`,
  ];
  let k = 0;
  const seen = new Set(list.map((x) => x.me + x.enemy));
  for (const group of byPos.values()) {
    for (const a of group) {
      for (const b of group) {
        if (a === b || seen.has(a + b) || list.length >= 30) continue;
        seen.add(a + b);
        const [ca, cb] = [connectorData.cardById.get(a) as ChampionCard, connectorData.cardById.get(b) as ChampionCard];
        list.push({ id: `x${k}`, me: a, enemy: b, question: templates[k++ % templates.length](ca.name, cb.name) });
      }
    }
  }
  return list;
}

/**
 * 질문 주제. 앱에서는 주제 판정기(topicJudge)가 정한다. 평가에서는 30문항의 틀이 정해져 있어
 * 같은 규칙을 모든 판에 똑같이 쓴다 — 판끼리의 차이가 주제 판정이 아니라 조립에서 나오게.
 */
export function focusOf(question: string): string {
  if (/라인전/.test(question)) return "laning";
  if (/템|아이템/.test(question)) return "situational-item";
  if (/조심/.test(question)) return "skill";
  if (/딜교|콤보/.test(question)) return "combo";
  return "general";
}

function build(item: Item) {
  const me = connectorData.cardById.get(item.me) as ChampionCard;
  const enemy = connectorData.cardById.get(item.enemy) as ChampionCard;
  const answer = connectorAnswer(me, enemy, item.question);
  const plan = (answer.notes as MatchupNotes | undefined)?.plan;
  if (plan) plan.focus = focusOf(item.question);
  const digest = matchupDigest(answer, "ko_KR");
  const sections = sectionsOf(digest);
  return { me, enemy, answer, digest, sections, system: connectorPrompt(me, enemy, sections) };
}

export interface Scored {
  id: string;
  question: string;
  shown: string;
  fallback: number;
  sections: number;
  loop: boolean;
  capped: boolean;
  raw: string;
}

function run(program: string, args: string[], input: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(program, args, { cwd: os.tmpdir() });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stdin.end(input);
    child.on("close", () => resolve(out));
  });
}

async function main(): Promise<void> {
  if (cmd === "prompts") {
    const lines = evalItems().map((item) => {
      const b = build(item);
      return JSON.stringify({ id: item.id, system: b.system, user: item.question });
    });
    fs.writeFileSync(rest[0], lines.join("\n") + "\n");
    console.log(`${lines.length}문항 → ${rest[0]}`);
    return;
  }

  if (cmd === "score") {
    type Gen = { id: string; text: string; capped: boolean };
    const gens = new Map<string, Gen>(
      fs
        .readFileSync(rest[0], "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line: string): [string, Gen] => {
          const g = JSON.parse(line) as Gen;
          return [g.id, g];
        }),
    );
    const rows: Scored[] = [];
    for (const item of evalItems()) {
      const g = gens.get(item.id);
      if (!g) continue;
      const b = build(item);
      const parsed = parseConnector(g.text, b.sections.map((s) => s.title));
      let fallback = 0;
      const shown = b.sections
        .map((s) => {
          const body = parsed.get(s.title);
          const ok = body && groundCommentary(body, b.answer, "ko_KR").dropped.length === 0 && !repeatedSpan(body);
          if (!ok) fallback += 1;
          return `**${s.title}**\n${ok ? body : s.body}`;
        })
        .join("\n\n");
      rows.push({
        id: item.id,
        question: item.question,
        shown,
        fallback,
        sections: b.sections.length,
        loop: Boolean(repeatedSpan(g.text)),
        capped: g.capped,
        raw: g.text,
      });
    }
    const total = rows.reduce((t, r) => t + r.sections, 0);
    const fb = rows.reduce((t, r) => t + r.fallback, 0);
    console.log(
      `문항 ${rows.length} · 되돌린 칸 ${fb}/${total} (${Math.round((fb / total) * 100)}%) · 고리 ${rows.filter((r) => r.loop).length} · 상한 ${rows.filter((r) => r.capped).length} · 평균 ${Math.round(rows.reduce((t, r) => t + r.shown.length, 0) / rows.length)}자`,
    );
    fs.writeFileSync(rest[1], JSON.stringify({ rows }, null, 2));
    return;
  }

  if (cmd === "judge") {
    // 판본들을 문항마다 무작위 순서로 A/B/C… 에 싣고, 정답표는 결과 파일에만 남긴다.
    const [out, ...versions] = rest;
    const loaded = versions.map((file) => {
      if (file === "assembly") {
        return { name: "assembly", rows: new Map(evalItems().map((item) => [item.id, build(item).digest])) };
      }
      // 원자 조립(knowledge/atoms). 칸 규칙은 조립판과 같고 재료만 원자다.
      // atoms-kev: 칸마다 판정 헤드가 매긴 확률 순으로 고른다(PICKS 에 pick_scores.py 결과)
      if (file === "atoms-kev") {
        const picks = JSON.parse(fs.readFileSync(process.env.PICKS ?? "research/llm-evals/atoms/picks.json", "utf8")) as Record<
          string,
          Record<string, Record<string, number>>
        >;
        const atoms = (id: string): AtomFile | undefined =>
          fs.existsSync(`knowledge/atoms/${id}.json`) ? (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile) : undefined;
        return {
          name: file,
          rows: new Map(
            evalItems().map((item) => {
              const b = build(item);
              const eligible = eligibleNotes(connectorData.playbooks as unknown as Map<string, Playbook>, b.me, b.enemy);
              const byKev = (key: string, candidates: Candidate[], size: number) => {
                const score = picks[item.id]?.[key] ?? {};
                return [...candidates].sort((a, c) => (score[c.text] ?? -1) - (score[a.text] ?? -1)).slice(0, size);
              };
              const sections = atomSections(b.answer, atoms(item.me), atoms(item.enemy), byKev, true, eligible);
              return [item.id, renderSections(sections, b.answer)];
            }),
          ),
        };
      }
      if (file === "atoms" || file === "atoms-bare") {
        const atoms = (id: string): AtomFile | undefined =>
          fs.existsSync(`knowledge/atoms/${id}.json`) ? (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile) : undefined;
        return {
          name: file,
          rows: new Map(
            evalItems().map((item) => {
              const b = build(item);
              // atoms-bare: 까닭을 붙이지 않은 첫 판(견줌용)
              const eligible = eligibleNotes(connectorData.playbooks as unknown as Map<string, Playbook>, b.me, b.enemy);
              const sections = atomSections(b.answer, atoms(item.me), atoms(item.enemy), undefined, file === "atoms", eligible);
              return [item.id, renderSections(sections, b.answer)];
            }),
          ),
        };
      }
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as { rows: Scored[] };
      return { name: file, rows: new Map(data.rows.map((r) => [r.id, r.shown])) };
    });
    let seed = 1213;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const results: Array<{ id: string; order: string[]; scores: Record<string, number>; note?: string }> = [];
    const list = evalItems();
    let next = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < list.length) {
          const item = list[next++];
          const b = build(item);
          const order = [...loaded].sort(() => rand() - 0.5);
          const letters = order.map((_, i) => String.fromCharCode(65 + i));
          const prompt = [
            "리그 오브 레전드 도우미의 상성 답 여러 판을 채점하라. 판마다 1~5점.",
            "기준(중요한 순): 1) 정확성 — [자료]와 모순되거나 자료에 없는 사실(아이템·스킬·효과·시점)을 지어내면 크게 깎는다.",
            "2) 질문에 답했나 — 사용자가 물은 것을 먼저, 분명하게. 3) 읽기 좋은가 — 문장이 이어지고 되풀이가 없다.",
            "틀린 말이 하나라도 있으면 3점을 넘지 않는다. 판마다 출처는 가려져 있다.",
            "",
            `[질문] ${item.question}`,
            "",
            "[자료] (도우미가 가진 사실 전부)",
            judgeMaterial(b.answer, b.digest, item.me, item.enemy),
            "",
            ...order.flatMap((v, i) => [`[판 ${letters[i]}]`, v.rows.get(item.id) ?? "(없음)", ""]),
            `JSON 한 줄로만 답한다: {${letters.map((l) => `"${l}": 점수`).join(", ")}, "note": "가장 큰 차이 한 줄"}`,
          ].join("\n");
          const text = await run("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], prompt);
          const json = /\{[\s\S]*\}/.exec(text)?.[0];
          try {
            const parsed = JSON.parse(json ?? "{}") as Record<string, number | string>;
            const scores = Object.fromEntries(order.map((v, i) => [v.name, Number(parsed[letters[i]])]));
            results.push({ id: item.id, order: order.map((v) => v.name), scores, note: String(parsed.note ?? "") });
          } catch {
            results.push({ id: item.id, order: order.map((v) => v.name), scores: {} });
          }
        }
      }),
    );
    for (const v of loaded) {
      const s = results.map((r) => r.scores[v.name]).filter((x) => Number.isFinite(x));
      const avg = s.reduce((t, x) => t + x, 0) / (s.length || 1);
      console.log(`${v.name.padEnd(60)} 평균 ${avg.toFixed(2)} · 4점 이상 ${s.filter((x) => x >= 4).length}/${s.length} · 2점 이하 ${s.filter((x) => x <= 2).length}`);
    }
    fs.writeFileSync(out, JSON.stringify({ versions: versions, results }, null, 2));
    return;
  }
  throw new Error("prompts | score | judge");
}

if (process.argv[1]?.endsWith("eval-connector.ts")) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
