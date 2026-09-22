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

// 크기와 세로 자리는 `img.stat-icon` 이 정한다(`src/index.css`). 여기서 또 적으면
// 두 곳이 서로 다른 값을 들고 있게 된다.
const ICON_CLASS = "stat-icon inline-block mr-[0.15em]";

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

/**
 * 우리 전투 모델에 자리가 없는 스탯의 글리프.
 *
 * 글리프는 있는데 `StatKey` 가 없는 값들이다. 재사용 대기시간 감소는 게임에서
 * 스킬 가속으로 갈린 뒤로 우리 모델이 세지 않는데, 옛 아이템 글에는 아직 남아 있다.
 * 스킬 가속 글리프를 빌려 쓰면 다른 값을 같은 것으로 보이게 하는 셈이라 따로 둔다.
 *
 * 열쇠는 **라이엇이 쓰는 영어 이름**이다. 세 언어 이름은 아이템 자료를 이어서 얻으므로
 * (`scripts/generate-stat-label-icons.ts`) 여기에 적을 것은 한 언어뿐이다.
 */
export const EXTRA_STAT_GLYPHS: Record<string, string> = {
  "cooldown reduction": "scalecooldown",
};

/** 스탯 글리프 주소. HTML 이 아니라 `<img>` 로 그리는 자리에서 쓴다. */
export function statIconUrl(icon: string): string {
  return `${ICON_BASE()}${icon}.webp`;
}

/**
 * 목록에 붙여 그릴 때 쓰는 class.
 *
 * 문장 속 글리프(`ICON_CLASS`)와 갈라 둔다. 목록은 어두운 바탕 칩을 씌워 밝은
 * 글리프도 흰 바탕에서 읽히게 하고, 문장 속은 칩 없이 테두리만 둘러 글을 무겁게
 * 하지 않는다.
 */
export const STAT_ICON_CLASS = `${ICON_CLASS} stat-icon-chip`;

/** HTML 이 아닌 곳(레벨별 수치 목록 등)에서는 자리 표시를 지운다 */
export function stripStatIconTokens(text: string): string {
  return text.replace(STAT_ICON_TOKEN, "");
}
