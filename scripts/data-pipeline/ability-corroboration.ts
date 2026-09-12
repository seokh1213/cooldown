/**
 * 스킬 값 불일치의 제3자 판정
 *
 * 검증은 DDragon(배포하는 값)과 CDragon character bin(교차 확인)을 맞대 본다.
 * 그런데 밸런스 패치가 오면 두 원본이 갈라지는 일이 흔하다. 26.18 에서 카시오페아 E 비용,
 * 에코 Q 비용, 세라핀 E 쿨, 신드라 W 쿨이 그랬고 CI 가 이틀 넘게 멈춰 있었다.
 *
 * **패치마다 사람이 허용 목록을 갱신하는 구조는 자동이 아니다.** 그래서 불일치가 났을 때만
 * 세 번째 원본인 게임 클라이언트 데이터(rcp-be-lol-game-data)를 확인한다.
 * 배포하는 값이 클라이언트 데이터와 같으면 우리 쪽 문제가 아니므로 통과시키고,
 * 어느 쪽과도 맞지 않으면 그대로 실패시킨다.
 *
 * 불일치가 난 스킬만 조회하므로 평소에는 요청이 아예 없다.
 */
import type { StaticDataSources } from "../../src/data/contracts/staticData";
import type { AbilityValidationIssue, ChampionById } from "./ability-validation";

const SLOT_INDEX: Record<string, number> = { Q: 0, W: 1, E: 2, R: 3 };

interface ClientSpell {
  cooldownCoefficients?: number[];
  costCoefficients?: number[];
}

interface ClientChampion {
  spells?: ClientSpell[];
}

function clientUrl(cdragonVersion: string, championKey: string): string {
  return (
    `https://raw.communitydragon.org/${cdragonVersion}/plugins/` +
    `rcp-be-lol-game-data/global/default/v1/champions/${championKey}.json`
  );
}

/** 클라이언트 배열은 랭크 수보다 길고 마지막 값이 반복된다. 앞에서부터 맞춰 본다. */
function matchesRanks(source: number[] | undefined, expected: number[]): boolean {
  if (!source || expected.length === 0) return false;
  const candidates = [source.slice(0, expected.length), source.slice(1, expected.length + 1)];
  return candidates.some(
    (candidate) =>
      candidate.length === expected.length &&
      candidate.every((value, index) => Math.abs(value - expected[index]) < 0.0001),
  );
}

/**
 * 배포 값이 클라이언트 데이터로 뒷받침되는 불일치에 `corroborated` 를 채운다.
 *
 * 조회에 실패하면 뒷받침되지 않은 것으로 둔다. 확인하지 못한 것을 통과시키면
 * 검증이 있는 의미가 없다.
 */
export async function corroborateMismatches(
  issues: AbilityValidationIssue[],
  championsById: ChampionById,
  sources: StaticDataSources,
): Promise<void> {
  // 허용 목록에 있는 것도 확인한다. 그 목록은 특정 시점의 사진이라 그대로 두면 낡는다.
  // 이미 뒷받침되는 항목이 남아 있으면 나중에 같은 자리에서 진짜 문제가 나도 가려진다.
  const targets = issues.filter(
    (issue) =>
      (issue.kind === "cooldown-mismatch" || issue.kind === "cost-mismatch") &&
      issue.ddragonValues?.length,
  );
  if (targets.length === 0) return;

  const byChampion = new Map<string, AbilityValidationIssue[]>();
  for (const issue of targets) {
    const list = byChampion.get(issue.championId) ?? [];
    list.push(issue);
    byChampion.set(issue.championId, list);
  }

  for (const [championId, championIssues] of byChampion) {
    const key = championsById.get(championId)?.key;
    if (!key) continue;
    let client: ClientChampion;
    try {
      const response = await fetch(clientUrl(sources.cdragon, key));
      if (!response.ok) continue;
      client = (await response.json()) as ClientChampion;
    } catch {
      continue;
    }
    for (const issue of championIssues) {
      const spell = client.spells?.[SLOT_INDEX[issue.slot]];
      if (!spell) continue;
      const source =
        issue.kind === "cooldown-mismatch" ? spell.cooldownCoefficients : spell.costCoefficients;
      issue.clientValues = source;
      issue.corroborated = matchesRanks(source, issue.ddragonValues ?? []);
    }
  }
}
