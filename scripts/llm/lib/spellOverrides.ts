/**
 * 툴팁에 안 적힌 것을 사람이 채운다
 *
 * 효과 태그는 한국어 툴팁에서 규칙으로 뽑는다. 뽑을 수 있는 것은 **툴팁이 말한
 * 것뿐**이고, 라이엇 툴팁은 상당수를 말하지 않는다.
 *
 *   애니 W   "화염파를 발사하여 … 피해를 입힙니다"   부채꼴 범위라는 말이 없다
 *   아무무 R  "붕대를 내던져 기절시키고"            주변 전체라는 말이 없다
 *   시비르 Q  "두 번 피해를 입힙니다"               물리라는 말이 없다
 *
 * 규칙을 더 넓히면 오독이 같이 늘어난다. 그 자리는 규칙이 아니라 **출처**로
 * 메워야 한다. 여기 적는 값은 전부 위키나 공식 자료에서 확인한 것이고, 무엇을
 * 보고 적었는지(`source`)와 왜 툴팁으로는 안 나오는지(`why`)를 함께 남긴다.
 *
 * 보정은 도출 **뒤에** 얹는다. 규칙이 나중에 그 값을 잡게 되면 보정은 아무 일도
 * 하지 않으므로, 규칙을 고칠 때 여기를 지울 필요가 없다.
 */
import * as fs from "fs";
import * as path from "path";
import type { DamageType } from "./facts";

export const SPELL_OVERRIDE_FILE = path.resolve(process.cwd(), "knowledge", "spell-effects.json");

export interface SpellOverride {
  /** 더할 효과 태그 */
  add?: string[];
  /** 잘못 붙은 것을 뺀다. 규칙을 못 고칠 때의 마지막 수단이다. */
  remove?: string[];
  /** 피해 유형. 툴팁이 유형을 안 밝힌 스킬에만 쓴다. */
  damageTypes?: DamageType[];
  /**
   * 사람이 보고 **정말 비어 있다**고 확인한 자리.
   *
   * 신드라 Q 처럼 단일 대상 피해만 주는 스킬은 태그가 없는 것이 맞다. 그것을
   * 적어 두지 않으면 다음 점검 때 같은 자리를 또 묻게 된다. 이 표시가 있으면
   * 구멍 목록에서 빠진다.
   */
  confirmedEmpty?: boolean;
  /**
   * 피해를 입히지 않는다고 확인한 자리.
   *
   * 클레드 P 의 "기본 공격은 감소한 피해를 입힙니다" 는 평타 이야기이고, 라이즈 R 의
   * "과부하 사용 시 추가 피해" 는 Q 의 피해다. 스스로 내는 피해가 아니므로 유형이
   * 비어 있는 것이 맞다.
   */
  confirmedNoDamage?: boolean;
  /** 툴팁으로는 왜 안 나오는가 */
  why: string;
  /** 무엇을 보고 적었는가 */
  source: string;
}

/** 키는 `<ChampionId>:<슬롯>` 이다. 예: `Annie:W` */
export type SpellOverrides = Record<string, SpellOverride>;

export function loadSpellOverrides(file = SPELL_OVERRIDE_FILE): SpellOverrides {
  if (!fs.existsSync(file)) return {};
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { overrides?: SpellOverrides };
  return parsed.overrides ?? {};
}
