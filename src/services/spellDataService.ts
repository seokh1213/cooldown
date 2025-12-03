import {ChampionSpell} from "@/types";
import {
  getCommunityDragonSpellData,
  CommunityDragonSpellResult,
} from "./api";
import { logger } from "@/lib/logger";

/**
 * 스킬 데이터 통합 인터페이스
 * Data Dragon과 Community Dragon 데이터를 통합한 최종 결과
 */
export interface SpellData {
  /** Data Dragon 스킬 데이터 */
  spell: ChampionSpell;
  /** Community Dragon 스킬 데이터 (DataValues, mSpellCalculations, mClientData 포함) */
  communityDragonData: Record<string, any>;
  /** 스킬 인덱스 (Q=0, W=1, E=2, R=3) */
  spellIndex: number;
  /** 기준이 된 DDragon 버전 (옵션) */
  ddragonVersion?: string | null;
  /** 실제 사용된 CDragon 버전 (옵션) */
  cdragonVersion?: string | null;
}

/**
 * 챔피언의 모든 스킬 데이터를 통합하여 반환
 * @param championId 챔피언 ID
 * @param spells Data Dragon 스킬 배열
 * @param version 게임 버전
 * @returns 통합된 스킬 데이터 배열
 */
export async function getIntegratedSpellData(
  championId: string,
  spells: ChampionSpell[],
  version: string
): Promise<SpellData[]> {
  // Community Dragon 데이터 가져오기 (에러 처리 포함)
  let communityDragonDataMap: Record<string, Record<string, any>> = {};
  let cdMeta: CommunityDragonSpellResult | null = null;
  
  try {
    cdMeta = await getCommunityDragonSpellData(championId, version);
    communityDragonDataMap = cdMeta.spellDataMap;
  } catch (error) {
    logger.warn(`Failed to load Community Dragon data for ${championId}:`, error);
    // 에러 발생 시 빈 객체 사용
  }

  // 각 스킬에 대해 통합 데이터 생성
  return spells.map((spell, index) => {
    // Community Dragon 데이터 찾기
    let communityDragonData: Record<string, any> = {};
    
    // 1. 스킬 인덱스로 직접 찾기 (Q=0, W=1, E=2, R=3)
    if (communityDragonDataMap[index.toString()]) {
      communityDragonData = communityDragonDataMap[index.toString()];
    } else {
      // 2. 스킬 ID로 찾기 시도
      const spellName = spell.id.replace(championId, "");
      for (const key of Object.keys(communityDragonDataMap)) {
        if (
          key.toLowerCase().includes(spellName.toLowerCase()) ||
          key.toLowerCase().includes(spell.id.toLowerCase())
        ) {
          communityDragonData = communityDragonDataMap[key];
          break;
        }
      }
    }

    return {
      spell,
      communityDragonData,
      spellIndex: index,
      ddragonVersion: cdMeta?.ddragonVersion ?? version,
      cdragonVersion: cdMeta?.cdragonVersion ?? null,
    };
  });
}

/**
 * 여러 챔피언의 스킬 데이터를 일괄로 가져오기
 * @param champions 챔피언 배열 (spells 필드 포함)
 * @param version 게임 버전
 * @returns 챔피언 ID를 키로 하는 통합 스킬 데이터 맵
 */
export async function getIntegratedSpellDataForChampions(
  champions: Array<{ id: string; spells?: ChampionSpell[] }>,
  version: string
): Promise<Record<string, SpellData[]>> {
  const result: Record<string, SpellData[]> = {};

  // 각 챔피언에 대해 병렬로 데이터 가져오기
  const promises = champions.map(async (champion) => {
    if (!champion.spells || champion.spells.length === 0) {
      result[champion.id] = [];
      return;
    }

    try {
      result[champion.id] = await getIntegratedSpellData(
        champion.id,
        champion.spells,
        version
      );
    } catch (error) {
      logger.warn(`Failed to get integrated spell data for ${champion.id}:`, error);
      // 에러 발생 시 빈 배열 반환
      result[champion.id] = champion.spells.map((spell, index) => ({
        spell,
        communityDragonData: {},
        spellIndex: index,
      }));
    }
  });

  await Promise.all(promises);
  return result;
}

