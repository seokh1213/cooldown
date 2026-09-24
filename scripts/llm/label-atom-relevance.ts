/**
 * 원자 판 문장마다 "질문과 상관있나" 를 교사(Codex)에게 묻는다 — kev 관련성 거르개의 상한 재기
 *
 * kev 헤드를 학습하기 전에, 교사 라벨 그대로 걸러 낸 판(오라클)이 맹검에서 나아지는지 본다.
 * 오라클도 못 나아지면 헤드를 학습할 까닭이 없다(선별 헤드는 교차검증 71% 인데 맹검은 떨어졌다).
 *
 *   npx tsx scripts/llm/label-atom-relevance.ts <out.json>
 *   → { [문항 id]: [뺄 문장, ...] }  (eval-connector judge 의 atoms-v:oracle 이 ORACLE 로 읽는다)
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import { atomSections, eligibleNotes } from "./lib/atomAssembly";
import type { Playbook } from "./lib/playbookCore";
import type { AtomFile } from "./build-note-atoms";
import type { ChampionCard } from "./lib/facts";
import type { MatchupNotes } from "../../src/lib/advisor/answer";
import { connectorAnswer, connectorData } from "./build-connector-data";
import { evalItems, focusOf } from "./eval-connector";

const atoms = (id: string): AtomFile | undefined =>
  fs.existsSync(`knowledge/atoms/${id}.json`) ? (JSON.parse(fs.readFileSync(`knowledge/atoms/${id}.json`, "utf8")) as AtomFile) : undefined;

function codex(prompt: string): Promise<string> {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/codex-rel-`);
  const out = `${dir}/out.txt`;
  return new Promise((resolve) => {
    const child = spawn("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-C", dir, "-o", out, "-"], { cwd: dir });
    child.stdin.end(prompt);
    child.on("close", () => {
      const text = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
      fs.rmSync(dir, { recursive: true, force: true });
      resolve(text);
    });
  });
}

async function main(): Promise<void> {
  const out: Record<string, string[]> = {};
  const list = evalItems();
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < list.length) {
        const item = list[next++];
        const me = connectorData.cardById.get(item.me) as ChampionCard;
        const enemy = connectorData.cardById.get(item.enemy) as ChampionCard;
        const answer = connectorAnswer(me, enemy, item.question);
        const plan = (answer.notes as MatchupNotes | undefined)?.plan;
        if (plan) plan.focus = focusOf(item.question);
        const eligible = eligibleNotes(connectorData.playbooks as unknown as Map<string, Playbook>, me, enemy);
        const lines = atomSections(answer, atoms(item.me), atoms(item.enemy), undefined, true, eligible).flatMap((s) => s.lines);
        const prompt = [
          `리그 오브 레전드 상성 질문에 답할 문장 후보다. 사용자는 ${me.name}을(를) 잡고 ${enemy.name}을(를) 상대한다.`,
          `[질문] ${item.question}`,
          "이 질문의 답에서 빼는 편이 나은 문장(질문·이 상성과 상관없거나, 다른 상대에게나 맞는 말)의 번호만 고른다.",
          "애매하면 남긴다. 파일을 읽거나 명령을 실행하지 말 것. JSON 한 줄로만: {\"drop\": [번호, ...]}",
          "",
          ...lines.map((l, i) => `${i}. ${l}`),
        ].join("\n");
        const text = await codex(prompt);
        let drop: number[] = [];
        try {
          drop = (JSON.parse(/\{[\s\S]*\}/.exec(text)?.[0] ?? "{}") as { drop?: number[] }).drop ?? [];
        } catch {
          // 못 읽으면 아무것도 빼지 않는다
        }
        out[item.id] = drop.map((i) => lines[i]).filter(Boolean);
        console.log(`${item.id}: ${lines.length}줄 중 ${out[item.id].length} 뺌`);
      }
    }),
  );
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
