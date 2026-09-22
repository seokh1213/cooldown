/**
 * 계산해서 만든 스탯 항 옆에 붙이는 스탯 아이콘.
 *
 * 게임 안 툴팁도 "60% 공격력" 앞에 검 모양 아이콘을 붙여 어떤 스탯인지
 * 한눈에 보이게 한다. 아이템 능력치 줄도 같은 값을 말하므로 같은 글리프를 쓴다.
 *
 * 정적 데이터에는 `[[si:scalead]]` 같은 짧은 자리 표시만 남기고 실제
 * `<img>` 는 그릴 때 만든다. 200 자짜리 URL 을 4천 군데에 박아 두면
 * 챔피언 데이터가 0.8MB 늘어나는데, 이 파일들은 30분마다 다시 커밋된다.
 *
 * 그림은 **우리 자리**에서 온다. CommunityDragon 을 직접 보던 마지막 아이콘이었다 —
 * 서비스워커가 맡지 못해 볼 때마다 밖으로 나갔고, 그쪽이 흔들리면 툴팁의 계수 항이
 * 통째로 빈다. 스물다섯 장에 6KB뿐이라 함께 받아 둔다.
 *
 * 판본 밖에 둔다. 패치별 자료가 아니라 UI 글리프라 값이 바뀌지 않는다.
 *
 * 주소를 상수가 아니라 함수로 짓고 바탕 경로가 없을 때를 둔다. 이 파일은 시험이
 * Node 에서도 부르는데 거기에는 `import.meta.env` 가 없다. 시험이 보는 것은 `<img>`
 * 를 만들었는지 여부이지 주소가 아니다.
 */
const ICON_BASE = () => `${(import.meta.env as ImportMetaEnv | undefined)?.BASE_URL ?? "/"}img/stat/`;

/**
 * 아이콘 자리 표시.
 *
 * 원문 아이콘(`%i:...%`)과 같은 `%` 표기를 쓰면 남은 `%` 를 지우는 정리
 * 규칙에 먹힌다. 정리 단계가 건드리지 않는 대괄호 표기를 쓴다.
 */
const STAT_ICON_TOKEN = /\[\[si:([a-z]+)]]/g;

const ICON_CLASS =
  "stat-icon inline-block h-[1em] w-[1em] align-[-0.15em] mr-[0.15em]";

export function statIconToken(icon: string | undefined): string {
  return icon ? `[[si:${icon}]]` : "";
}

/** 자리 표시를 실제 `<img>` 로 바꾼다 (툴팁 HTML 전용) */
export function renderStatIconTokens(text: string): string {
  return text.replace(
    STAT_ICON_TOKEN,
    (_match, icon: string) =>
      `<img src="${ICON_BASE()}${icon}.webp" alt="" decoding="async" class="${ICON_CLASS}" />`,
  );
}

/** 스탯 글리프 주소. HTML 이 아니라 `<img>` 로 그리는 자리에서 쓴다. */
export function statIconUrl(icon: string): string {
  return `${ICON_BASE()}${icon}.webp`;
}

/** 붙여 그릴 때 쓰는 공통 class. 글자 크기를 따라간다. */
export const STAT_ICON_CLASS = ICON_CLASS;

/** HTML 이 아닌 곳(레벨별 수치 목록 등)에서는 자리 표시를 지운다 */
export function stripStatIconTokens(text: string): string {
  return text.replace(STAT_ICON_TOKEN, "");
}
