/**
 * 룬·소환사 주문·게임 요소 규칙(rule-notes.json)에 영어·중국어 이름과 중국어 본문을 붙인다
 *
 * 규칙은 한국어 이름으로만 찾고 한국어(없으면 영어 원문)로만 보였다. 영어·중국어 화면에서 "What does Electrocute do?",
 * "电刑什么时候带?" 가 규칙을 못 찾았고, 찾더라도 한국어 문장이 나왔다.
 *
 *   이름   룬·소환사 주문은 클라이언트 자료(runes/summoner-normalized-<언어>)에서 같은 id 로, 게임 요소 6개는 아래 표로
 *   본문   영어는 위키 원문 그대로(notes), 중국어는 Codex 가 옮기고 코드가 대조한다(한글 없음·길이)
 *          옮긴 것은 knowledge/rule-translations.zh.json 에 원문을 키로 둔다. 다시 돌리면 있는 것은 건너뛴다
 *
 * 사용: npx tsx scripts/llm/translate-rules-zh.ts [--model gpt-6-luna] [--batch 40]
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { RuleNotes } from "./lib/rules";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const MODEL = arg("model") ?? "gpt-6-luna";
const BATCH = Number(arg("batch") ?? 40);
const patch = resolvePatchVersion();
const RULES = path.join(PUBLIC_DATA_ROOT, patch, "llm", "rule-notes.json");
const STORE = path.resolve("knowledge", "rule-translations.zh.json");

const GAMEPLAY: Record<string, { en: string; zh: string }> = {
  미니언: { en: "Minion", zh: "小兵" },
  와드: { en: "Ward", zh: "守卫" },
  덤불: { en: "Brush", zh: "草丛" },
  포탑: { en: "Turret", zh: "防御塔" },
  "시야 점수": { en: "Vision score", zh: "视野得分" },
  귀환: { en: "Recall", zh: "回城" },
};

const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
function namesBy(lang: string): Map<string, string> {
  const runes = read<{ runes: Array<{ id: string; name: string }> }>(path.join(PUBLIC_DATA_ROOT, patch, `runes-normalized-${lang}.json`)).runes;
  const spells = read<{ spells: Array<{ id: string; name: string }> }>(path.join(PUBLIC_DATA_ROOT, patch, `summoner-normalized-${lang}.json`)).spells;
  return new Map([...runes, ...spells].map((x) => [x.id, x.name]));
}

function codex(prompt: string): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-zh-"));
  const out = path.join(dir, "out.txt");
  return new Promise((resolve) => {
    const child = spawn("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "-m", MODEL, "-C", dir, "-o", out, "-"], { cwd: dir });
    child.stdin.end(prompt);
    child.on("close", () => resolve(fs.existsSync(out) ? fs.readFileSync(out, "utf8") : ""));
  });
}

async function main() {
  const file = read<{ rules: RuleNotes[] } & Record<string, unknown>>(RULES);
  const ko = namesBy("ko_KR");
  const en = namesBy("en_US");
  const zh = namesBy("zh_CN");
  const idByKo = new Map([...ko].map(([id, name]) => [name, id]));
  const store: Record<string, string> = fs.existsSync(STORE) ? read<{ translations: Record<string, string> }>(STORE).translations : {};

  // 이름
  for (const rule of file.rules) {
    const id = idByKo.get(rule.name);
    const g = GAMEPLAY[rule.name];
    rule.nameEn = g?.en ?? (id ? en.get(id) : undefined) ?? rule.page;
    rule.nameZh = g?.zh ?? (id ? zh.get(id) : undefined);
  }

  // 본문(중국어)
  const todo = [...new Set(file.rules.flatMap((r) => r.notes))].filter((n) => !store[n]);
  console.log(`옮길 문장 ${todo.length} / 전체 ${new Set(file.rules.flatMap((r) => r.notes)).size}`);
  const glossary = file.rules
    .filter((r) => r.nameZh)
    .map((r) => `${r.nameEn} = ${r.nameZh}`)
    .join("\n");
  for (let i = 0; i < todo.length; i += BATCH) {
    const part = todo.slice(i, i + BATCH);
    const prompt = `Translate these League of Legends wiki notes into Simplified Chinese as used in the Chinese client.
Keep every number and condition. Use these official names:
${glossary}
Champion abilities stay as "champion + slot" (e.g. "Azir W" → "沙皇 W" with the champion's Chinese name).
Reply with a JSON array of strings only, same order, same length (${part.length}).

${JSON.stringify(part, null, 1)}`;
    const reply = await codex(prompt);
    let arr: string[] = [];
    try {
      arr = JSON.parse(reply.slice(reply.indexOf("["), reply.lastIndexOf("]") + 1)) as string[];
    } catch {
      console.log(`  ${i}: 읽지 못함`);
      continue;
    }
    if (arr.length !== part.length) {
      console.log(`  ${i}: 개수가 다름 ${arr.length} ≠ ${part.length}`);
      continue;
    }
    let kept = 0;
    part.forEach((source, j) => {
      const text = (arr[j] ?? "").trim();
      // 대조: 한글이 섞이지 않았고, 한자가 있고, 길이가 원문의 10~150% 사이
      if (!text || /[가-힣]/.test(text) || !/[一-鿿]/.test(text) || text.length < source.length * 0.1 || text.length > source.length * 1.5) return;
      store[source] = text;
      kept += 1;
    });
    console.log(`  ${i + part.length}/${todo.length}: ${kept}/${part.length} 통과`);
    fs.writeFileSync(STORE, JSON.stringify({ note: "규칙 원문(영어) → 중국어. translate-rules-zh.ts 가 Codex 로 옮기고 코드가 대조했다.", model: MODEL, translations: store }, null, 1) + "\n");
  }

  for (const rule of file.rules) {
    const lines = rule.notes.map((n) => store[n]);
    rule.notesZh = lines.every(Boolean) ? (lines as string[]) : undefined;
  }
  fs.writeFileSync(RULES, JSON.stringify(file, null, 2) + "\n");
  const full = file.rules.filter((r) => r.notesZh).length;
  console.log(`중국어 본문이 다 있는 규칙 ${full}/${file.rules.length} → ${path.relative(process.cwd(), RULES)}`);
}

void main();
