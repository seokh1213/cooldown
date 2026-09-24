/**
 * 원자를 엄격하게 다시 검증한다 — 쪼개면서 생긴 결합 오류를 뺀다
 *
 * 첫 검증("출처가 이것을 말하나")은 너무 관대했다. 1,649개 가운데 6개만 떨어졌는데,
 * 맹검에서 "응수의 기절을 Q 찌르기에 적용한다" 처럼 노트의 두 사실을 잘못 붙인 원자가
 * 나왔다. 이번에는 원자마다 출처 원문과 대조해 세 가지를 따로 묻는다.
 *   주체  누구의(어느 챔피언의) 스킬·행동인지가 원문과 같은가
 *   짝    스킬과 효과·결과의 짝이 원문과 같은가(다른 스킬의 효과를 붙이지 않았나)
 *   더함  원문에 없는 조건·수치·시점·결론을 더하지 않았나
 * 셋 다 통과한 원자만 남긴다. 원본은 knowledge/atoms 에 덮어쓴다(떨어진 수를 알린다).
 *
 * 사용: npx tsx scripts/llm/reverify-atoms.ts [--champions A,B]
 */
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import type { Playbook } from "./lib/playbookCore";
import type { AtomFile } from "./build-note-atoms";

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const DIR = "knowledge/atoms";
const CONCURRENCY = 4;

function claude(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["-p", "--tools", "", "--no-session-persistence", "--setting-sources", ""], { cwd: os.tmpdir() });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk));
    child.stdin.end(prompt);
    child.on("close", () => resolve(out));
  });
}

function verdicts(text: string): Record<string, boolean> | undefined {
  const match = /\{[\s\S]*\}/.exec(text);
  try {
    return match ? (JSON.parse(match[0]) as Record<string, boolean>) : undefined;
  } catch {
    return undefined;
  }
}

async function reverify(id: string): Promise<[number, number]> {
  const file = JSON.parse(fs.readFileSync(`${DIR}/${id}.json`, "utf8")) as AtomFile;
  const book = JSON.parse(fs.readFileSync(`knowledge/playbooks/${id}.json`, "utf8")) as Playbook;
  const noteText = new Map([...book.playing, ...book.against].map((n) => [`playbook:${n.id}`, n.text]));
  // 위키 출처는 조립에 쓰지 않으므로 그대로 둔다(판정 대상 아님)
  const targets = file.atoms.map((a, i) => ({ a, i })).filter(({ a }) => noteText.has(a.source));
  const prompt = [
    `리그 오브 레전드 ${id} 운용 노트를 쪼갠 원자 주장을 원문과 엄격히 대조하라. 번호마다 true/false.`,
    "true 는 세 가지를 모두 만족할 때만:",
    "  (1) 주체: 누구의(어느 챔피언의) 스킬·행동인지가 원문과 같다.",
    "  (2) 짝: 스킬과 효과·결과의 짝이 원문과 같다. 원문에서 다른 스킬이나 다른 문장에 있던 효과를 붙이지 않았다.",
    "  (3) 더함: 원문에 없는 조건·수치·시점·결론을 더하지 않았다. 줄이기·바꿔 말하기는 괜찮다.",
    "하나라도 어긋나거나 확실하지 않으면 false.",
    "",
    ...targets.map(({ a }, k) => `${k}. 원자: ${a.text.ko}\n   원문: ${noteText.get(a.source)}`),
    "",
    'JSON 하나로만 답한다: {"0": true, "1": false, …}',
  ].join("\n");
  const result = verdicts(await claude(prompt)) ?? verdicts(await claude(prompt));
  if (!result) {
    console.log(`  ! ${id} 판정을 못 읽어 그대로 둔다`);
    return [file.atoms.length, 0];
  }
  const drop = new Set(targets.filter((_, k) => result[String(k)] !== true).map(({ i }) => i));
  file.atoms = file.atoms.filter((_, i) => !drop.has(i));
  fs.writeFileSync(`${DIR}/${id}.json`, `${JSON.stringify(file, null, 2)}\n`);
  return [file.atoms.length, drop.size];
}

async function main(): Promise<void> {
  // --list <파일>: 쉼표나 줄바꿈으로 적은 챔피언 목록(원자화가 끝난 것부터 겹쳐 돌리려고)
  const listed = arg("list") ? fs.readFileSync(arg("list")!, "utf8").split(/[,\s]+/).filter(Boolean) : undefined;
  const ids = listed ?? arg("champions")?.split(",") ?? fs.readdirSync(DIR).map((f) => f.replace(/\.json$/, ""));
  let next = 0;
  let kept = 0;
  let dropped = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const [k, d] = await reverify(id);
        kept += k;
        dropped += d;
        console.log(`${id}: 남김 ${k} · 뺌 ${d}`);
      }
    }),
  );
  console.log(`\n남김 ${kept} · 뺌 ${dropped}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
