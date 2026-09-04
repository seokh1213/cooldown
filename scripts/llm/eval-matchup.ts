/**
 * 모델/컨텍스트 조합별 상성 답변 품질 간이 평가
 *
 * 채점 = 기대 키워드 그룹 적중률 (그룹 안에서 하나라도 포함되면 적중)
 *      + 금지 표현(존재하지 않는 아이템 등) 미출현
 * 정량 지표가 아니라 "유의미한가" 를 빠르게 훑는 용도.
 *
 * 사용: npm run llm:eval -- --models gemma4:e2b,gemma4:12b [--cases scripts/llm/eval-cases.json] [--only MonkeyKing]
 */
import * as fs from "fs";
import * as path from "path";
import { buildMatchupContext } from "./matchup-cli";
import { ollamaChat, type ChatMessage, type ChatStats } from "./lib/ollama";
import { buildMessages, buildSections, renderDecidedSections } from "./lib/prompt";

interface EvalCase {
  id: string;
  me: string;
  enemy: string;
  lane?: string;
  /** 각 그룹 중 하나 이상 등장해야 적중 */
  expectGroups: string[][];
  /** 등장하면 감점 */
  forbid?: string[];
}

interface Variant {
  label: string;
  curated: boolean;
  compact: boolean;
  profile?: "full" | "compact" | "web";
  /** 확정 구간은 코드가 렌더링하고 서술 구간만 두 번 호출 */
  split?: boolean;
}

interface EvalRow {
  caseId: string;
  model: string;
  variant: string;
  hits: number;
  total: number;
  forbidden: string[];
  promptTokens: number;
  outputTokens: number;
  tokensPerSecond: number;
  totalSeconds: number;
  firstTokenSeconds: number;
  missed: string[];
}

function parse(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    models: (get("--models") ?? "gemma4:e2b").split(",").map((s) => s.trim()).filter(Boolean),
    casesFile: get("--cases") ?? path.join("scripts", "llm", "eval-cases.json"),
    only: get("--only"),
    variants: (get("--variants") ?? "curated,no-curated").split(","),
  };
}

const VARIANTS: Record<string, Variant> = {
  curated: { label: "curated", curated: true, compact: false },
  "no-curated": { label: "no-curated", curated: false, compact: false },
  compact: { label: "compact+curated", curated: true, compact: true },
  web: { label: "web(4k예산)", curated: true, compact: true, profile: "web" },
  split: { label: "split(2회호출)", curated: true, compact: true, profile: "web", split: true },
};

async function main() {
  const opts = parse(process.argv.slice(2));
  const cases = (JSON.parse(fs.readFileSync(opts.casesFile, "utf8")) as EvalCase[]).filter(
    (c) => !opts.only || c.id.includes(opts.only) || c.me === opts.only,
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.resolve("research", "llm-evals", stamp);
  fs.mkdirSync(outDir, { recursive: true });

  const rows: EvalRow[] = [];
  for (const model of opts.models) {
    for (const variantKey of opts.variants) {
      const variant = VARIANTS[variantKey];
      if (!variant) throw new Error(`알 수 없는 variant: ${variantKey}`);
      for (const c of cases) {
        const { ctx } = buildMatchupContext({
          me: c.me,
          enemy: c.enemy,
          lane: c.lane,
          lang: "ko_KR",
          compact: variant.compact,
          curated: variant.curated,
          profile: variant.profile,
        });
        process.stderr.write(`▶ ${model} / ${variant.label} / ${c.id} … `);

        // 분할 모드는 확정 구간(코드 렌더링) + 서술 구간 2회 호출을 합쳐 채점한다.
        // 컨텍스트 상한을 결정하는 값은 호출당 최대 프롬프트이므로 그것을 기록한다.
        let messages: ChatMessage[];
        let text: string;
        let stats: ChatStats;
        if (variant.split) {
          const sections = buildSections(ctx);
          const parts: string[] = [renderDecidedSections(ctx)];
          let maxPrompt = 0;
          let outputSum = 0;
          let secondsSum = 0;
          let ttft = 0;
          let speedSum = 0;
          for (const section of sections) {
            const r = await ollamaChat({ model, messages: section.messages, temperature: 0.2 });
            parts.push(r.content);
            maxPrompt = Math.max(maxPrompt, r.stats.promptTokens);
            outputSum += r.stats.outputTokens;
            secondsSum += r.stats.totalSeconds;
            ttft = Math.max(ttft, r.stats.firstTokenSeconds);
            speedSum += r.stats.tokensPerSecond;
          }
          messages = sections[sections.length - 1].messages;
          text = parts.join("\n\n");
          stats = {
            model,
            promptTokens: maxPrompt,
            outputTokens: outputSum,
            promptSeconds: 0,
            generateSeconds: 0,
            totalSeconds: secondsSum,
            tokensPerSecond: speedSum / sections.length,
            firstTokenSeconds: ttft,
          };
        } else {
          messages = buildMessages(ctx);
          const result = await ollamaChat({ model, messages, temperature: 0.2 });
          text = result.content;
          stats = result.stats;
        }

        const missed: string[] = [];
        let hits = 0;
        for (const group of c.expectGroups) {
          if (group.some((kw) => text.includes(kw))) hits += 1;
          else missed.push(group.join("|"));
        }
        const forbidden = (c.forbid ?? []).filter((kw) => text.includes(kw));
        const row: EvalRow = {
          caseId: c.id,
          model,
          variant: variant.label,
          hits,
          total: c.expectGroups.length,
          forbidden,
          promptTokens: stats.promptTokens,
          outputTokens: stats.outputTokens,
          tokensPerSecond: stats.tokensPerSecond,
          totalSeconds: stats.totalSeconds,
          firstTokenSeconds: stats.firstTokenSeconds,
          missed,
        };
        rows.push(row);
        process.stderr.write(
          `${hits}/${c.expectGroups.length}${forbidden.length ? ` 금지 ${forbidden.length}` : ""} (${stats.totalSeconds.toFixed(0)}s, ${stats.tokensPerSecond.toFixed(0)} tok/s)\n`,
        );

        const file = path.join(outDir, `${c.id}_${model.replace(/[:/]/g, "-")}_${variant.label}.md`);
        fs.writeFileSync(
          file,
          [
            `# ${c.id} — ${model} — ${variant.label}`,
            "",
            `적중 ${hits}/${c.expectGroups.length}, 누락: ${missed.join(", ") || "없음"}, 금지 표현: ${forbidden.join(", ") || "없음"}`,
            `prompt ${stats.promptTokens} tok / output ${stats.outputTokens} tok / ${stats.tokensPerSecond.toFixed(1)} tok/s / ${stats.totalSeconds.toFixed(1)}s`,
            "",
            "## 답변",
            "",
            text,
            "",
            "## 프롬프트",
            "",
            "```",
            messages[1].content,
            "```",
          ].join("\n"),
          "utf8",
        );
      }
    }
  }

  const summary = [
    "| case | model | variant | hits | forbidden | prompt tok | out tok | tok/s | 첫 토큰 s | 총 s | missed |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.caseId} | ${r.model} | ${r.variant} | ${r.hits}/${r.total} | ${r.forbidden.join(", ") || "-"} | ${r.promptTokens} | ${r.outputTokens} | ${r.tokensPerSecond.toFixed(1)} | ${r.firstTokenSeconds.toFixed(1)} | ${r.totalSeconds.toFixed(0)} | ${r.missed.join("; ") || "-"} |`,
    ),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "summary.md"), `# 상성 코치 평가 ${stamp}\n\n${summary}\n`, "utf8");
  console.log(`\n${summary}\n\n결과 디렉터리: ${path.relative(process.cwd(), outDir)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
