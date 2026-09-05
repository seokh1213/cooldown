/**
 * 판정 규칙을 한국어로 옮긴다
 *
 * 위키 Notes 는 영어다. 브라우저에서 도는 e2b 는 영어 규칙을 한국어 질문에 대응시키지 못했다.
 * "Ignite grants two stacks of Conqueror" 를 프롬프트 맨 앞에 세워 줘도
 * "점화는 정복자 스택을 부여하지 않습니다" 라고 반대로 답했다.
 *
 * 그래서 **미리 옮겨 둔다.** 번역은 한 번만 하면 되고 시간을 들여도 되는 일이라
 * 더 큰 모델(gemma4:e4b)로 오프라인에서 돌린다. 브라우저의 e2b 는 한국어 규칙을 옮겨 적기만 하면 된다.
 *
 * 원문은 버리지 않는다. 번역이 틀렸을 때 대조할 수 있어야 한다.
 *
 * 사용:
 *   npm run llm:translate-rules
 *   npm run llm:translate-rules -- --model gemma4:12b
 *   npm run llm:translate-rules -- --limit 3     # 연습
 *   npm run llm:translate-rules -- --refresh     # 캐시 무시
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { ollamaChat } from "./lib/ollama";
import type { RuleNotes } from "./lib/rules";

const CACHE_FILE = path.resolve(process.cwd(), "research", ".rule-translations.json");

const SYSTEM = `당신은 리그 오브 레전드 위키 문서를 한국어로 옮기는 번역가입니다.

규칙
- 문장 하나를 한국어 한 문장으로 옮깁니다. 설명을 덧붙이지 않습니다.
- 게임 용어는 한국어판 표기를 씁니다. Conqueror는 정복자, Ignite는 점화, Electrocute는 감전,
  Phase Rush는 질풍, Summon Aery는 콩콩이 소환, Cleanse는 정화, on-hit은 적중 시 효과입니다.
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
  const total = rules.reduce((n, r) => n + r.notes.length, 0);
  console.log(`규칙 ${rules.length}종 / 문장 ${total}건 — 모델 ${model}\n`);

  let done = 0;
  let translated = 0;
  let cached = 0;

  for (const rule of rules) {
    const korean: string[] = [];
    for (const note of rule.notes) {
      done += 1;
      const key = hash(`${model}::${note}`);
      if (cache[key]) {
        korean.push(cache[key]);
        cached += 1;
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

  fs.writeFileSync(file, JSON.stringify(parsed, null, 2), "utf8");
  console.log(
    `\n완료: ${path.relative(process.cwd(), file)} ` +
      `(새로 번역 ${translated}건, 캐시 ${cached}건, ${(fs.statSync(file).size / 1024).toFixed(0)} KB)`,
  );
}

main().catch((error: unknown) => {
  console.error("번역 실패", error);
  process.exit(1);
});
