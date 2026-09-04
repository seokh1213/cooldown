import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpellTooltip, replaceVariable } from "../src/lib/spellTooltipParser";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";
import type { ChampionSpell } from "../src/types";
import {
  loadCDragonLocales,
  loadDDragonLocales,
  loadLolps,
  localeConfigs,
  type VersionInfo,
} from "./lolps-research-sources";
import {
  containsResolvedValue,
  countBy,
  delay,
  descriptionBody,
  formatRows,
  jaccard,
  mapConcurrent,
  numericSignature,
  readJson,
  type ResearchLocale,
} from "./lolps-research-utils";

type SpellSlot = "q" | "w" | "e" | "r";

interface SpellDataFile {
  spellData: Record<string, CommunityDragonSpellData>;
}

interface TokenFinding {
  champion: string;
  championId: number;
  slot: SpellSlot;
  locale: ResearchLocale;
  token: string;
  calculationType: string;
  resolved: string | null;
  foundInLolps: boolean;
}

interface SpellFinding {
  champion: string;
  championId: number;
  slot: SpellSlot;
  locale: ResearchLocale;
  lolpsName: string;
  ddragonName: string;
  cdragonName: string;
  nameMatchesDDragon: boolean;
  nameMatchesCDragon: boolean;
  similarity: number;
  ddragonSkeletonSimilarity: number;
  cdragonSkeletonSimilarity: number;
  sourceSkeletonExact: boolean;
  sourceSkeletonSimilarity: number;
  lolpsBody: string;
  parserBody: string;
  ddragonTokens: string[];
  cdragonTokens: string[];
}

interface CrossLocaleFinding {
  champion: string;
  championId: number;
  slot: SpellSlot;
  consistent: boolean;
  cdragonTokensConsistent: boolean;
  ddragonTokensConsistent: boolean;
  signatures: Record<ResearchLocale, string[]>;
}

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(currentFile), "..");
const cacheRoot = path.join(projectRoot, "research/.cache/lolps");
const reportRoot = path.join(projectRoot, "research");
const refresh = process.argv.includes("--refresh");
const slots: SpellSlot[] = ["q", "w", "e", "r"];

function tokensFrom(template: string | undefined): string[] {
  if (!template) return [];
  return [...template.matchAll(/\{\{([^}]+)}}/g)].map((match) => match[1].trim());
}

function cdragonTokensFrom(template: string | undefined): string[] {
  if (!template) return [];
  return [...template.matchAll(/@([^@]+)@/g)].map((match) => match[1].trim());
}

function normalizedName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s'’·.-]+/g, "");
}

function tokenSetKey(tokens: string[]): string {
  return [...new Set(tokens.map((token) => token.toLocaleLowerCase()))].sort().join("|");
}

function templateSkeleton(value: string, locale: ResearchLocale): string {
  return descriptionBody(
    value.replace(/\{\{[^}]+}}/g, " ").replace(/@[^@]+@/g, " "),
    locale
  );
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
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.__type === "string") types.add(record.__type);
        Object.values(record).forEach(visit);
      }
    };
    visit(entry[1]);
    return [...types].join(" > ");
  }
  if (Object.keys(data.DataValues ?? {}).some((key) => key.toLocaleLowerCase() === variable)) {
    return "DataValue";
  }
  if (/^[ef]\d+(?:\.\d+)?$/i.test(variable)) return "EffectAlias";
  return "missing";
}

function resolveToken(
  token: string,
  spell: ChampionSpell,
  data: CommunityDragonSpellData,
  locale: "en_US" | "ko_KR"
): string | null {
  if (/spellmodifierdescriptionappend|gamemodeinteger|Spell_.*Tooltip/i.test(token)) return null;
  const withoutPrecision = token.replace(/^([A-Za-z_][A-Za-z0-9_]*)\.\d+(.*)$/, "$1$2");
  return replaceVariable(withoutPrecision, spell, data, locale);
}

function localeRows(
  spells: SpellFinding[],
  tokens: TokenFinding[]
): Array<Array<string | number>> {
  return localeConfigs.map(({ locale, label }) => {
    const localeSpells = spells.filter((spell) => spell.locale === locale);
    const localeTokens = tokens.filter((token) => token.locale === locale);
    const resolved = localeTokens.filter((token) => token.resolved !== null);
    return [
      label,
      localeSpells.length,
      `${(100 * localeSpells.filter((spell) => spell.nameMatchesDDragon).length / localeSpells.length).toFixed(1)}%`,
      `${(100 * localeSpells.filter((spell) => spell.nameMatchesCDragon).length / localeSpells.length).toFixed(1)}%`,
      `${(100 * localeSpells.reduce((sum, spell) => sum + spell.similarity, 0) / localeSpells.length).toFixed(1)}%`,
      `${(100 * localeSpells.reduce((sum, spell) => sum + spell.ddragonSkeletonSimilarity, 0) / localeSpells.length).toFixed(1)}%`,
      `${(100 * localeSpells.reduce((sum, spell) => sum + spell.cdragonSkeletonSimilarity, 0) / localeSpells.length).toFixed(1)}%`,
      `${resolved.length}/${localeTokens.length}`,
      `${resolved.filter((token) => token.foundInLolps).length}/${resolved.length}`,
    ];
  });
}

async function main(): Promise<void> {
  const version = await readJson<VersionInfo>(path.join(projectRoot, "public/data/version.json"));
  if (!version.cdragonVersion) throw new Error("CommunityDragon version is required");
  const versionDir = path.join(projectRoot, "public/data", version.version);
  const cacheDir = path.join(cacheRoot, version.version);
  await fs.mkdir(reportRoot, { recursive: true });

  const ddragon = await loadDDragonLocales(version.ddragonVersion, cacheDir, refresh);
  const champions = Object.values(ddragon.en_US).sort((a, b) => a.id.localeCompare(b.id));
  const cdragon = await loadCDragonLocales(
    version.cdragonVersion,
    champions,
    cacheDir,
    refresh
  );
  const failures: Array<{ champion: string; championId: number; error: string }> = [];
  const lolpsById = new Map<number, Awaited<ReturnType<typeof loadLolps>>>();
  await mapConcurrent(champions, 6, async (champion) => {
    const championId = Number.parseInt(champion.key, 10);
    try {
      lolpsById.set(championId, await loadLolps(championId, cacheDir, refresh));
    } catch (error) {
      failures.push({ champion: champion.id, championId, error: String(error) });
    }
    await delay(30);
  });

  const tokens: TokenFinding[] = [];
  const spells: SpellFinding[] = [];
  const crossLocale: CrossLocaleFinding[] = [];
  for (const champion of champions) {
    const championId = Number.parseInt(champion.key, 10);
    const lolps = lolpsById.get(championId)?.data;
    if (!lolps) continue;
    const bin = await readJson<SpellDataFile>(
      path.join(versionDir, "spells", `${champion.id}.json`)
    );
    for (const [index, slot] of slots.entries()) {
      const signatures = {} as Record<ResearchLocale, string[]>;
      const cdragonTokenKeys: string[] = [];
      const ddragonTokenKeys: string[] = [];
      for (const config of localeConfigs) {
        const spell = ddragon[config.locale][champion.id]?.spells[index];
        const localized = cdragon.get(`${config.locale}:${champion.id}`);
        const cdragonSpell = localized?.spells.find((candidate) => candidate.spellKey === slot);
        if (!spell || !cdragonSpell) continue;
        const spellData = bin.spellData[spell.id] ?? bin.spellData[String(index)] ?? {};
        const lolpsDescription = String(lolps[`${slot}Desc${config.lolpsSuffix}`] ?? "");
        const lolpsBody = descriptionBody(lolpsDescription, config.locale);
        const ddragonSkeleton = templateSkeleton(spell.tooltip, config.locale);
        const cdragonSkeleton = templateSkeleton(
          cdragonSpell.dynamicDescription,
          config.locale
        );
        const parserBody = descriptionBody(
          parseSpellTooltip(spell.tooltip, spell, spellData, config.parserLocale),
          config.locale
        );
        const ddragonTokens = tokensFrom(spell.tooltip);
        const cdragonTokens = cdragonTokensFrom(cdragonSpell.dynamicDescription);
        ddragonTokenKeys.push(tokenSetKey(ddragonTokens));
        signatures[config.locale] = numericSignature(lolpsBody).sort();
        cdragonTokenKeys.push(tokenSetKey(cdragonTokens));
        const lolpsName = String(lolps[`${slot}Name${config.lolpsSuffix}`] ?? "");
        spells.push({
          champion: champion.id,
          championId,
          slot,
          locale: config.locale,
          lolpsName,
          ddragonName: spell.name,
          cdragonName: cdragonSpell.name,
          nameMatchesDDragon: normalizedName(lolpsName) === normalizedName(spell.name),
          nameMatchesCDragon: normalizedName(lolpsName) === normalizedName(cdragonSpell.name),
          similarity: jaccard(lolpsBody, parserBody),
          ddragonSkeletonSimilarity: jaccard(lolpsBody, ddragonSkeleton),
          cdragonSkeletonSimilarity: jaccard(lolpsBody, cdragonSkeleton),
          sourceSkeletonExact: ddragonSkeleton === cdragonSkeleton,
          sourceSkeletonSimilarity: jaccard(ddragonSkeleton, cdragonSkeleton),
          lolpsBody,
          parserBody,
          ddragonTokens,
          cdragonTokens,
        });
        for (const token of ddragonTokens) {
          if (/spellmodifierdescriptionappend|gamemodeinteger|Spell_.*Tooltip/i.test(token)) continue;
          const resolved = resolveToken(token, spell, spellData, config.parserLocale);
          tokens.push({
            champion: champion.id,
            championId,
            slot,
            locale: config.locale,
            token,
            calculationType: calculationType(token, spellData),
            resolved,
            foundInLolps: containsResolvedValue(lolpsBody, resolved),
          });
        }
      }
      const signatureKeys = localeConfigs.map(({ locale }) =>
        [...(signatures[locale] ?? [])].sort().join("|")
      );
      crossLocale.push({
        champion: champion.id,
        championId,
        slot,
        consistent: new Set(signatureKeys).size === 1,
        cdragonTokensConsistent: new Set(cdragonTokenKeys).size === 1,
        ddragonTokensConsistent: new Set(ddragonTokenKeys).size === 1,
        signatures,
      });
    }
  }

  const unresolved = tokens.filter(({ resolved }) => resolved === null);
  const resolved = tokens.filter(({ resolved }) => resolved !== null);
  const matched = resolved.filter(({ foundInLolps }) => foundInLolps);
  const inconsistent = crossLocale.filter(({ consistent }) => !consistent);
  const aggregate = {
    generatedAt: new Date().toISOString(),
    sourceVersion: version,
    locales: localeConfigs.map(({ locale }) => locale),
    championCount: champions.length,
    lolpsSuccessCount: lolpsById.size,
    spellSamples: spells.length,
    tokenSamples: tokens.length,
    resolvedTokenSamples: resolved.length,
    unresolvedTokenSamples: unresolved.length,
    resolvedValuesFoundInLolps: matched.length,
    crossLocaleNumericConsistent: crossLocale.length - inconsistent.length,
    crossLocaleNumericInconsistent: inconsistent.length,
    cdragonTokenConsistent: crossLocale.filter(({ cdragonTokensConsistent }) =>
      cdragonTokensConsistent
    ).length,
    ddragonTokenConsistent: crossLocale.filter(({ ddragonTokensConsistent }) =>
      ddragonTokensConsistent
    ).length,
    localeMetrics: localeRows(spells, tokens),
    templateAffinity: {
      ddragonCloser: spells.filter((spell) =>
        spell.ddragonSkeletonSimilarity > spell.cdragonSkeletonSimilarity
      ).length,
      cdragonCloser: spells.filter((spell) =>
        spell.cdragonSkeletonSimilarity > spell.ddragonSkeletonSimilarity
      ).length,
      equal: spells.filter((spell) =>
        spell.cdragonSkeletonSimilarity === spell.ddragonSkeletonSimilarity
      ).length,
      sourceSkeletonExact: spells.filter(({ sourceSkeletonExact }) => sourceSkeletonExact).length,
      averageSourceSkeletonSimilarity: spells.reduce(
        (sum, spell) => sum + spell.sourceSkeletonSimilarity,
        0
      ) / spells.length,
    },
    unresolvedCalculationTypes: countBy(unresolved, ({ calculationType: type }) => type),
    unresolvedTokens: countBy(unresolved, ({ token }) => token.toLocaleLowerCase()),
    sourceSkeletonMismatchExamples: spells
      .filter(({ sourceSkeletonExact }) => !sourceSkeletonExact)
      .map(({ champion, championId, slot, locale, sourceSkeletonSimilarity }) => ({
        champion,
        championId,
        slot,
        locale,
        sourceSkeletonSimilarity,
      })),
    inconsistentExamples: inconsistent.slice(0, 100),
    lowestSimilarity: [...spells].sort((a, b) => a.similarity - b.similarity).slice(0, 60),
    failures,
  };
  await fs.writeFile(
    path.join(reportRoot, "lolps-tooltip-analysis.json"),
    `${JSON.stringify(aggregate, null, 2)}\n`
  );

  const report = `# lol.ps 다국어 스킬 툴팁 역추적\n\n` +
    `생성 시각: ${aggregate.generatedAt}\n\n` +
    `## 직접 결론\n\n` +
    `lol.ps의 공개 챔피언 응답은 영어(Us), 한국어(Kr), 중국어(Cn) 완성 문장을 함께 제공한다. 세 언어의 DDragon 템플릿과 CDragon 현지화 템플릿을 같은 패치로 대조한 결과, 숫자 계산 규칙은 언어와 분리할 수 있다. 제품의 정답 원천은 언어 공통 Riot BIN 계산 AST로 두고, 각 언어 문장은 그 AST 결과를 삽입하는 렌더링 템플릿으로 취급해야 한다. lol.ps는 오류가 섞인 비교 오라클이지 원천 데이터가 아니다.\n\n` +
    `## 범위와 결과\n\n` +
    `- 패치: ${version.version} / DDragon ${version.ddragonVersion} / CDragon ${version.cdragonVersion}\n` +
    `- 챔피언: ${champions.length}, 언어: ${aggregate.locales.join(", ")}\n` +
    `- 언어별 Q/W/E/R 표본: ${spells.length}\n` +
    `- 변수 표본: ${tokens.length}, 해석 ${resolved.length}, 미해석 ${unresolved.length}\n` +
    `- 해석값이 lol.ps 숫자에 포함: ${matched.length}/${resolved.length}\n` +
    `- lol.ps 언어 간 숫자 집합 일치: ${aggregate.crossLocaleNumericConsistent}/${crossLocale.length}\n` +
    `- 언어 간 숫자 불일치: ${aggregate.crossLocaleNumericInconsistent}\n\n` +
    `- DDragon 변수 집합 언어 간 일치: ${aggregate.ddragonTokenConsistent}/${crossLocale.length}\n` +
    `- CDragon 변수 집합 언어 간 일치: ${aggregate.cdragonTokenConsistent}/${crossLocale.length}\n\n` +
    `## 언어별 비교\n\n` +
    `| 언어 | 스킬 | 이름=DDragon | 이름=CDragon | 렌더 본문 | DDragon 골격 | CDragon 골격 | 변수 해석 | lol.ps 수치 포함 |\n` +
    `| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n` +
    `${formatRows(aggregate.localeMetrics)}\n\n` +
    `## 역추적된 규칙\n\n` +
    `1. DDragon의 언어별 \`{{ token }}\` 이름은 같은 스킬에서 대부분 동일하므로 계산 전에 언어 중립 키로 정규화한다.\n` +
    `2. CDragon의 \`@Token@\`은 BIN의 DataValues와 mSpellCalculations가 사용하는 이름과 연결된다.\n` +
    `3. DataValues와 계산 AST를 한 번 해석한 뒤 언어별 DDragon/CDragon 템플릿에 주입한다. 언어마다 공식을 다시 구현하지 않는다.\n` +
    `4. 비용과 쿨다운은 CDragon의 cost/cooldown 템플릿 및 coefficient 배열을 별도 구조 필드로 보존한다.\n` +
    `5. 언어 간 숫자가 다르면 번역 차이로 넘기지 않고 Riot 원본, 패치 노트, 계산 AST 순으로 판정한다.\n` +
    `6. 런타임 상태가 필요한 조건식과 버프 기반 식은 단일 값으로 접지 않고 조건/범위 AST로 출력한다.\n\n` +
    `문장 골격 친화도는 DDragon 우세 ${aggregate.templateAffinity.ddragonCloser}, CDragon 우세 ${aggregate.templateAffinity.cdragonCloser}, 동률 ${aggregate.templateAffinity.equal}이다. 두 소스의 현지화 문장이 대체로 같은 클라이언트 원문에서 생성되므로 이 값만으로 lol.ps의 직접 입력 소스를 단정하지 않는다.\n\n` +
    `DDragon과 CDragon끼리의 문장 골격 완전 일치는 ${aggregate.templateAffinity.sourceSkeletonExact}/${spells.length}, 평균 유사도는 ${(aggregate.templateAffinity.averageSourceSkeletonSimilarity * 100).toFixed(1)}%다.\n\n` +
    `## 남은 계산 유형\n\n| 유형 | 건수 |\n| --- | ---: |\n` +
    `${formatRows(aggregate.unresolvedCalculationTypes)}\n\n` +
    `## 구현 권고\n\n` +
    `생성기는 \`localizedTemplates\`와 언어 공통 \`calculationAst\`를 분리하고, 최종 JSON에는 body/cost/cooldown/scalings/rankValues/conditions/unresolved를 저장한다. 다음 우선순위는 교차 스킬 참조, EffectAlias, 재귀 FormulaPart, 조건식 순이다.\n\n` +
    `## 한계\n\n` +
    `lol.ps 서버 내부 코드는 공개되어 있지 않아 구현 자체를 증명할 수는 없다. 이 보고서는 공개 API 출력과 Riot 계열 정적 데이터의 전수 비교로 동작 규칙을 추론한다. 중국어 파서의 계수 표시 라벨은 아직 제품 언어 타입에 포함되지 않아 수치 비교에는 영향이 없지만 최종 UI 현지화 시 별도 번역이 필요하다.\n\n` +
    `## 출처 및 주장 원장\n\n` +
    `- [lol.ps Corki basic-info API](https://lol.ps/api/champ/42/basic-info.json): Us/Kr/Cn 필드와 완성 문자열 확인, 2026-09-04 접근.\n` +
    `- [Riot Data Dragon 문서](https://developer.riotgames.com/docs/lol#data-dragon): 버전·locale URL 규칙, 변수와 effectBurn 해석, Riot Games, 2026-09-04 접근.\n` +
    `- [Data Dragon 언어 목록](https://ddragon.leagueoflegends.com/cdn/languages.json): 현재 locale 가용성, Riot Games, 2026-09-04 접근.\n` +
    `- [CommunityDragon 중국어 Corki 데이터](https://raw.communitydragon.org/16.17/plugins/rcp-be-lol-game-data/global/zh_cn/v1/champions/42.json): dynamicDescription, cost, cooldown 현지화 확인, 2026-09-04 접근.\n` +
    `- [CommunityDragon CDTB](https://github.com/CommunityDragon/CDTB): 게임 클라이언트 파일 추출 경로, CommunityDragon.\n` +
    `- [calcrev 계산 구조](https://github.com/moonshadow565/calcrev/blob/master/calc_ida.h): 재귀 계산 노드 구조의 역공학 근거, moonshadow565.\n`;
  await Promise.all([
    fs.writeFile(path.join(reportRoot, "lolps-tooltip-analysis.md"), report),
    fs.writeFile(path.join(reportRoot, "report-source.md"), report),
  ]);
  console.log(`lol.ps: ${lolpsById.size}/${champions.length}`);
  console.log(`spells: ${spells.length}, tokens: ${tokens.length}`);
  console.log(`resolved: ${resolved.length}, unresolved: ${unresolved.length}`);
  console.log(`matched numeric signatures: ${matched.length}/${resolved.length}`);
  console.log(`cross-locale numeric consistency: ${aggregate.crossLocaleNumericConsistent}/${crossLocale.length}`);
}

await main();
