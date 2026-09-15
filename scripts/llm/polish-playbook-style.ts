/**
 * 운용 노트를 합니다체로 옮긴다
 *
 * `knowledge/playbooks/*.json` 의 `text` 만 고친다. id·category·source 는 건드리지 않는다.
 *
 * 왜 원본을 고치는가. 이 글이 해설 프롬프트에 그대로 실리고, 모델은 지시문보다 눈앞의
 * 자료 문체를 따라간다. 16답 중 15답이 한다체로 샜다. 프롬프트로는 이기지 못했다.
 *
 * 사용: npx tsx scripts/llm/polish-playbook-style.ts [--write]
 * --write 없이 돌리면 바뀌는 줄 수와 못 바꾼 문장만 보여 준다.
 */
import * as fs from "fs";
import * as path from "path";
import { toPoliteText } from "./lib/politeStyle";

const ROOT = path.resolve(process.cwd(), "knowledge", "playbooks");
const WRITE = process.argv.includes("--write");

interface Entry {
  id: string;
  category: string;
  text: string;
  [key: string]: unknown;
}
interface Playbook {
  champion: string;
  playing: Entry[];
  against: Entry[];
  [key: string]: unknown;
}

/** 아직 한다체로 끝나는 문장. 변환이 놓친 꼴을 찾아낸다. */
const PLAIN_END = /[가-힣]다[.!?]?$/;
/** 합니다체인지 본다. ㅂ 받침 + 니다 를 제대로 가리려면 음절을 봐야 한다. */
function polite(s: string): boolean {
  const core = s.replace(/[.!?]+$/, "");
  if (/(습니다|십시오)$/.test(core)) return true;
  if (!core.endsWith("니다") || core.length < 3) return false;
  const before = core.codePointAt(core.length - 3) ?? 0;
  return before >= 0xac00 && before <= 0xd7a3 && (before - 0xac00) % 28 === 17;
}

let files = 0;
let changed = 0;
const leftovers: string[] = [];

for (const name of fs.readdirSync(ROOT).filter((f) => f.endsWith(".json")).sort()) {
  const file = path.join(ROOT, name);
  const book = JSON.parse(fs.readFileSync(file, "utf8")) as Playbook;
  files += 1;
  let touched = false;

  for (const side of ["playing", "against"] as const) {
    for (const entry of book[side] ?? []) {
      const next = toPoliteText(entry.text);
      if (next !== entry.text) {
        entry.text = next;
        touched = true;
        changed += 1;
      }
      for (const sentence of next.split(/(?<=[.!?])\s+/)) {
        const s = sentence.trim();
        if (s.length > 2 && PLAIN_END.test(s) && !polite(s)) {
          leftovers.push(`${book.champion} ${entry.id}: …${s.slice(-28)}`);
        }
      }
    }
  }

  if (touched && WRITE) fs.writeFileSync(file, `${JSON.stringify(book, null, 2)}\n`, "utf8");
}

console.log(`파일 ${files}개 · 바뀐 항목 ${changed}개${WRITE ? " (기록함)" : " (시험 삼아 돌림)"}`);
if (leftovers.length) {
  console.log(`\n아직 한다체인 문장 ${leftovers.length}건:`);
  for (const line of leftovers.slice(0, 25)) console.log(`  ${line}`);
} else {
  console.log("남은 한다체 문장 없음");
}
