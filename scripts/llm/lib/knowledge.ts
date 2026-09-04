/**
 * 큐레이션 지식(사람이 검증한 팁) 로더
 *
 * knowledge/tips/*.json — 파일 하나가 챔피언 하나(또는 주제 하나)를 담는다.
 * 데이터에서 자동 도출할 수 없는 "왜/언제" 지식(룬 선택 이유, 라인 운영, 메타)을 담는 계층.
 */
import * as fs from "fs";
import * as path from "path";

export type TipPerspective = "playing" | "against";

export interface CuratedTip {
  id: string;
  /** 이 팁의 주체 챔피언 id (예: MonkeyKing) */
  champion: string;
  /** 시점: 이 챔피언을 플레이할 때 / 이 챔피언을 상대할 때 */
  perspective: TipPerspective;
  /** 특정 상대에게만 유효하면 지정 */
  vs?: string;
  lane?: "top" | "jungle" | "mid" | "bot" | "support";
  /** 분류: rune | item | summoner | laning | teamfight | skill | build-order | general */
  category: string;
  text: string;
  /** 본문이 권장하는 게임 내 고유명사 (검증기가 데이터와 대조) */
  refs?: { items?: string[]; runes?: string[]; summoners?: string[] };
  /** 본문이 비교 대상으로만 언급하거나 피하라고 한 이름 (권장안에서 제외) */
  avoid?: { items?: string[]; runes?: string[]; summoners?: string[] };
  /** 출처/작성자 메모 */
  source?: string;
  /** 검증된 패치 (예: 26.17). 오래된 팁은 프롬프트에서 표기 */
  verifiedPatch?: string;
}

export interface CuratedTipFile {
  champion: string;
  tips: Array<Omit<CuratedTip, "champion" | "id"> & { id?: string }>;
}

export const KNOWLEDGE_ROOT = path.resolve(process.cwd(), "knowledge", "tips");

export function loadCuratedTips(root = KNOWLEDGE_ROOT): CuratedTip[] {
  if (!fs.existsSync(root)) return [];
  const tips: CuratedTip[] = [];
  for (const file of fs.readdirSync(root).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as CuratedTipFile;
    parsed.tips.forEach((tip, index) => {
      tips.push({
        ...tip,
        champion: parsed.champion,
        id: tip.id ?? `${parsed.champion}-${index + 1}`,
      });
    });
  }
  return tips;
}

export interface TipQuery {
  me: string;
  enemy: string;
  lane?: string;
}

/**
 * me 를 플레이하며 enemy 를 상대할 때 유효한 팁만 고른다.
 * - me 시점 팁: perspective=playing, vs 없음 또는 vs=enemy
 * - enemy 를 상대하는 팁: perspective=against, vs 없음 또는 vs=me
 * 상대 지정(vs) 팁이 일반 팁보다 앞에 오도록 정렬한다.
 */
export function selectTips(tips: CuratedTip[], q: TipQuery): CuratedTip[] {
  const laneOk = (tip: CuratedTip) => !tip.lane || !q.lane || tip.lane === q.lane;
  const picked = tips.filter((tip) => {
    if (!laneOk(tip)) return false;
    if (tip.champion === q.me && tip.perspective === "playing") {
      return !tip.vs || tip.vs === q.enemy;
    }
    if (tip.champion === q.enemy && tip.perspective === "against") {
      return !tip.vs || tip.vs === q.me;
    }
    return false;
  });
  return picked.sort((a, b) => Number(!!b.vs) - Number(!!a.vs));
}

export function tipsToText(tips: CuratedTip[], currentPatch?: string): string {
  if (tips.length === 0) return "(등록된 검증 팁 없음)";
  return tips
    .map((tip) => {
      const scope = tip.vs ? `상대 ${tip.vs} 한정` : "일반";
      const stale =
        tip.verifiedPatch && currentPatch && tip.verifiedPatch !== currentPatch
          ? `, ${tip.verifiedPatch} 패치 기준이므로 변동 가능`
          : "";
      return `- [${tip.category}; ${scope}${stale}] ${tip.text}`;
    })
    .join("\n");
}
