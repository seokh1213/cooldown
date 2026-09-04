/**
 * 매치업 조언 사전 생성 (배치)
 *
 * 브라우저에서 매번 모델을 돌리지 않도록, 지식 카드가 있는 매치업은 미리 만들어 배포한다.
 * 출력: public/data/<patch>/llm/matchups/<lane>/<Me>-vs-<Enemy>.json
 *
 * 사용:
 *   npm run llm:batch                                  # 전체 목록
 *   npm run llm:batch -- --limit 1                     # 1건만 (연습/CI 스모크)
 *   npm run llm:batch -- --shard 1/4                   # 4분할 중 1번째 (CI 매트릭스)
 *   npm run llm:batch -- --model gemma4:12b
 *   npm run llm:batch -- --dry-run                     # 모델 호출 없이 대상만 확인
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT } from "./lib/data";
import { ollamaChat, listOllamaModels } from "./lib/ollama";
import { buildSections, renderDecidedSections } from "./lib/prompt";
import { buildMatchupContext } from "./matchup-cli";

interface MatchupTarget {
  me: string;
  enemy: string;
  lane?: string;
}

interface BatchOptions {
  model: string;
  listFile: string;
  limit?: number;
  shard?: { index: number; total: number };
  dryRun: boolean;
  outDir?: string;
}

export interface GeneratedMatchup {
  schemaVersion: 1;
  patch: string;
  lang: "ko_KR";
  me: string;
  enemy: string;
  lane?: string;
  model: string;
  generatedAt: string;
  /** 코드가 확정한 구간 (모델을 쓰지 않음) */
  decided: string;
  /** 모델이 서술한 구간 */
  sections: Array<{ id: string; title: string; text: string }>;
  stats: { promptTokensMax: number; outputTokens: number; seconds: number };
}

function parse(argv: string[]): BatchOptions {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const shardRaw = get("--shard");
  let shard: BatchOptions["shard"];
  if (shardRaw) {
    const [index, total] = shardRaw.split("/").map(Number);
    if (!index || !total || index < 1 || index > total) {
      throw new Error(`--shard 형식은 1/4 처럼 씁니다: ${shardRaw}`);
    }
    shard = { index, total };
  }
  const limitRaw = get("--limit");
  return {
    model: get("--model") ?? process.env.LLM_MODEL ?? "gemma4:e2b",
    listFile: get("--list") ?? path.join("knowledge", "matchup-list.json"),
    limit: limitRaw ? Number(limitRaw) : undefined,
    shard,
    dryRun: argv.includes("--dry-run"),
    outDir: get("--out"),
  };
}

/** 생성된 답변이 데이터에 없는 이름을 말하지 않았는지 확인한다 */
function findSuspectNames(text: string, riftItems: Set<string>, otherModeItems: Set<string>): string[] {
  const found: string[] = [];
  for (const name of otherModeItems) {
    // 협곡에서 살 수 없는 아이템(다른 게임 모드 전용)이 등장하면 잘못된 조언이다
    if (!riftItems.has(name) && name.length >= 3 && text.includes(name)) found.push(name);
  }
  return found;
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const list = JSON.parse(fs.readFileSync(opts.listFile, "utf8")) as { matchups: MatchupTarget[] };
  let targets = list.matchups;
  if (opts.shard) {
    targets = targets.filter((_, i) => i % opts.shard!.total === opts.shard!.index - 1);
  }
  if (opts.limit !== undefined) targets = targets.slice(0, opts.limit);

  const data = loadStaticData("ko_KR");
  const riftItems = new Set(
    data.items.items
      .filter((i) => i.availableOnMap11 && i.purchasable !== false && i.inStore !== false)
      .map((i) => i.name),
  );
  const otherModeItems = new Set(data.items.items.map((i) => i.name));

  const outDir = opts.outDir ?? path.join(PUBLIC_DATA_ROOT, data.patch, "llm", "matchups");
  console.log(
    `대상 ${targets.length}건 / 모델 ${opts.model} / 패치 ${data.patch}${opts.shard ? ` / shard ${opts.shard.index}of${opts.shard.total}` : ""}`,
  );
  for (const t of targets) console.log(`  - ${t.me} vs ${t.enemy}${t.lane ? ` (${t.lane})` : ""}`);
  if (opts.dryRun) return;

  const models = await listOllamaModels();
  if (!models.some((m) => m === opts.model || m.startsWith(`${opts.model}:`))) {
    throw new Error(`모델 ${opts.model} 부재. 설치된 모델: ${models.join(", ") || "없음"}`);
  }

  const problems: string[] = [];
  let done = 0;
  for (const target of targets) {
    const started = Date.now();
    const { ctx } = buildMatchupContext({
      me: target.me,
      enemy: target.enemy,
      lane: target.lane,
      lang: "ko_KR",
      compact: true,
      curated: true,
      profile: "web",
    });
    const knowledgeCount = (ctx.playbook?.mine.length ?? 0) + (ctx.playbook?.vsEnemy.length ?? 0) + ctx.tips.length;
    if (knowledgeCount === 0) {
      problems.push(`${target.me} vs ${target.enemy}: 지식 카드 부재 — 생성 제외`);
      continue;
    }

    const decided = renderDecidedSections(ctx);
    const sections: GeneratedMatchup["sections"] = [];
    let promptTokensMax = 0;
    let outputTokens = 0;
    for (const section of buildSections(ctx)) {
      const result = await ollamaChat({
        model: opts.model,
        messages: section.messages,
        temperature: 0.2,
        numCtx: 4096,
      });
      sections.push({ id: section.id, title: section.title, text: result.content.trim() });
      promptTokensMax = Math.max(promptTokensMax, result.stats.promptTokens);
      outputTokens += result.stats.outputTokens;
    }

    const fullText = [decided, ...sections.map((s) => s.text)].join("\n\n");
    const suspects = findSuspectNames(fullText, riftItems, otherModeItems);
    if (suspects.length) {
      problems.push(`${target.me} vs ${target.enemy}: 협곡에 없는 아이템 언급 — ${suspects.join(", ")}`);
    }

    const seconds = (Date.now() - started) / 1000;
    const payload: GeneratedMatchup = {
      schemaVersion: 1,
      patch: ctx.patch,
      lang: "ko_KR",
      me: ctx.me.id,
      enemy: ctx.enemy.id,
      lane: target.lane,
      model: opts.model,
      generatedAt: new Date().toISOString(),
      decided,
      sections,
      stats: { promptTokensMax, outputTokens, seconds },
    };
    const dir = path.join(outDir, target.lane ?? "any");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${ctx.me.id}-vs-${ctx.enemy.id}.json`);
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    done += 1;
    console.log(
      `[${done}/${targets.length}] ${ctx.me.name} vs ${ctx.enemy.name} — 최대 프롬프트 ${promptTokensMax} tok, 생성 ${outputTokens} tok, ${seconds.toFixed(1)}s → ${path.relative(process.cwd(), file)}`,
    );
  }

  if (problems.length) {
    console.error(`\n검증 실패 ${problems.length}건:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n생성 완료 ${done}건. 검증 통과.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
