/**
 * 판정 규칙을 한국어로 옮긴다
 *
 * 위키 Notes 는 영어다. 브라우저에서 도는 e2b 는 영어 규칙을 한국어 질문에 대응시키지 못했다.
 * "Ignite grants two stacks of Conqueror" 를 프롬프트 맨 앞에 세워 줘도
 * "점화는 정복자 스택을 부여하지 않습니다" 라고 반대로 답했다.
 *
 * 그래서 **미리 옮겨 둔다.** 번역은 한 번만 하면 되고 시간을 들여도 되는 일이다.
 *
 * **번역문이 곧 최종 산출물이다.** 규칙 답변은 모델을 거치지 않고 화면에 그대로 나가므로,
 * 여기서 틀리면 사용자가 틀린 문장을 그대로 읽는다. 실제로 모델에 맡겼더니 tick 을 "박자",
 * Press the Attack 을 "공격대", Conditioning 을 "조건화" 로 옮겼다.
 *
 * 그래서 사람이 검수한 번역을 `knowledge/rule-translations.ko.json` 에 두고 그것을 먼저 쓴다.
 * 모델은 새 패치로 문장이 늘어났을 때 임시로 메우는 용도다. 그 결과는 검수 대상이다.
 *
 * 원문은 버리지 않는다. 번역이 틀렸을 때 대조할 수 있어야 한다.
 *
 * 사용:
 *   npm run llm:translate-rules
 *   npm run llm:translate-rules -- --model gemma4:12b
 *   npm run llm:translate-rules -- --limit 3     # 연습
 *   npm run llm:translate-rules -- --refresh     # 캐시 무시
 *   npm run llm:translate-rules -- --report      # 검수가 필요한 문장만 표시
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { ollamaChat } from "./lib/ollama";
import type { RuleNotes } from "./lib/rules";

const CACHE_FILE = path.resolve(process.cwd(), "research", ".rule-translations.json");
/** 사람이 검수한 번역. 원문 그대로를 키로 쓴다. 해시로 두면 무엇이 바뀌었는지 볼 수 없다. */
const CURATED_FILE = path.resolve(process.cwd(), "knowledge", "rule-translations.ko.json");

interface CuratedFile {
  schemaVersion: 1;
  translations: Record<string, string>;
}

function loadCurated(): Record<string, string> {
  if (!fs.existsSync(CURATED_FILE)) return {};
  const parsed = JSON.parse(fs.readFileSync(CURATED_FILE, "utf8")) as CuratedFile;
  return parsed.translations ?? {};
}

const SYSTEM = `당신은 리그 오브 레전드 위키 문서를 한국어로 옮기는 번역가입니다.

규칙
- 문장 하나를 한국어 한 문장으로 옮깁니다. 설명을 덧붙이지 않습니다.
- 게임 용어는 한국어판 표기를 씁니다. Conqueror는 정복자, Ignite는 점화, Electrocute는 감전,
  Phase Rush는 질풍, Summon Aery는 콩콩이 소환, Cleanse는 정화, on-hit은 적중 시 효과,
  Press the Attack은 집중 공격, Conditioning은 우세, tick은 틱, level-scaled는 레벨에 따라 달라지는 값입니다.
- 한국어 용어 뒤에 영어 원문을 괄호로 덧붙이지 않습니다.
- 챔피언 스킬은 "챔피언 슬롯" 형태를 유지합니다. "Azir W" 는 "아지르 W" 로 옮깁니다.
- 수치와 조건을 빠뜨리지 않습니다. 뜻을 바꾸지 않습니다.
- 번역문만 출력합니다. 원문이나 따옴표를 붙이지 않습니다.`;

interface TranslationCache {
  [hash: string]: string;
}

function loadCache(): TranslationCache {
  if (!fs.existsSync(CACHE_FILE)) return {};
  return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as TranslationCache;
}

function saveCache(cache: TranslationCache): void {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
}

const hash = (text: string) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const model = get("--model") ?? "gemma4:e4b";
  const limit = get("--limit") ? Number(get("--limit")) : undefined;
  const refresh = argv.includes("--refresh");
  const reportOnly = argv.includes("--report");

  const patch = resolvePatchVersion();
  const file = path.join(PUBLIC_DATA_ROOT, patch, "llm", "rule-notes.json");
  if (!fs.existsSync(file)) {
    throw new Error("rule-notes.json 이 없다. npm run llm:fetch-rules 를 먼저 돌려라");
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as {
    rules: RuleNotes[];
    [key: string]: unknown;
  };
  const rules = limit ? parsed.rules.slice(0, limit) : parsed.rules;

  const cache = refresh ? {} : loadCache();
  const curated = loadCurated();
  const total = rules.reduce((n, r) => n + r.notes.length, 0);
  console.log(`규칙 ${rules.length}종 / 문장 ${total}건 — 검수본 ${Object.keys(curated).length}건 보유\n`);

  let done = 0;
  let translated = 0;
  let cached = 0;
  let human = 0;
  const needsReview: string[] = [];

  for (const rule of rules) {
    const korean: string[] = [];
    for (const note of rule.notes) {
      done += 1;
      // 사람이 검수한 번역이 있으면 그것이 우선이다. 모델을 부르지 않는다.
      if (curated[note]) {
        korean.push(curated[note]);
        human += 1;
        continue;
      }
      needsReview.push(note);
      const key = hash(`${model}::${note}`);
      if (cache[key]) {
        korean.push(cache[key]);
        cached += 1;
        continue;
      }
      if (reportOnly) {
        korean.push(note);
        continue;
      }
      const result = await ollamaChat({
        model,
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `다음 문장을 한국어로 옮기십시오.\n\n${note}` },
        ],
      });
      const text = result.content.trim().replace(/^["'`]|["'`]$/g, "");
      korean.push(text);
      cache[key] = text;
      translated += 1;
      if (translated % 10 === 0) {
        saveCache(cache);
        console.log(`  ${done}/${total} (새로 번역 ${translated}, 캐시 ${cached})`);
      }
    }
    rule.notesKo = korean;
  }
  saveCache(cache);

  if (needsReview.length) {
    console.log(`\n검수 필요 ${needsReview.length}건 — 모델 번역이라 그대로 내보내면 위험하다:`);
    for (const note of needsReview) console.log(`  ${note.slice(0, 110)}`);
    console.log(`\n${path.relative(process.cwd(), CURATED_FILE)} 에 옮긴 문장을 넣어라.`);
  }
  if (reportOnly) return;

  fs.writeFileSync(file, JSON.stringify(parsed, null, 2), "utf8");
  console.log(
    `\n완료: ${path.relative(process.cwd(), file)} ` +
      `(검수본 ${human}건, 모델 ${translated + cached}건, ${(fs.statSync(file).size / 1024).toFixed(0)} KB)`,
  );
}

main().catch((error: unknown) => {
  console.error("번역 실패", error);
  process.exit(1);
});
