import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpellTooltip, replaceVariable } from "../src/lib/spellTooltipParser";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";
import type { ChampionSpell } from "../src/types";
import {
  containsResolvedValue,
  countBy,
  delay,
  descriptionBody,
  formatRows,
  jaccard,
  mapConcurrent,
  readJson,
  type ResearchLocale,
} from "./lolps-research-utils";

type Locale = ResearchLocale;
type SpellSlot = "q" | "w" | "e" | "r";

interface VersionInfo {
  version: string;
  ddragonVersion: string;
  cdragonVersion: string | null;
}

interface ChampionFile {
  champion: {
    id: string;
    key: string;
    spells: ChampionSpell[];
  };
}

interface SpellDataFile {
  spellData: Record<string, CommunityDragonSpellData>;
}

interface LolpsResponse {
  data?: Record<string, unknown> & { championId?: number };
}

interface TokenFinding {
  champion: string;
  championId: number;
  slot: SpellSlot;
  locale: Locale;
  token: string;
  calculationType: string;
  resolved: string | null;
  foundInLolps: boolean;
  lolpsBody: string;
}

interface SpellFinding {
  champion: string;
  championId: number;
  slot: SpellSlot;
  locale: Locale;
  similarity: number;
  lolpsBody: string;
  parserBody: string;
}

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..");
const cacheRoot = path.join(projectRoot, "research/.cache/lolps");
const reportRoot = path.join(projectRoot, "research");
const refresh = process.argv.includes("--refresh");
const slots: SpellSlot[] = ["q", "w", "e", "r"];
const locales: Locale[] = ["en_US", "ko_KR"];

async function fetchLolps(championId: number, cacheDir: string): Promise<LolpsResponse> {
  const cachePath = path.join(cacheDir, `${championId}.json`);
  if (!refresh) {
    try {
      return await readJson<LolpsResponse>(cachePath);
    } catch {
      // Cache miss: fetch below.
    }
  }

  const url = `https://lol.ps/api/champ/${championId}/basic-info.json`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "cooldown-tooltip-research/1.0" },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const payload = (await response.json()) as LolpsResponse;
      await fs.writeFile(cachePath, `${JSON.stringify(payload, null, 2)}\n`);
      return payload;
    } catch (error) {
      lastError = error;
      await delay(attempt * 300);
    }
  }
  throw new Error(`lol.ps ${championId} fetch failed: ${String(lastError)}`);
}

function tokensFrom(tooltip: string | undefined): string[] {
  if (!tooltip) return [];
  return [...tooltip.matchAll(/\{\{([^}]+)}}/g)].map((match) => match[1].trim());
}

function calculationType(token: string, data: CommunityDragonSpellData): string {
  const baseToken = token.replace(/^([A-Za-z_][A-Za-z0-9_]*)(?:\.\d+)(.*)$/, "$1$2");
  const variable = baseToken.split(/[+*/-]/, 1)[0].trim().toLocaleLowerCase();
  if (variable.startsWith("spell.")) return "CrossSpellReference";
  const entry = Object.entries(data.mSpellCalculations ?? {}).find(
    ([key]) => key.toLocaleLowerCase() === variable
  );
  if (entry) {
    const types = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.__type === "string") types.add(record.__type);
        Object.values(record).forEach(visit);
      }
    };
    visit(entry[1]);
    return [...types].join(" > ");
  }
  const hasDataValue = Object.keys(data.DataValues ?? {}).some(
    (key) => key.toLocaleLowerCase() === variable
  );
  if (hasDataValue) return "DataValue";
  if (/^[ef]\d+(?:\.\d+)?$/i.test(variable)) return "EffectAlias";
  return "missing";
}

function resolveToken(
  token: string,
  spell: ChampionSpell,
  data: CommunityDragonSpellData,
  locale: Locale
): string | null {
  if (/spellmodifierdescriptionappend|gamemodeinteger|Spell_.*Tooltip/i.test(token)) {
    return null;
  }
  const withoutPrecision = token.replace(
    /^([A-Za-z_][A-Za-z0-9_]*)\.\d+(.*)$/,
    "$1$2"
  );
  return replaceVariable(withoutPrecision, spell, data, locale);
}

async function main(): Promise<void> {
  const version = await readJson<VersionInfo>(path.join(projectRoot, "public/data/version.json"));
  const versionDir = path.join(projectRoot, "public/data", version.version);
  const championsDir = path.join(versionDir, "champions");
  const cacheDir = path.join(cacheRoot, version.version);
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.mkdir(reportRoot, { recursive: true });

  const files = (await fs.readdir(championsDir))
    .filter((name) => name.endsWith("-en_US.json"))
    .sort();
  const champions = await Promise.all(files.map(async (name) => {
    const enFile = await readJson<ChampionFile>(path.join(championsDir, name));
    const koFile = await readJson<ChampionFile>(
      path.join(championsDir, name.replace("-en_US.json", "-ko_KR.json"))
    );
    return {
      id: enFile.champion.id,
      numericId: Number.parseInt(enFile.champion.key, 10),
      spells: {
        en_US: enFile.champion.spells,
        ko_KR: koFile.champion.spells,
      },
    };
  }));

  const failures: Array<{ champion: string; championId: number; error: string }> = [];
  const lolpsById = new Map<number, LolpsResponse>();
  await mapConcurrent(champions, 4, async (champion) => {
    try {
      lolpsById.set(champion.numericId, await fetchLolps(champion.numericId, cacheDir));
    } catch (error) {
      failures.push({
        champion: champion.id,
        championId: champion.numericId,
        error: String(error),
      });
    }
    await delay(80);
  });

  const tokens: TokenFinding[] = [];
  const spells: SpellFinding[] = [];
  for (const champion of champions) {
    const lolps = lolpsById.get(champion.numericId)?.data;
    if (!lolps) continue;
    const cdragon = await readJson<SpellDataFile>(
      path.join(versionDir, "spells", `${champion.id}.json`)
    );

    for (const [index, slot] of slots.entries()) {
      for (const locale of locales) {
        const spell = champion.spells[locale][index];
        if (!spell) continue;
        const spellData = cdragon.spellData[spell.id] ?? cdragon.spellData[String(index)] ?? {};
        const suffix = locale === "ko_KR" ? "Kr" : "Us";
        const lolpsDescription = String(lolps[`${slot}Desc${suffix}`] ?? "");
        const lolpsBody = descriptionBody(lolpsDescription, locale);
        const parserBody = descriptionBody(
          parseSpellTooltip(spell.tooltip, spell, spellData, locale),
          locale
        );
        spells.push({
          champion: champion.id,
          championId: champion.numericId,
          slot,
          locale,
          similarity: jaccard(lolpsBody, parserBody),
          lolpsBody,
          parserBody,
        });

        for (const token of tokensFrom(spell.tooltip)) {
          const resolved = resolveToken(token, spell, spellData, locale);
          tokens.push({
            champion: champion.id,
            championId: champion.numericId,
            slot,
            locale,
            token,
            calculationType: calculationType(token, spellData),
            resolved,
            foundInLolps: containsResolvedValue(lolpsBody, resolved),
            lolpsBody,
          });
        }
      }
    }
  }

  const meaningfulTokens = tokens.filter(
    ({ token }) => !/spellmodifierdescriptionappend|gamemodeinteger|Spell_.*Tooltip/i.test(token)
  );
  const unresolved = meaningfulTokens.filter(({ resolved }) => resolved === null);
  const resolved = meaningfulTokens.filter(({ resolved }) => resolved !== null);
  const matched = resolved.filter(({ foundInLolps }) => foundInLolps);
  const mismatched = resolved.filter(({ foundInLolps }) => !foundInLolps);
  const lowestSimilarity = [...spells].sort((a, b) => a.similarity - b.similarity).slice(0, 30);
  const aggregate = {
    generatedAt: new Date().toISOString(),
    sourceVersion: version,
    championCount: champions.length,
    lolpsSuccessCount: lolpsById.size,
    failures,
    spellSamples: spells.length,
    tokenSamples: meaningfulTokens.length,
    resolvedTokenSamples: resolved.length,
    unresolvedTokenSamples: unresolved.length,
    resolvedValuesFoundInLolps: matched.length,
    averageTextSimilarity: spells.reduce((sum, item) => sum + item.similarity, 0) / spells.length,
    unresolvedTokens: countBy(unresolved, ({ token }) => token.toLocaleLowerCase()),
    mismatchedTokens: countBy(mismatched, ({ token }) => token.toLocaleLowerCase()),
    unresolvedCalculationTypes: countBy(unresolved, ({ calculationType: type }) => type),
    resolvedCalculationTypes: countBy(resolved, ({ calculationType: type }) => type),
    lowestSimilarity,
    unresolvedExamples: unresolved.slice(0, 100),
    mismatchedExamples: mismatched.slice(0, 100),
  };
  await fs.writeFile(
    path.join(reportRoot, "lolps-tooltip-analysis.json"),
    `${JSON.stringify(aggregate, null, 2)}\n`
  );

  const unresolvedRows = aggregate.unresolvedTokens.slice(0, 25).map(([token, count]) => [token, count]);
  const typeRows = aggregate.unresolvedCalculationTypes.map(([type, count]) => [type, count]);
  const report = `# lol.ps 스킬 툴팁 역추적\n\n` +
    `생성 시각: ${aggregate.generatedAt}\n\n` +
    `## 결론\n\n` +
    `lol.ps 응답은 Data Dragon의 미완성 템플릿을 그대로 표시하지 않는다. 그러나 별도의 비공개 공식을 추측할 필요는 없다. Riot BIN의 DataValues와 mSpellCalculations가 계산 AST를 제공하며, 이를 현재 스키마대로 읽는 것이 핵심이다. lol.ps 원문은 연구용 검증 오라클로만 사용하고 제품/CI의 데이터 원천으로 사용하지 않는다.\n\n` +
    `이번 조사에서 생성기가 구형 필드명 mName/mValues를 기대해 현재 필드명 name/values를 전부 누락하고 있음을 확인했다. 이를 수정하자 해석 성공 표본은 1,076건에서 ${resolved.length}건으로 증가했다.\n\n` +
    `## 표본\n\n` +
    `- 패치 키: ${version.version} (Data Dragon ${version.ddragonVersion}, CommunityDragon ${version.cdragonVersion})\n` +
    `- 로컬 챔피언: ${champions.length}\n` +
    `- lol.ps 수집 성공: ${lolpsById.size}\n` +
    `- 비교한 언어별 스킬: ${spells.length}\n` +
    `- 의미 있는 변수 표본: ${meaningfulTokens.length}\n` +
    `- 우리 파서 해석 성공: ${resolved.length}\n` +
    `- 미해석: ${unresolved.length}\n` +
    `- 해석값의 lol.ps 수치 포함: ${matched.length}\n` +
    `- 해석했지만 수치 불일치: ${mismatched.length}\n` +
    `- 평균 단어 집합 유사도: ${(aggregate.averageTextSimilarity * 100).toFixed(1)}%\n\n` +
    `## 발견한 규칙\n\n` +
    `1. DataValues의 현재 원소 스키마는 name/values이며 배열의 0번은 툴팁 스킬 레벨 범위에서 제외한다.\n` +
    `2. mSpellCalculations는 GameCalculation, GameCalculationModified, GameCalculationConditional 루트와 재귀 FormulaPart AST로 해석한다.\n` +
    `3. mDisplayAsPercent, mMultiplier, mPrecision은 계산 후 표시 단계에 적용한다.\n` +
    `4. spell.<spell-id>:<variable>은 같은 챔피언의 다른 스킬 데이터를 참조한다. 현재 미해석의 가장 큰 부류다.\n` +
    `5. fN/eN은 효과 배열 또는 클라이언트 포맷 인자의 별칭이므로 일반 DataValue와 분리해 해석한다.\n` +
    `6. 버프 개수, 조건 분기, 쿨다운 배율처럼 런타임 상태가 필요한 식은 단일 숫자로 확정하지 않고 조건/범위 구조로 보존한다.\n\n` +
    `## 많이 남은 변수\n\n| 변수 | 건수 |\n| --- | ---: |\n${formatRows(unresolvedRows)}\n\n` +
    `## 미해석 계산 유형\n\n| 유형 | 건수 |\n| --- | ---: |\n${formatRows(typeRows)}\n\n` +
    `## 자주 불일치한 변수\n\n| 변수 | 건수 |\n| --- | ---: |\n${formatRows(aggregate.mismatchedTokens.slice(0, 25).map(([token, count]) => [token, count]))}\n\n` +
    `## 해석 원칙\n\n` +
    `1. 언어별 문장은 번역 원문이므로 텍스트 전체 일치보다 각 변수의 수치 시그니처를 우선 비교한다.\n` +
    `2. 비용과 쿨다운은 lol.ps가 본문 뒤에 붙이므로 본문 비교에서 제외한다.\n` +
    `3. 불일치는 즉시 override로 만들지 않고 계산 파트 유형별 공통 규칙을 먼저 찾는다.\n` +
    `4. lol.ps 자체 오류 가능성이 있으므로 동일 수치를 Riot 원본 및 패치 노트와 교차 확인한다.\n\n` +
    `## lol.ps를 절대 정답으로 사용할 수 없는 이유\n\n` +
    `전체 표본에는 명백한 오타와 언어별 불일치가 있다. 예를 들어 알리스타 Q의 60/100/140/180/220이 60/100/450/180/220으로 기록되어 있고, 아칼리 W 영문은 2초 이동 속도 감소 시간을 스킬 레벨값으로 잘못 표시한다. 따라서 lol.ps 일치는 회귀 신호이지 정답 판정이 아니다. Riot BIN을 1차 원천으로 두고 불일치만 사람이 확인해야 한다.\n\n` +
    `## 구현 우선순위\n\n` +
    `1. 현재 DataValues 스키마 회귀 테스트 유지\n` +
    `2. 교차 스킬 참조 resolver 추가\n` +
    `3. SumOfSubParts, StatBySubPart, ClampSubParts 계산 파트 추가\n` +
    `4. GameCalculationConditional을 조건 구조로 정규화\n` +
    `5. 생성 단계에서 본문/비용/쿨다운/계수/미해결 진단을 구조 데이터로 저장\n\n` +
    `## 출처\n\n` +
    `- [lol.ps champion basic-info API](https://lol.ps/api/champ/42/basic-info.json)\n` +
    `- [CommunityDragon champion data](https://raw.communitydragon.org/16.17/plugins/rcp-be-lol-game-data/global/ko_kr/v1/champions/42.json)\n` +
    `- [CommunityDragon data extraction project](https://github.com/CommunityDragon/CDTB)\n` +
    `- [Reverse-engineered calculation structures](https://github.com/moonshadow565/calcrev/blob/master/calc_ida.h)\n` +
    `- [Riot Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon)\n`;
  await fs.writeFile(path.join(reportRoot, "lolps-tooltip-analysis.md"), report);

  console.log(`lol.ps: ${lolpsById.size}/${champions.length}`);
  console.log(`spells: ${spells.length}, tokens: ${meaningfulTokens.length}`);
  console.log(`resolved: ${resolved.length}, unresolved: ${unresolved.length}`);
  console.log(`matched numeric signatures: ${matched.length}/${resolved.length}`);
}

await main();
