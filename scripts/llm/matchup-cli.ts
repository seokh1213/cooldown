/**
 * 로컬 LLM 상성 코치 CLI (Ollama)
 *
 * 사용 예:
 *   npm run llm:matchup -- --me 오공 --enemy 럼블 --lane top
 *   npm run llm:matchup -- --me MonkeyKing --enemy Rumble --model gemma4:12b
 *   npm run llm:matchup -- --me 오공 --enemy 럼블 --dry-run      # 프롬프트만 출력
 *   npm run llm:matchup -- --me 오공 --enemy 럼블 --no-curated   # 큐레이션 팁 제외(ablation)
 *   npm run llm:matchup -- --me 오공 --enemy 럼블 --save         # research/llm-evals 에 저장
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, type LlmLocale } from "./lib/data";
import { createChampionCardBuilder } from "./lib/facts";
import { loadCuratedTips, selectTips } from "./lib/knowledge";
import { loadPlaybooks, selectPlaybook } from "./lib/playbook";
import { listOllamaModels, ollamaChat, type ChatMessage } from "./lib/ollama";
import {
  buildChain,
  buildMessages,
  buildSections,
  buildUserPrompt,
  renderDecidedSections,
  type MatchupContext,
  type PromptProfile,
} from "./lib/prompt";
import {
  selectDefensiveItems,
  selectKeystones,
  selectRiftSummoners,
} from "./lib/retrieval";

export interface CliArgs {
  me?: string;
  enemy?: string;
  lane?: string;
  model: string;
  lang: LlmLocale;
  patch?: string;
  dryRun: boolean;
  compact: boolean;
  profile?: PromptProfile;
  /** 확정 구간은 코드가 렌더링하고 서술 구간만 두 번 호출 */
  split: boolean;
  /** 한 대화를 이어가며 두 턴으로 물어 KV 캐시를 재사용 */
  chain: boolean;
  curated: boolean;
  think: boolean;
  save: boolean;
  temperature: number;
  numCtx: number;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    model: process.env.LLM_MODEL ?? "gemma4:e2b",
    lang: "ko_KR",
    dryRun: false,
    compact: false,
    split: false,
    chain: false,
    curated: true,
    think: false,
    save: false,
    temperature: 0.3,
    numCtx: 16384,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "--me":
        args.me = next();
        break;
      case "--enemy":
      case "--vs":
        args.enemy = next();
        break;
      case "--lane":
        args.lane = next();
        break;
      case "--model":
        args.model = next();
        break;
      case "--lang":
        args.lang = next() as LlmLocale;
        break;
      case "--patch":
        args.patch = next();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--compact":
        args.compact = true;
        break;
      case "--profile":
        args.profile = next() as PromptProfile;
        break;
      case "--web":
        args.profile = "web";
        break;
      case "--split":
        args.split = true;
        break;
      case "--chain":
        args.chain = true;
        break;
      case "--no-curated":
        args.curated = false;
        break;
      case "--think":
        args.think = true;
        break;
      case "--save":
        args.save = true;
        break;
      case "--temperature":
        args.temperature = Number(next());
        break;
      case "--num-ctx":
        args.numCtx = Number(next());
        break;
      default:
        if (arg.startsWith("--")) throw new Error(`알 수 없는 옵션: ${arg}`);
    }
  }
  return args;
}

export interface BuiltMatchup {
  ctx: MatchupContext;
  promptChars: number;
}

/** 챔피언 두 개로 프롬프트 컨텍스트를 만든다 (CLI 와 eval 이 공유) */
export function buildMatchupContext(args: {
  me: string;
  enemy: string;
  lane?: string;
  lang: LlmLocale;
  patch?: string;
  compact: boolean;
  curated: boolean;
  profile?: PromptProfile;
}): BuiltMatchup {
  const data = loadStaticData(args.lang, args.patch);
  const builder = createChampionCardBuilder(data.champions);

  const meChamp = builder.find(args.me);
  const enemyChamp = builder.find(args.enemy);
  if (!meChamp) throw new Error(`챔피언을 찾을 수 없습니다: ${args.me}`);
  if (!enemyChamp) throw new Error(`챔피언을 찾을 수 없습니다: ${args.enemy}`);

  const me = builder.build(meChamp.id);
  const enemy = builder.build(enemyChamp.id);
  if (!me || !enemy) throw new Error("사실 카드 생성 실패");

  const tips = args.curated
    ? selectTips(loadCuratedTips(), { me: me.id, enemy: enemy.id, lane: args.lane })
    : [];
  const playbook = args.curated
    ? selectPlaybook(loadPlaybooks(), me, enemy, args.lane)
    : { mine: [], vsEnemy: [] };

  // 지식 카드/팁이 이름으로 지목한 아이템은 후보 목록에서 잘리지 않게 고정한다
  const pinnedNames = Array.from(
    new Set([
      ...[...playbook.mine, ...playbook.vsEnemy].flatMap((e) => e.refs?.items ?? []),
      ...tips.flatMap((t) => t.refs?.items ?? []),
    ]),
  );

  const ctx: MatchupContext = {
    patch: data.patch,
    lane: args.lane,
    me,
    enemy,
    items: selectDefensiveItems(data.items.items, enemy, { me, pinnedNames }),
    playbook,
    keystones: selectKeystones(data.runes.runes),
    summoners: selectRiftSummoners(data.summoners.spells),
    tips,
    compact: args.compact,
    profile: args.profile,
  };
  return { ctx, promptChars: buildUserPrompt(ctx).length };
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.me || !args.enemy) {
    console.error("사용법: --me <챔피언> --enemy <챔피언> [--lane top|jungle|mid|bot|support] [--model gemma4:e2b] [--dry-run] [--compact] [--no-curated] [--save]");
    process.exit(1);
  }

  const { ctx, promptChars } = buildMatchupContext({
    me: args.me,
    enemy: args.enemy,
    lane: args.lane,
    lang: args.lang,
    patch: args.patch,
    compact: args.compact,
    curated: args.curated,
    profile: args.profile,
  });
  const messages = buildMessages(ctx);

  if (args.chain) {
    const chain = buildChain(ctx);
    if (args.dryRun) {
      console.log(renderDecidedSections(ctx));
      for (const turn of chain.turns) {
        console.log(`\n=== [${turn.id}] user ${turn.user.length}자 ===\n${turn.user}`);
      }
      return;
    }
    const models = await listOllamaModels();
    if (!models.some((m) => m === args.model || m.startsWith(`${args.model}:`))) {
      console.error(`모델 ${args.model} 이(가) 로컬에 없습니다. 설치된 모델: ${models.join(", ")}`);
      process.exit(1);
    }
    console.error(
      `[${args.model}] ${ctx.me.name} vs ${ctx.enemy.name}${ctx.lane ? ` (${ctx.lane})` : ""} — 연속 대화 ${chain.turns.length}턴\n`,
    );
    process.stdout.write(`${renderDecidedSections(ctx)}\n\n`);
    const history: ChatMessage[] = [{ role: "system", content: chain.system }];
    for (const turn of chain.turns) {
      history.push({ role: "user", content: turn.user });
      if (turn.id === "build-reasons") process.stdout.write("## 선택 이유\n");
      const result = await ollamaChat({
        model: args.model,
        messages: history,
        temperature: args.temperature,
        numCtx: args.numCtx,
        onToken: (t) => process.stdout.write(t),
      });
      history.push({ role: "assistant", content: result.content });
      process.stdout.write("\n\n");
      const s = result.stats;
      console.error(
        `[${turn.id}] 누적 프롬프트 ${s.promptTokens} tok (평가 ${s.promptSeconds.toFixed(1)}s) | 첫 토큰까지 ${s.firstTokenSeconds.toFixed(1)}s | 생성 ${s.outputTokens} tok (${s.tokensPerSecond.toFixed(1)} tok/s)`,
      );
    }
    return;
  }

  if (args.split) {
    const sections = buildSections(ctx);
    if (args.dryRun) {
      console.log(renderDecidedSections(ctx));
      for (const s of sections) {
        console.log(
          `\n=== [${s.id}] system ${s.messages[0].content.length}자 / user ${s.messages[1].content.length}자 ===\n${s.messages[1].content}`,
        );
      }
      return;
    }
    const models = await listOllamaModels();
    if (!models.some((m) => m === args.model || m.startsWith(`${args.model}:`))) {
      console.error(`모델 ${args.model} 이(가) 로컬에 없습니다. 설치된 모델: ${models.join(", ")}`);
      process.exit(1);
    }
    console.error(
      `[${args.model}] ${ctx.me.name} vs ${ctx.enemy.name}${ctx.lane ? ` (${ctx.lane})` : ""} — 분할 호출 ${sections.length}회\n`,
    );
    process.stdout.write(`${renderDecidedSections(ctx)}\n\n`);
    let promptTotal = 0;
    let outputTotal = 0;
    let wallTotal = 0;
    for (const section of sections) {
      const started = Date.now();
      if (section.id === "build-reasons") process.stdout.write("## 선택 이유\n");
      const result = await ollamaChat({
        model: args.model,
        messages: section.messages,
        temperature: args.temperature,
        numCtx: args.numCtx,
        onToken: (t) => process.stdout.write(t),
      });
      process.stdout.write("\n\n");
      const s = result.stats;
      promptTotal += s.promptTokens;
      outputTotal += s.outputTokens;
      wallTotal += (Date.now() - started) / 1000;
      console.error(
        `[${section.id}] 프롬프트 ${s.promptTokens} tok | 첫 토큰까지 ${s.firstTokenSeconds.toFixed(1)}s | 생성 ${s.outputTokens} tok (${s.tokensPerSecond.toFixed(1)} tok/s)`,
      );
    }
    console.error(
      `--- 분할 합계: 프롬프트 ${promptTotal} tok, 생성 ${outputTotal} tok, 총 ${wallTotal.toFixed(1)}s (호출당 최대 프롬프트가 컨텍스트 상한을 결정)`,
    );
    return;
  }

  if (args.dryRun) {
    console.log(`=== system ===\n${messages[0].content}\n\n=== user (${promptChars} chars) ===\n${messages[1].content}`);
    return;
  }

  const models = await listOllamaModels();
  if (!models.some((m) => m === args.model || m.startsWith(`${args.model}:`))) {
    console.error(`모델 ${args.model} 이(가) 로컬에 없습니다. 설치된 모델: ${models.join(", ")}`);
    console.error(`설치: ollama pull ${args.model}`);
    process.exit(1);
  }

  const playbookCount = (ctx.playbook?.mine.length ?? 0) + (ctx.playbook?.vsEnemy.length ?? 0);
  console.error(
    `[${args.model}] ${ctx.me.name} vs ${ctx.enemy.name}${ctx.lane ? ` (${ctx.lane})` : ""} — 프롬프트 ${promptChars}자, 지식 카드 ${playbookCount}건, 검증 팁 ${ctx.tips.length}건, 방어 기준 ${ctx.items.focus.join("+")}\n`,
  );

  const result = await ollamaChat({
    model: args.model,
    messages,
    think: args.think,
    temperature: args.temperature,
    numCtx: args.numCtx,
    onToken: (t) => process.stdout.write(t),
    onThinking: (t) => process.stderr.write(t),
  });
  process.stdout.write("\n");
  const s = result.stats;
  console.error(
    `\n--- 프롬프트 ${s.promptTokens} tok (${s.promptSeconds.toFixed(1)}s) | 첫 토큰까지 ${s.firstTokenSeconds.toFixed(1)}s | 생성 ${s.outputTokens} tok (${s.generateSeconds.toFixed(1)}s, ${s.tokensPerSecond.toFixed(1)} tok/s) | 총 ${s.totalSeconds.toFixed(1)}s`,
  );

  if (args.save) {
    const dir = path.resolve(process.cwd(), "research", "llm-evals");
    ensureDir(dir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(
      dir,
      `${stamp}_${ctx.me.id}-vs-${ctx.enemy.id}_${args.model.replace(/[:/]/g, "-")}${args.curated ? "" : "_no-curated"}.md`,
    );
    const header = [
      `# ${ctx.me.name} vs ${ctx.enemy.name}`,
      "",
      `- model: ${args.model}`,
      `- patch: ${ctx.patch}`,
      `- lane: ${ctx.lane ?? "-"}`,
      `- curated tips: ${ctx.tips.length}`,
      `- compact: ${args.compact}`,
      `- prompt tokens: ${s.promptTokens}, output tokens: ${s.outputTokens}, ${s.tokensPerSecond.toFixed(1)} tok/s, total ${s.totalSeconds.toFixed(1)}s`,
      "",
      "## 답변",
      "",
      result.content,
      "",
      "## 프롬프트",
      "",
      "```",
      messages[1].content,
      "```",
      "",
    ].join("\n");
    fs.writeFileSync(file, header, "utf8");
    console.error(`저장: ${path.relative(process.cwd(), file)}`);
  }
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirectRun) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
