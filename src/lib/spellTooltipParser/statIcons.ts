/**
 * 계산해서 만든 스탯 항 옆에 붙이는 스탯 아이콘.
 *
 * 게임 안 툴팁도 "60% 공격력" 앞에 검 모양 아이콘을 붙여 어떤 스탯인지
 * 한눈에 보이게 한다. 같은 아이콘이 CommunityDragon 에 개별 PNG 로 있어
 * 그대로 가져다 쓴다. 파일 하나가 150~460 바이트다.
 *
 * 정적 데이터에는 `[[si:scalead]]` 같은 짧은 자리 표시만 남기고 실제
 * `<img>` 는 그릴 때 만든다. 200 자짜리 URL 을 4천 군데에 박아 두면
 * 챔피언 데이터가 0.8MB 늘어나는데, 이 파일들은 30분마다 다시 커밋된다.
 *
 * 패치를 고정하지 않고 `latest` 를 쓴다. 스탯 아이콘은 패치별 데이터가
 * 아니라 UI 글리프라 값이 바뀌지 않고, CommunityDragon 이 오래된 패치를
 * 정리하면 고정 URL 쪽이 오히려 404 가 된다.
 */
const ICON_BASE =
  "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/fonts/texticons/lol/statsicon/";

/**
 * 아이콘 자리 표시.
 *
 * 원문 아이콘(`%i:...%`)과 같은 `%` 표기를 쓰면 남은 `%` 를 지우는 정리
 * 규칙에 먹힌다. 정리 단계가 건드리지 않는 대괄호 표기를 쓴다.
 */
const STAT_ICON_TOKEN = /\[\[si:([a-z]+)]]/g;

const ICON_CLASS =
  "inline-block h-[1em] w-[1em] align-[-0.15em] mr-[0.15em]";

export function statIconToken(icon: string | undefined): string {
  return icon ? `[[si:${icon}]]` : "";
}

/** 자리 표시를 실제 `<img>` 로 바꾼다 (툴팁 HTML 전용) */
export function renderStatIconTokens(text: string): string {
  return text.replace(
    STAT_ICON_TOKEN,
    (_match, icon: string) =>
      `<img src="${ICON_BASE}${icon}.png" alt="" class="${ICON_CLASS}" />`,
  );
}

/** HTML 이 아닌 곳(레벨별 수치 목록 등)에서는 자리 표시를 지운다 */
export function stripStatIconTokens(text: string): string {
  return text.replace(STAT_ICON_TOKEN, "");
}
