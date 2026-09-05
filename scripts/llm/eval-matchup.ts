/**
 * 모델/컨텍스트 조합별 상성 답변 품질 간이 평가
 *
 * 채점 네 가지
 * 1. 기대 키워드 그룹 적중률 (그룹 안에서 하나라도 포함되면 적중)
 * 2. 금지 표현 미출현 (존재하지 않는 아이템, 낡은 표기 등)
 * 3. **문맥 밖 이름** — 답변에 나온 아이템·룬·주문 이름 중 프롬프트에 없던 것.
 *    자료 밖에서 끌어온 추천이므로 근거가 없다. 모델을 고를 때 가장 중요한 지표다.
 * 4. **형식 위반** — 요구한 소제목 누락, "1순위" 같은 내부 표기 복사, 프롬프트 블록 되풀이.
 * 5. **스킬 소유자 오류** — "조심할 스킬" 구간에 내 챔피언의 스킬 이름이 적혔는지.
 *    소형 모델은 슬롯 문자만 보고 이름을 자기 챔피언 것에서 가져다 붙인다.
 *    키워드 적중률로는 전혀 잡히지 않으면서 조언의 결론을 통째로 뒤집는 오류다.
 *
 * 정량 지표가 아니라 "유의미한가" 를 빠르게 훑는 용도.
 *
 * 사용: npm run llm:eval -- --models gemma4:e2b,gemma4:12b [--cases scripts/llm/eval-cases.json] [--only MonkeyKing]
 */
import * as fs from "fs";
import * as path from "path";
import { buildMatchupContext } from "./matchup-cli";
import { loadStaticData } from "./lib/data";
import { ollamaChat, type ChatMessage, type ChatStats } from "./lib/ollama";
import { buildCodeAnswer } from "./lib/codeAnswer";
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
  /** 모델을 아예 부르지 않고 코드만으로 답한다. 모델이 더하는 값을 재는 대조군. */
  codeOnly?: boolean;
}

interface EvalRow {
  caseId: string;
  model: string;
  variant: string;
  hits: number;
  total: number;
  forbidden: string[];
  /** 답변에는 있으나 프롬프트에는 없던 아이템·룬·주문 이름 */
  offContext: string[];
  /** 형식 위반 사유 */
  formatIssues: string[];
  /** "조심할 스킬" 에 잘못 실린 내 챔피언 스킬 */
  wrongOwner: string[];
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
  "code-only": {
    label: "code-only(모델없음)",
    curated: true,
    compact: true,
    profile: "web",
    codeOnly: true,
  },
};

/** 답변에 나와야 하는 소제목 (분할 호출의 서술 구간 기준) */
const REQUIRED_HEADINGS = ["## 라인전 구도", "## 조심할 스킬", "## 콤보와 플레이 팁"];

/**
 * 패치 데이터의 아이템·룬·주문 이름 전체.
 * 답변에 이 중 하나가 나왔는데 프롬프트에 없었다면 모델이 자료 밖에서 끌어온 것이다.
 */
function loadKnownNames(): Set<string> {
  const data = loadStaticData("ko_KR");
  const names = new Set<string>();
  for (const item of data.items.items) {
    if (item.availableOnMap11 && item.purchasable !== false && item.inStore !== false) {
      names.add(item.name);
    }
  }
  for (const rune of data.runes.runes) names.add(rune.name);
  for (const shard of data.runes.statShards) names.add(shard.name);
  for (const spell of data.summoners.spells) names.add(spell.name);
  // 두 글자 이하는 일반 명사와 겹쳐 오탐이 난다
  for (const n of [...names]) if (n.length <= 2) names.delete(n);
  return names;
}

/**
 * "조심할 스킬" 구간에 내 챔피언의 스킬 이름이 등장했는지 본다.
 * 상대에게 같은 이름이 있으면 판정할 수 없으므로 제외한다.
 */
function findWrongOwnerSkills(
  answer: string,
  me: { name: string; spells: Array<{ slot: string; name: string }> },
  enemy: { spells: Array<{ slot: string; name: string }> },
): string[] {
  const start = answer.indexOf("## 조심할 스킬");
  if (start < 0) return [];
  const end = answer.indexOf("\n## ", start + 1);
  const section = answer.slice(start, end < 0 ? undefined : end);

  const parts = (spells: Array<{ slot: string; name: string }>) =>
    spells.flatMap((sp) =>
      sp.name.split("/").map((p) => ({ slot: sp.slot, name: p.trim() })),
    );
  const enemyNames = new Set(parts(enemy.spells).map((p) => p.name));
  const found: string[] = [];
  for (const { slot, name } of parts(me.spells)) {
    if (name.length < 2 || enemyNames.has(name)) continue;
    if (section.includes(name)) found.push(`${slot} ${name}`);
  }
  return found;
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const knownNames = loadKnownNames();
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
        // 문맥 밖 이름 판정의 기준. 분할 호출은 구간마다 프롬프트가 다르므로 전부 모아야 한다.
        // 마지막 구간만 보면 앞 구간에서 제시한 아이템이 "자료 밖"으로 잘못 잡힌다.
        let promptText = renderDecidedSections(ctx);
        if (variant.codeOnly) {
          // 모델을 부르지 않는다. 소요 시간과 토큰은 0 이다.
          messages = [];
          text = buildCodeAnswer(ctx);
          stats = {
            model,
            promptTokens: 0,
            outputTokens: 0,
            promptSeconds: 0,
            generateSeconds: 0,
            totalSeconds: 0,
            tokensPerSecond: 0,
            firstTokenSeconds: 0,
          };
        } else if (variant.split) {
          const sections = buildSections(ctx);
          const parts: string[] = [renderDecidedSections(ctx)];
          let maxPrompt = 0;
          let outputSum = 0;
          let secondsSum = 0;
          let ttft = 0;
          let speedSum = 0;
          for (const section of sections) {
            promptText += "\n" + section.messages.map((m) => m.content).join("\n");
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
          promptText += "\n" + messages.map((m) => m.content).join("\n");
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

        // 자료 밖에서 끌어온 이름을 찾는다.
        const offContext = [...knownNames]
          .filter((name) => text.includes(name) && !promptText.includes(name))
          .sort((a, b) => b.length - a.length)
          // 긴 이름에 포함된 짧은 이름은 중복이므로 제외 (예: "장화" 와 "판금 장화")
          .filter((name, _i, all) => !all.some((other) => other !== name && other.includes(name)));

        const wrongOwner = findWrongOwnerSkills(text, ctx.me, ctx.enemy);

        const formatIssues: string[] = [];
        for (const heading of REQUIRED_HEADINGS) {
          if (!text.includes(heading)) formatIssues.push(`소제목 누락 ${heading}`);
        }
        if (/\d순위/.test(text)) formatIssues.push("내부 표기(N순위) 복사");
        if (/\[(패치|내 챔피언|상대 챔피언|권장안 초안|지식 카드|통계)\]/.test(text)) {
          formatIssues.push("프롬프트 블록 되풀이");
        }
        const row: EvalRow = {
          caseId: c.id,
          model,
          variant: variant.label,
          hits,
          total: c.expectGroups.length,
          forbidden,
          offContext,
          formatIssues,
          wrongOwner,
          promptTokens: stats.promptTokens,
          outputTokens: stats.outputTokens,
          tokensPerSecond: stats.tokensPerSecond,
          totalSeconds: stats.totalSeconds,
          firstTokenSeconds: stats.firstTokenSeconds,
          missed,
        };
        rows.push(row);
        process.stderr.write(
          `${hits}/${c.expectGroups.length}${forbidden.length ? ` 금지 ${forbidden.length}` : ""}${offContext.length ? ` 문맥밖 ${offContext.length}` : ""}${wrongOwner.length ? ` 소유자오류 ${wrongOwner.length}` : ""}${formatIssues.length ? ` 형식 ${formatIssues.length}` : ""} (${stats.totalSeconds.toFixed(0)}s, ${stats.tokensPerSecond.toFixed(0)} tok/s)\n`,
        );

        const file = path.join(outDir, `${c.id}_${model.replace(/[:/]/g, "-")}_${variant.label}.md`);
        fs.writeFileSync(
          file,
          [
            `# ${c.id} — ${model} — ${variant.label}`,
            "",
            `적중 ${hits}/${c.expectGroups.length}, 누락: ${missed.join(", ") || "없음"}, 금지 표현: ${forbidden.join(", ") || "없음"}`,
            `문맥 밖 이름: ${offContext.join(", ") || "없음"} / 형식 위반: ${formatIssues.join(", ") || "없음"}`,
            `조심할 스킬에 잘못 실린 내 스킬: ${wrongOwner.join(", ") || "없음"}`,
            `prompt ${stats.promptTokens} tok / output ${stats.outputTokens} tok / ${stats.tokensPerSecond.toFixed(1)} tok/s / ${stats.totalSeconds.toFixed(1)}s`,
            "",
            "## 답변",
            "",
            text,
            "",
            "## 프롬프트",
            "",
            "```",
            messages[1]?.content ?? "(모델 호출 없음)",
            "```",
          ].join("\n"),
          "utf8",
        );
      }
    }
  }

  const summary = [
    "| case | model | hits | 금지 | 문맥밖 | 소유자오류 | 형식 | prompt tok | out tok | tok/s | 첫 토큰 s | 총 s | missed |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.caseId} | ${r.model} | ${r.hits}/${r.total} | ${r.forbidden.join(", ") || "-"} | ${r.offContext.join(", ") || "-"} | ${r.wrongOwner.join(", ") || "-"} | ${r.formatIssues.length || "-"} | ${r.promptTokens} | ${r.outputTokens} | ${r.tokensPerSecond.toFixed(1)} | ${r.firstTokenSeconds.toFixed(1)} | ${r.totalSeconds.toFixed(0)} | ${r.missed.join("; ") || "-"} |`,
    ),
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "summary.md"), `# 상성 코치 평가 ${stamp}\n\n${summary}\n`, "utf8");
  console.log(`\n${summary}\n\n결과 디렉터리: ${path.relative(process.cwd(), outDir)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
