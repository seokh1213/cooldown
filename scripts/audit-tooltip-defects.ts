/**
 * 배포 산출물에서 "조용히 깨진" 툴팁을 찾는다.
 *
 * 미해석 토큰은 생성기 진단이 이미 잡아 준다. 여기서는 진단에 안 잡히면서
 * 결과물만 이상해지는 유형을 본다. 렌더 잔재, 문장 구조 파손, 수치 이상,
 * 그리고 로케일 간 숫자 불일치다.
 *
 * 로케일 검사가 핵심이다. 우리는 언어 중립으로 한 번 계산해 세 언어 템플릿에
 * 주입하므로 숫자 집합은 반드시 같아야 한다. 다르면 계산이 아니라 렌더 쪽 결함이다.
 *
 * 사용: tsx scripts/audit-tooltip-defects.ts [--json out.json]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { patchVersion } = JSON.parse(
  await fs.readFile(path.join(projectRoot, "public/data/version.json"), "utf8"),
) as { patchVersion: string };
const dataRoot = path.join(projectRoot, "public/data", patchVersion);

const LOCALES = ["ko_KR", "en_US", "zh_CN"] as const;
const SLOTS = ["Q", "W", "E", "R"] as const;

interface AbilityV2 {
  id?: string;
  bodyHtml?: string;
  rankValues?: Array<{ label: string; values: string }>;
  diagnostics?: { unresolvedTokens?: string[] };
}

interface ChampionFileV2 {
  champion: { id: string; abilities?: Record<string, AbilityV2> };
}

interface Finding {
  kind: string;
  champion: string;
  slot: string;
  locale?: string;
  detail: string;
}

const findings: Finding[] = [];
const add = (f: Finding): void => {
  findings.push(f);
};

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ");
}

function plain(text: string): string {
  return stripTags(text).replace(/\s+/g, " ").trim();
}

/**
 * 태그를 공백 없이 지운다.
 * 화면에서는 `<span>피해</span>를` 가 "피해를" 로 붙어 보이므로,
 * 조사·구두점 인접 검사는 이 형태로 해야 한다.
 */
function rendered(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numbersOf(text: string): string[] {
  return [...plain(text).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
}

/** 렌더 후에도 남으면 안 되는 원본 마커 */
function findLeftovers(body: string): string[] {
  const hits: string[] = [];
  if (/[{}]/.test(body)) hits.push("중괄호 잔재");
  if (/@[A-Za-z_][A-Za-z0-9_.]*@/.test(body)) hits.push("@토큰@ 잔재");
  if (/%i:/.test(body)) hits.push("아이콘 토큰 잔재");
  if (/\bNaN\b|\bInfinity\b|undefined|null/.test(plain(body))) hits.push("잘못된 값 문자열");
  return hits;
}

/** 문장 구조가 깨진 흔적 */
function findBrokenText(body: string): string[] {
  const text = rendered(body);
  const hits: string[] = [];
  // 이/가/와/과 는 관형사·접속사로도 쓰여 거짓 양성이 많다. 목적격 조사만 본다.
  if (/\s(를|을|에게)\s/.test(text)) hits.push("명사 빠진 조사");
  if (/\(\s*\)/.test(text)) hits.push("빈 괄호");
  if (/[,.]{2,}/.test(text)) hits.push("연속 구두점");
  if (/\s+[,.]/.test(text)) hits.push("구두점 앞 공백");

  const open = (text.match(/\(/g) ?? []).length;
  const close = (text.match(/\)/g) ?? []).length;
  if (open !== close) hits.push(`괄호 짝 불일치 (${open}/${close})`);

  // 빈 강조 구간: <span ...></span>
  if (/<span[^>]*>\s*<\/span>/.test(body)) hits.push("빈 강조 구간");
  return hits;
}

/** 수치 자체가 수상한 경우 */
function findSuspiciousNumbers(body: string): string[] {
  const text = plain(body);
  const hits: string[] = [];

  for (const match of text.matchAll(/(\d+(?:\.\d+)?)%/g)) {
    const value = Number.parseFloat(match[1]);
    // 배율 계수를 잘못 ×100 하면 수천 %가 나온다
    if (value >= 1000) hits.push(`과대 퍼센트 ${match[0]}`);
  }
  for (const match of text.matchAll(/\d+\.\d{4,}/g)) {
    hits.push(`소수점 과다 ${match[0]}`);
  }
  // "0/0/0/0/0" 처럼 전부 0인 랭크 값
  for (const match of text.matchAll(/\b0(?:\/0){2,}\b/g)) {
    hits.push(`전부 0인 랭크값 ${match[0]}`);
  }
  return [...new Set(hits)];
}

const championFiles = (await fs.readdir(path.join(dataRoot, "champions/ko_KR")))
  .filter((file) => file.endsWith(".json"))
  .sort();

for (const file of championFiles) {
  const championId = file.replace(/\.json$/, "");

  const byLocale = new Map<string, ChampionFileV2>();
  for (const locale of LOCALES) {
    try {
      byLocale.set(
        locale,
        JSON.parse(
          await fs.readFile(path.join(dataRoot, "champions", locale, file), "utf8"),
        ) as ChampionFileV2,
      );
    } catch {
      // 해당 로케일 파일이 없으면 그 로케일 검사는 건너뛴다
    }
  }

  for (const slot of SLOTS) {
    const perLocaleNumbers = new Map<string, string[]>();

    for (const locale of LOCALES) {
      const ability = byLocale.get(locale)?.champion?.abilities?.[slot];
      if (!ability?.bodyHtml) continue;
      const body = ability.bodyHtml;

      for (const detail of findLeftovers(body)) {
        add({ kind: "렌더 잔재", champion: championId, slot, locale, detail });
      }
      for (const detail of findBrokenText(body)) {
        add({ kind: "문장 파손", champion: championId, slot, locale, detail });
      }
      for (const detail of findSuspiciousNumbers(body)) {
        add({ kind: "수치 이상", champion: championId, slot, locale, detail });
      }

      perLocaleNumbers.set(locale, numbersOf(body).sort());
    }

    // 언어 중립 계산이므로 숫자 집합은 세 로케일이 같아야 한다
    if (perLocaleNumbers.size >= 2) {
      const [reference, ...rest] = [...perLocaleNumbers.entries()];
      for (const [locale, numbers] of rest) {
        const a = new Set(reference[1]);
        const b = new Set(numbers);
        const onlyRef = [...a].filter((n) => !b.has(n));
        const onlyOther = [...b].filter((n) => !a.has(n));
        if (onlyRef.length > 0 || onlyOther.length > 0) {
          add({
            kind: "로케일 간 숫자 불일치",
            champion: championId,
            slot,
            locale: `${reference[0]} vs ${locale}`,
            detail: `${reference[0]}만: [${onlyRef.slice(0, 5).join(", ")}] / ${locale}만: [${onlyOther.slice(0, 5).join(", ")}]`,
          });
        }
      }
    }
  }
}

const byKind = new Map<string, Finding[]>();
for (const finding of findings) {
  const list = byKind.get(finding.kind) ?? [];
  list.push(finding);
  byKind.set(finding.kind, list);
}

console.log(`=== 침묵 결함 점검 (패치 ${patchVersion}) ===`);
console.log(`챔피언 ${championFiles.length}명 / 로케일 ${LOCALES.length}개\n`);

if (findings.length === 0) {
  console.log("발견된 문제 없음");
}

for (const [kind, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const detailCounts = new Map<string, number>();
  for (const finding of list) {
    const key = finding.detail.replace(/\d+(\.\d+)?/g, "N");
    detailCounts.set(key, (detailCounts.get(key) ?? 0) + 1);
  }
  console.log(`## ${kind}: ${list.length}건`);
  for (const [detail, count] of [...detailCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${count.toString().padStart(4)}  ${detail}`);
  }
  for (const finding of list.slice(0, 6)) {
    console.log(
      `     예) ${finding.champion} ${finding.slot}${finding.locale ? ` [${finding.locale}]` : ""}: ${finding.detail}`,
    );
  }
  console.log();
}

const jsonIndex = process.argv.indexOf("--json");
if (jsonIndex >= 0 && process.argv[jsonIndex + 1]) {
  await fs.writeFile(process.argv[jsonIndex + 1], JSON.stringify(findings, null, 2));
  console.log(`상세 저장: ${process.argv[jsonIndex + 1]}`);
}
