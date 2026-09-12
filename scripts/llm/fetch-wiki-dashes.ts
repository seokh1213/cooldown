/**
 * 스킬별 대시 판정을 LoL Wiki 에서 받아 둔다.
 *
 * 그전에는 한국어 툴팁을 정규식으로 훑어 "이동기" 를 추정했다. 그 방식은 끝이 없었다.
 * "적에게 날아가는 여우불"(투사체), "아군이 쓰레쉬에게 돌진합니다"(아군이 이동),
 * "돌진하는 적을 막습니다"(남의 돌진을 막는 쪽)가 전부 같은 낱말로 걸렸고,
 * 하나를 고치면 다른 하나가 깨졌다.
 *
 * 위키는 대시를 **템플릿으로 표시**한다. `{{tip|dash}}`, `{{tip|dashes}}`,
 * `{{tip|dash|swings}}` 처럼 감싸 두므로 낱말을 추정할 필요가 없다.
 * 뽀삐 W 는 "can only block a single dash" 라고 평문으로만 적혀 템플릿이 없다.
 * 즉 **표시가 있으면 대시고 없으면 아니다.**
 *
 * 누가 움직이는지도 영어 원문이 한국어보다 규칙적이다. 아군이 움직이는 스킬만
 * 따로 가려내고 나머지는 시전자로 본다.
 *
 * 사용: npm run llm:fetch-dashes [-- --limit 5]
 */
import * as fs from "fs";
import * as path from "path";
import { fetchChampionAbilities, fetchChampionSkillNames } from "../oracle/fandom";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

export const DASH_FILE = "ability-dashes.json";

export interface AbilityDash {
  /** 이 스킬로 대시가 발생하는가. 뽀삐 W 처럼 남의 대시를 막기만 하면 false. */
  dash: boolean;
  /** 대시하는 것이 시전자 본인인가. 쓰레쉬 W 는 아군이 움직이므로 false. */
  self: boolean;
  /** 속박(Grounded)으로 막히는 스킬인지. 위키가 따로 표시한다. */
  grounded?: boolean;
}

export interface AbilityDashFile {
  schemaVersion: 1;
  patch: string;
  source: string;
  license: string;
  fetchedAt: string;
  /** "Yasuo:E" → 판정 */
  abilities: Record<string, AbilityDash>;
}

/** `{{tip|dash}}`, `{{tip|dashes}}`, `{{tip|dash|swings}}` 를 모두 잡는다. */
const DASH_TIP = /\{\{tip\|dash(?:es|ing)?(?:\|[^}]*)?\}\}/gi;
function descriptionLines(wikitext: string): string[] {
  return [...wikitext.matchAll(/^\s*\|\s*(?:blurb|description)\d*\s*=\s*(.*)$/gim)]
    .map((m) => m[1].trim())
    .filter(Boolean);
}

function fieldIsTrue(wikitext: string, field: string): boolean {
  const match = new RegExp(`^\\s*\\|\\s*${field}\\s*=\\s*(.*)$`, "im").exec(wikitext);
  return Boolean(match && /^true$/i.test(match[1].trim()));
}

/**
 * 누가 대시하는가.
 *
 * 대시 표시에 **가장 가까운 앞선 주체**가 그 대시의 주인이다.
 *
 *   Thresh  "<b>Thresh</b> and the first allied champion ... An ally can select the lantern
 *            while in proximity of it, {{tip|dash}} ..."
 *           → 굵은 이름이 앞에 있지만 더 가까운 주체는 "An ally" 다. 아군이 움직인다.
 *   Rakan   "<b>Rakan</b> shields the target allied champion, then {{tip|dash|dashes}} to them"
 *           → "the target allied champion" 은 목적어다. 부정관사 없는 형태는 주체로 세지 않는다.
 *   Poppy   "Enemies that {{tip|dash}} within the aura are dealt damage"
 *           → 적의 대시를 막는 쪽이다. 이 스킬이 일으키는 대시가 아니므로 제외한다.
 */
type DashActor = "self" | "ally" | "enemy";

/** 부정관사가 붙은 형태만 주체로 센다. "the target allied champion" 은 목적어다. */
const ALLY_SUBJECT = /\b(an?\s+all(?:y|ied)|allies)\b/gi;
const ENEMY_SUBJECT = /\b(enem(?:y|ies)|opponents?)\b/gi;

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classifyDash(line: string, championName: string): DashActor | null {
  const tip = new RegExp(DASH_TIP.source, "i").exec(line);
  if (!tip) return null;
  const at = tip.index;
  const name = escapeRe(championName);
  const bold = new RegExp(`'''${name}'''|\\{\\{ci\\|${name}`, "gi");

  let best = -1;
  let actor: DashActor = "self";
  const consider = (source: RegExp, value: DashActor) => {
    for (const match of line.matchAll(new RegExp(source.source, "gi"))) {
      const index = match.index ?? 0;
      if (index < at && index > best) {
        best = index;
        actor = value;
      }
    }
  };
  consider(bold, "self");
  consider(ALLY_SUBJECT, "ally");
  consider(ENEMY_SUBJECT, "enemy");

  // 앞에 아무 주체도 없으면 시전자가 주어를 생략한 것으로 본다.
  return best < 0 ? "self" : actor;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const limitArg = argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(argv[limitArg + 1]) : undefined;

  const patch = resolvePatchVersion();
  const championDir = path.join(PUBLIC_DATA_ROOT, patch, "champions", "en_US");
  const ours = fs
    .readdirSync(championDir)
    .filter((file) => file.endsWith(".json") && file !== "index.json")
    .map((file) => file.replace(/\.json$/, ""))
    .sort();

  console.log(`대상 챔피언 ${ours.length}종, 위키 스킬 이름표 수집 중…`);
  const skillNames = await fetchChampionSkillNames();

  const abilities: Record<string, AbilityDash> = {};
  const missing: string[] = [];
  let done = 0;
  for (const id of ours) {
    if (limit && done >= limit) break;
    const entry = skillNames.get(id);
    if (!entry) {
      missing.push(id);
      continue;
    }
    const fetched = await fetchChampionAbilities(entry.wikiName, entry.skills);
    for (const ability of fetched) {
      const slot = ability.slot === "I" ? "P" : ability.slot;
      const lines = descriptionLines(ability.wikitext);
      const actors = lines
        .map((line) => classifyDash(line, entry.wikiName))
        .filter((actor): actor is DashActor => actor !== null);
      // 적의 대시를 막기만 하는 스킬(뽀삐 W)은 대시 스킬이 아니다.
      const caused = actors.filter((actor) => actor !== "enemy");
      if (caused.length === 0) continue;
      abilities[`${id}:${slot}`] = {
        dash: true,
        self: caused.includes("self"),
        ...(fieldIsTrue(ability.wikitext, "grounded") ? { grounded: true } : {}),
      };
    }
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${ours.length}`);
  }

  const out: AbilityDashFile = {
    schemaVersion: 1,
    patch,
    source: "https://leagueoflegends.fandom.com/",
    license: "CC BY-SA 3.0",
    fetchedAt: new Date().toISOString(),
    abilities,
  };
  const file = path.join(PUBLIC_DATA_ROOT, patch, "llm", DASH_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2), "utf8");

  const selfCount = Object.values(abilities).filter((a) => a.self).length;
  console.log(
    `\n생성: ${path.relative(process.cwd(), file)} ` +
      `(대시 ${Object.keys(abilities).length}건, 그중 본인 이동 ${selfCount}건)`,
  );
  if (missing.length) console.log(`위키에서 못 찾은 챔피언 ${missing.length}종: ${missing.join(", ")}`);
}

main();
